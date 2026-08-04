import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();

const allowedOrigins = ['https://geminiapichatbot.netlify.app'];

if (process.env.NODE_ENV !== 'production') {
	app.use(cors());
} else {
	app.use(
		cors({
			origin: allowedOrigins,
		}),
	);
}

app.use(express.json());

const client = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

app.post('/chat', async (req, res) => {
	try {
		const { contents } = req.body;

		const input = contents
			.map((msg) =>
				msg.parts
					.filter((part) => part.text)
					.map((part) => `${msg.role}: ${part.text}`)
					.join('\n'),
			)
			.join('\n');

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

app.listen(3000, () => {
	console.log('Server running on port 3000');
});
