import crypto from 'node:crypto';

export const hashPassword = (
	password,
	salt = crypto.randomBytes(16).toString('hex'),
) => {
	const hash = crypto
		.pbkdf2Sync(password, salt, 100000, 64, 'sha512')
		.toString('hex');

	return {
		salt,
		hash,
	};
};

export const verifyPassword = (password, user) => {
	const { hash } = hashPassword(password, user.passwordSalt);

	const hashBuffer = Buffer.from(hash, 'hex');
	const storedHashBuffer = Buffer.from(user.passwordHash, 'hex');

	return (
		hashBuffer.length === storedHashBuffer.length &&
		crypto.timingSafeEqual(hashBuffer, storedHashBuffer)
	);
};
