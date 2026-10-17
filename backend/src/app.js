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

app.use(
	cors({
		origin: env.allowedOrigins.length ? env.allowedOrigins : true,
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
