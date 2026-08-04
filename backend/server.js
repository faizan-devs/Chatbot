import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();

app.use(
	cors({
		origin: [
			'http://localhost:5500',
			'http://127.0.0.1:5500',
			'https://geminiapichatbot.netlify.app',
		],
	}),
);
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

		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.setHeader('Transfer-Encoding', 'chunked');

		for await (const event of stream) {
			if (event.type === 'response.output_text.delta') {
				res.write(event.delta);
			}
		}

		res.end();
	} catch (err) {
		console.error(err);

		res.status(500).end(err.message);
	}
});

app.listen(3000, () => {
	console.log('Server running on port 3000');
});
