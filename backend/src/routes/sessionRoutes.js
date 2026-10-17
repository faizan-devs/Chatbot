import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
	try {
		res.json({
			sessions: await req.app.locals.db.getSessions(req.user.id),
		});
	} catch (error) {
		next(error);
	}
});

router.put('/', requireAuth, async (req, res, next) => {
	try {
		res.json({
			sessions: await req.app.locals.db.saveSessions(
				req.user.id,
				req.body.sessions,
			),
		});
	} catch (error) {
		next(error);
	}
});

router.patch('/:sessionId', requireAuth, async (req, res, next) => {
	try {
		const session = await req.app.locals.db.renameSession(
			req.user.id,
			req.params.sessionId,
			req.body.title,
		);

		if (!session) {
			return res.status(404).json({ message: 'Chat not found.' });
		}

		res.json({ session });
	} catch (error) {
		next(error);
	}
});

export default router;
