import {
	forgotPassword,
	getMe,
	login,
	resetPassword,
	signup,
} from '../services/authService.js';

const handleError = (res, error) => {
	res.status(error.status || 500).json({
		message: error.message || 'Something went wrong.',
	});
};

export const signupController = async (req, res) => {
	try {
		res.status(201).json(await signup(req.body, req.app.locals.db));
	} catch (error) {
		handleError(res, error);
	}
};

export const loginController = async (req, res) => {
	try {
		res.json(await login(req.body, req.app.locals.db));
	} catch (error) {
		handleError(res, error);
	}
};

export const meController = (req, res) => {
	res.json(getMe(req.user));
};

export const forgotPasswordController = async (req, res) => {
	try {
		res.json(
			await forgotPassword(
				req.body,
				req.app.locals.db,
				req.app.locals.sendPasswordResetEmail,
			),
		);
	} catch (error) {
		handleError(res, error);
	}
};

export const resetPasswordController = async (req, res) => {
	try {
		res.json(await resetPassword(req.body, req.app.locals.db));
	} catch (error) {
		handleError(res, error);
	}
};

export { forgotPassword, getMe, login, resetPassword, signup };
