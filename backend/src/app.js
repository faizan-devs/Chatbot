import express from 'express';
import cors from 'cors';

import env from './config/env.js';
import * as userQueries from './db/queries/userQueries.js';
import * as sessionQueries from './db/queries/sessionQueries.js';
import * as rateLimitQueries from './db/queries/rateLimitQueries.js';
import { sendPasswordResetEmail } from './services/emailService.js';

import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import limitRoutes from './routes/limitRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.set('trust proxy', 1);
app.locals.db = {
	...userQueries,
	...sessionQueries,
	...rateLimitQueries,
};
app.locals.sendPasswordResetEmail = sendPasswordResetEmail;

const allowedOrigins = [
	'http://localhost:5500',
	'http://127.0.0.1:5500',
	'http://localhost:65026',
	'http://127.0.0.1:65026',
	'https://aliceachatbot.netlify.app',
];

app.use(
	cors({
		origin(origin, callback) {
			// Allow requests without an Origin header.
			if (!origin) {
				return callback(null, true);
			}

			// Allow known development and production origins.
			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			}

			// Allow localhost and 127.0.0.1 on any port.
			try {
				const url = new URL(origin);

				const isLocalhost =
					url.protocol === 'http:' &&
					(url.hostname === 'localhost' || url.hostname === '127.0.0.1');

				if (isLocalhost) {
					return callback(null, true);
				}
			} catch {
				// Invalid origin: reject it.
			}

			console.error(`Rejected CORS origin: ${origin}`);
			return callback(new Error('Not allowed by CORS'));
		},
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	}),
);

app.use(express.json({ limit: '10mb' }));

app.use('/auth', authRoutes);
app.use('/sessions', sessionRoutes);
app.use('/chat', chatRoutes);
app.use('/limit-status', limitRoutes);
app.use('/', healthRoutes);

app.use((error, req, res, next) => {
	console.error(error);

	if (res.headersSent) {
		return next(error);
	}

	res.status(error.status || 500).json({
		message: error.message || 'Something went wrong.',
	});
});

export default app;
