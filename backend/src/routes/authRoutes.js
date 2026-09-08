import { Router } from 'express';

import {
	signupController,
	loginController,
	forgotPasswordController,
	resetPasswordController,
	meController,
} from '../controllers/authController.js';

import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/signup', signupController);

router.post('/login', loginController);

router.post('/forgot-password', forgotPasswordController);

router.post('/reset-password', resetPasswordController);

router.get('/me', requireAuth, meController);

export default router;
