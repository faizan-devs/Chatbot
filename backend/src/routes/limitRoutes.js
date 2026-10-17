import { Router } from 'express';
import env from '../config/env.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

const toIso = (timestamp) => new Date(timestamp).toISOString();

router.get('/', requireAuth, async (req, res, next) => {
	try {
		const record = await req.app.locals.db.getRateLimitRecord(req.user.id);

		res.json({
			limit: env.dailyMessageLimit,
			remaining: Math.max(env.dailyMessageLimit - record.count, 0),
			retryAt: toIso(record.resetAt),
		});
	} catch (error) {
		next(error);
	}
});

export default router;
