import env from '../config/env.js';
import {
	getRateLimitRecord,
	incrementRateLimit,
} from '../db/queries/rateLimitQueries.js';

const toIso = (timestamp) => new Date(timestamp).toISOString();

export const rateLimitChat = async (req, res, next) => {
	try {
		const record = await getRateLimitRecord(req.user.id);

		if (record.count >= env.dailyMessageLimit) {
			return res.status(429).json({
				message: 'Daily chat limit reached.',
				limit: env.dailyMessageLimit,
				retryAt: toIso(record.resetAt),
			});
		}

		await incrementRateLimit(req.user.id);

		next();
	} catch (error) {
		next(error);
	}
};
