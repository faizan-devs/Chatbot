import crypto from 'node:crypto';
import env from '../config/env.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encodeBase64Url = (value) =>
	Buffer.from(JSON.stringify(value)).toString('base64url');

export const signToken = (userId) => {
	const payload = {
		userId,
		expiresAt: Date.now() + TOKEN_TTL_MS,
	};

	const encodedPayload = encodeBase64Url(payload);

	const signature = crypto
		.createHmac('sha256', env.authSecret)
		.update(encodedPayload)
		.digest('base64url');

	return `${encodedPayload}.${signature}`;
};

export const verifyToken = (token) => {
	try {
		const [encodedPayload, signature] = String(token || '').split('.');

		if (!encodedPayload || !signature) {
			return null;
		}

		const expectedSignature = crypto
			.createHmac('sha256', env.authSecret)
			.update(encodedPayload)
			.digest('base64url');

		const valid = crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature),
		);

		if (!valid) return null;

		const payload = JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString(),
		);

		if (Date.now() > payload.expiresAt) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
};
