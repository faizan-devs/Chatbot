import { verifyToken } from '../utils/tokens.js';
import { findUserById } from '../db/queries/userQueries.js';

export const requireAuth = async (req, res, next) => {
	try {
		const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');

		const payload = verifyToken(token);

		if (!payload) {
			return res.status(401).json({
				message: 'Please log in first.',
			});
		}

		const user = await findUserById(payload.userId);

		if (!user) {
			return res.status(401).json({
				message: 'Please log in first.',
			});
		}

		req.user = user;

		next();
	} catch (error) {
		next(error);
	}
};
