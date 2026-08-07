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

app.post('/chat', async (req, res) => {
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
