import crypto from 'node:crypto';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const AUTH_SECRET =
	process.env.AUTH_SECRET || 'alice-local-development-secret-change-me';

const normalizeEmail = (email) =>
	String(email || '')
		.trim()
		.toLowerCase();

const hashPassword = (
	password,
	salt = crypto.randomBytes(16).toString('hex'),
) => {
	const hash = crypto
		.pbkdf2Sync(password, salt, 100000, 64, 'sha512')
		.toString('hex');

	return { salt, hash };
};

const verifyPassword = (password, user) => {
	const { hash } = hashPassword(password, user.passwordSalt);
	const hashBuffer = Buffer.from(hash, 'hex');
	const storedHashBuffer = Buffer.from(user.passwordHash, 'hex');

	return (
		hashBuffer.length === storedHashBuffer.length &&
		crypto.timingSafeEqual(hashBuffer, storedHashBuffer)
	);
};

const encodeBase64Url = (value) =>
	Buffer.from(JSON.stringify(value)).toString('base64url');

const signToken = (userId) => {
	const encodedPayload = encodeBase64Url({
		userId,
		expiresAt: Date.now() + TOKEN_TTL_MS,
	});
	const signature = crypto
		.createHmac('sha256', AUTH_SECRET)
		.update(encodedPayload)
		.digest('base64url');

	return `${encodedPayload}.${signature}`;
};

export const verifyToken = (token) => {
	try {
		const [encodedPayload, signature] = String(token || '').split('.');
		if (!encodedPayload || !signature) return null;

		const expectedSignature = crypto
			.createHmac('sha256', AUTH_SECRET)
			.update(encodedPayload)
			.digest('base64url');
		const signatureBuffer = Buffer.from(signature);
		const expectedSignatureBuffer = Buffer.from(expectedSignature);

		if (
			signatureBuffer.length !== expectedSignatureBuffer.length ||
			!crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
		) {
			return null;
		}

		const payload = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8'),
		);

		if (!payload.userId || Date.now() > payload.expiresAt) return null;
		return payload;
	} catch {
		return null;
	}
};

const publicUser = (user) => ({
	id: user.id,
	name: user.name,
	email: user.email,
});

export const signup = async ({ name, email, password }, db) => {
	const cleanName = String(name || '').trim();
	const cleanEmail = normalizeEmail(email);
	const cleanPassword = String(password || '');

	if (!cleanName || !cleanEmail || cleanPassword.length < 6) {
		const error = new Error(
			'Enter a name, email, and password with at least 6 characters.',
		);
		error.status = 400;
		throw error;
	}

	if (await db.findUserByEmail(cleanEmail)) {
		const error = new Error('An account already exists.');
		error.status = 409;
		throw error;
	}

	const { salt, hash } = hashPassword(cleanPassword);
	const user = await db.createUser({
		id: crypto.randomUUID(),
		name: cleanName,
		email: cleanEmail,
		passwordSalt: salt,
		passwordHash: hash,
	});

	return {
		user: publicUser(user),
		token: signToken(user.id),
	};
};

export const login = async ({ email, password }, db) => {
	const user = await db.findUserByEmail(normalizeEmail(email));

	if (!user || !verifyPassword(String(password || ''), user)) {
		const error = new Error('Invalid email or password.');
		error.status = 401;
		throw error;
	}

	return {
		user: publicUser(user),
		token: signToken(user.id),
	};
};

export const forgotPassword = async ({ email }, db, sendPasswordResetEmail) => {
	const cleanEmail = normalizeEmail(email);
	const user = await db.findUserByEmail(cleanEmail);
	let resetToken;
	let delivered = false;

	if (user) {
		resetToken = crypto.randomBytes(24).toString('hex');
		await db.setResetToken(user, resetToken, Date.now() + RESET_TOKEN_TTL_MS);
		({ delivered } = await sendPasswordResetEmail({
			email: cleanEmail,
			name: user.name,
			resetToken,
		}));
	}

	return {
		message: delivered
			? 'If this email exists, a password reset email was sent.'
			: 'If this email exists, a password reset token was generated.',
		devResetToken:
			process.env.NODE_ENV === 'production' ? undefined : resetToken,
	};
};

export const resetPassword = async ({ email, token, password }, db) => {
	const user = await db.findUserByEmail(normalizeEmail(email));

	if (
		!user ||
		!user.resetToken ||
		user.resetToken !== String(token || '').trim() ||
		Date.now() > user.resetTokenExpiresAt
	) {
		const error = new Error('Invalid or expired reset token.');
		error.status = 400;
		throw error;
	}

	if (String(password || '').length < 6) {
		const error = new Error('Password must be at least 6 characters.');
		error.status = 400;
		throw error;
	}

	const { salt, hash } = hashPassword(password);
	await db.updatePassword(user, salt, hash);

	return { message: 'Password updated. You can log in now.' };
};

export const getMe = (user) => ({ user: publicUser(user) });
