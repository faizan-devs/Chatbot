import 'dotenv/config';

import app from './src/app.js';
import pool, { initDatabase } from './src/config/database.js';
import env from './src/config/env.js';

const startServer = async () => {
	try {
		await initDatabase();
		await pool.query('SELECT 1');

		app.listen(env.port, () => {
			console.log(`Server running on port ${env.port}`);
			console.log('Database connected: postgres');
		});
	} catch (error) {
		console.error('Failed to start server:', error);
		process.exit(1);
	}
};

startServer();
