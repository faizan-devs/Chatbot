import pool from '../../config/database.js';

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const toMs = (value) => new Date(value).getTime();
const toIso = (timestamp) => new Date(timestamp).toISOString();

export const getRateLimitRecord = async (userId) => {
	const now = Date.now();
	const existing = await pool.query(
		'SELECT count, reset_at FROM rate_limits WHERE user_id = $1',
		[userId],
	);
	const row = existing.rows[0];

	if (!row || now >= toMs(row.reset_at)) {
		const resetAt = now + RATE_LIMIT_WINDOW_MS;

		await pool.query(
			`
			INSERT INTO rate_limits (user_id, count, reset_at)
			VALUES ($1, 0, $2)
			ON CONFLICT (user_id)
			DO UPDATE SET count = 0,
				reset_at = EXCLUDED.reset_at
			`,
			[userId, toIso(resetAt)],
		);

		return { count: 0, resetAt };
	}

	return {
		count: Number(row.count),
		resetAt: toMs(row.reset_at),
	};
};

export const incrementRateLimit = async (userId) => {
	await pool.query(
		'UPDATE rate_limits SET count = count + 1 WHERE user_id = $1',
		[userId],
	);
};
