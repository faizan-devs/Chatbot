import { Router } from 'express';
import OpenAI from 'openai';
import env from '../config/env.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { rateLimitChat } from '../middleware/rateLimitMiddleware.js';

const router = Router();
const client = new OpenAI({
	apiKey: env.openaiApiKey,
});

router.post('/', requireAuth, rateLimitChat, async (req, res, next) => {
	try {
		const { contents = [] } = req.body;
		const styleGuide =
			'You are Alice, a simple ChatGPT-style assistant. Answer in clean, readable paragraphs. Use bullet points only when they make the answer easier to scan or when the user asks for a list. Keep headings rare, short, and natural. Avoid long bullet-heavy formatting.';

		const conversation = contents
			.map((message) =>
				(message.parts || [])
					.filter((part) => part.text)
					.map((part) => `${message.role}: ${part.text}`)
					.join('\n'),
			)
			.join('\n');

		const stream = await client.responses.create({
			model: 'gpt-5-mini',
			input: `${styleGuide}\n\nConversation:\n${conversation}`,
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
	} catch (error) {
		if (res.headersSent) {
			res.write(
				`data: ${JSON.stringify(
					error.message || 'The assistant could not respond.',
				)}\n\n`,
			);
			res.write('data: [DONE]\n\n');
			return res.end();
		}

		next(error);
	}
});

export default router;
