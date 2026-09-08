import {
	signup,
	login,
	requestPasswordReset,
	resetPassword,
} from '../services/authService.js';

export const signupController = async (req, res, next) => {
	try {
		const result = await signup(req.body);

		res.status(201).json(result);
	} catch (error) {
		next(error);
	}
};

export const loginController = async (req, res, next) => {
	try {
		const result = await login(req.body);

		res.json(result);
	} catch (error) {
		next(error);
	}
};
