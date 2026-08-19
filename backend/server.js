import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins?.length) {
	app.use(
		cors({
			origin: allowedOrigins,
		}),
	);
} else {
	app.use(cors());
}

app.use(express.json());

const client = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

const DAILY_MESSAGE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const rateLimitStore = new Map();

const getDeviceKey = (req) =>
	req.get('x-device-id') ||
	req.ip ||
	req.socket.remoteAddress ||
	'unknown-device';

const getRateLimitRecord = (deviceKey) => {
	const now = Date.now();
	const existingRecord = rateLimitStore.get(deviceKey);

	if (!existingRecord || now >= existingRecord.resetAt) {
		const record = {
			count: 0,
			resetAt: now + RATE_LIMIT_WINDOW_MS,
		};
		rateLimitStore.set(deviceKey, record);
		return record;
	}

	return existingRecord;
};

const rateLimitChat = (req, res, next) => {
	const deviceKey = getDeviceKey(req);
	const record = getRateLimitRecord(deviceKey);

	if (record.count >= DAILY_MESSAGE_LIMIT) {
		return res.status(429).json({
			message: 'Daily chat limit reached.',
			limit: DAILY_MESSAGE_LIMIT,
			retryAt: new Date(record.resetAt).toISOString(),
		});
	}

	record.count += 1;
	next();
};

app.post('/chat', rateLimitChat, async (req, res) => {
	try {
		const { contents } = req.body;

		const styleGuide =
			'You are Alice, a simple ChatGPT-style assistant. Answer in clean, readable paragraphs. Use bullet points only when they make the answer easier to scan or when the user asks for a list. Keep headings rare, short, and natural. Avoid long bullet-heavy formatting.';

		const conversation = contents
			.map((msg) =>
				msg.parts
					.filter((part) => part.text)
					.map((part) => `${msg.role}: ${part.text}`)
					.join('\n'),
			)
			.join('\n');

		const input = `${styleGuide}\n\nConversation:\n${conversation}`;

		const stream = await client.responses.create({
			model: 'gpt-5-mini',
			input,
			stream: true,
		});

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');

		res.flushHeaders();

		for await (const event of stream) {
			if (event.type === 'response.output_text.delta') {
				res.write(`data: ${JSON.stringify(event.delta)}\n\n`);
			}
		}

		res.write('data: [DONE]\n\n');
		res.end();
	} catch (err) {
		console.error(err);

		res.status(500).end(err.message);
	}
});

app.get('/health', (req, res) => {
	console.log('Health check:', new Date().toISOString());

	res.json({
		status: 'OK',
	});
});

app.listen(3000, () => {
	console.log('Server running on port 3000');
});
