import express from 'express';
import cors from 'cors';

import env from './config/env.js';

import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import limitRoutes from './routes/limitRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.set('trust proxy', 1);

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

export default app;
