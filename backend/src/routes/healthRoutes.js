import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

router.get('/health', async (req, res) => {
	try {
		await pool.query('SELECT 1');

		res.json({
			status: 'OK',
			database: 'postgres',
		});
	} catch {
		res.status(503).json({
			status: 'ERROR',
			database: 'postgres',
		});
	}
});

export default router;
