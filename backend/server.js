import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins?.length) {
	app.use(cors({ origin: allowedOrigins }));
} else {
	app.use(cors());
}

app.use(express.json({ limit: '10mb' }));

const client = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

const DAILY_MESSAGE_LIMIT = Number(process.env.DAILY_MESSAGE_LIMIT || 5);
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const AUTH_SECRET =
	process.env.AUTH_SECRET || 'alice-local-development-secret-change-me';
const STORE_FILE = new URL('./data/store.json', import.meta.url);

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required in production.');
}

let pool = null;
let jsonStore = {
	users: [],
	sessionsByUserId: {},
	rateLimitsByUserId: {},
};

const toIso = (timestamp) => new Date(timestamp).toISOString();
const toMs = (value) => new Date(value).getTime();
const normalizeEmail = (email) =>
	String(email || '')
		.trim()
		.toLowerCase();

const publicUser = (user) => ({
	id: user.id,
	name: user.name,
	email: user.email,
});

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
	const payload = {
		userId,
		expiresAt: Date.now() + TOKEN_TTL_MS,
	};
	const encodedPayload = encodeBase64Url(payload);
	const signature = crypto
		.createHmac('sha256', AUTH_SECRET)
		.update(encodedPayload)
		.digest('base64url');

	return `${encodedPayload}.${signature}`;
};

const verifyToken = (token) => {
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

const hasConversation = (session) =>
	Array.isArray(session.messages) &&
	session.messages.some((message) => message.role === 'user');

const sanitizeSessions = (sessions) => {
	if (!Array.isArray(sessions)) return [];

	return sessions.filter(hasConversation).map((session) => ({
		id: String(session.id || crypto.randomUUID()),
		title: String(session.title || 'New chat').slice(0, 80),
		messages: Array.isArray(session.messages) ? session.messages : [],
		createdAt: Number(session.createdAt) || Date.now(),
		updatedAt: Number(session.updatedAt) || Date.now(),
	}));
};

const sanitizeTitle = (title) => {
	const cleanTitle = String(title || '')
		.replace(/\s+/g, ' ')
		.trim();
	return cleanTitle.slice(0, 80) || 'Untitled chat';
};

const escapeHtml = (value) =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const readJsonStore = async () => {
	try {
		const file = await fs.readFile(STORE_FILE, 'utf8');
		jsonStore = {
			...jsonStore,
			...JSON.parse(file),
		};
	} catch (error) {
		if (error.code !== 'ENOENT') {
			console.warn('Could not read local store. Starting with empty store.');
		}
	}
};

const writeJsonStore = async () => {
	await fs.mkdir(new URL('./data/', import.meta.url), { recursive: true });
	await fs.writeFile(STORE_FILE, JSON.stringify(jsonStore, null, 2));
};

const mapUserRow = (row) => ({
	id: row.id,
	name: row.name,
	email: row.email,
	passwordSalt: row.password_salt,
	passwordHash: row.password_hash,
	resetToken: row.reset_token,
	resetTokenExpiresAt: row.reset_token_expires_at
		? toMs(row.reset_token_expires_at)
		: null,
});

const initDatabase = async () => {
	if (!process.env.DATABASE_URL) {
		await readJsonStore();
		console.log('Using local JSON store. Set DATABASE_URL for PostgreSQL.');
		return;
	}

	const { Pool } = await import('pg');
	pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl:
			process.env.DATABASE_SSL === 'false'
				? false
				: { rejectUnauthorized: false },
	});

	await pool.query(`
		CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_salt TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			reset_token TEXT,
			reset_token_expires_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS chat_sessions (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			messages JSONB NOT NULL DEFAULT '[]'::JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx
			ON chat_sessions(user_id, updated_at DESC);

		CREATE TABLE IF NOT EXISTS rate_limits (
			user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			count INTEGER NOT NULL DEFAULT 0,
			reset_at TIMESTAMPTZ NOT NULL
		);
	`);

	console.log('Connected to PostgreSQL database.');
};

const db = {
	findUserByEmail: async (email) => {
		if (pool) {
			const result = await pool.query('SELECT * FROM users WHERE email = $1', [
				email,
			]);
			return result.rows[0] ? mapUserRow(result.rows[0]) : null;
		}

		return jsonStore.users.find((user) => user.email === email) || null;
	},

	findUserById: async (id) => {
		if (pool) {
			const result = await pool.query('SELECT * FROM users WHERE id = $1', [
				id,
			]);
			return result.rows[0] ? mapUserRow(result.rows[0]) : null;
		}

		return jsonStore.users.find((user) => user.id === id) || null;
	},

	createUser: async ({ name, email, passwordSalt, passwordHash }) => {
		const user = {
			id: crypto.randomUUID(),
			name,
			email,
			passwordSalt,
			passwordHash,
			createdAt: Date.now(),
		};

		if (pool) {
			await pool.query(
				`INSERT INTO users (id, name, email, password_salt, password_hash)
				 VALUES ($1, $2, $3, $4, $5)`,
				[user.id, name, email, passwordSalt, passwordHash],
			);
			return user;
		}

		jsonStore.users.push(user);
		await writeJsonStore();
		return user;
	},

	setResetToken: async (user, resetToken, resetTokenExpiresAt) => {
		if (pool) {
			await pool.query(
				`UPDATE users
				 SET reset_token = $1, reset_token_expires_at = $2
				 WHERE id = $3`,
				[resetToken, toIso(resetTokenExpiresAt), user.id],
			);
			return;
		}

		user.resetToken = resetToken;
		user.resetTokenExpiresAt = resetTokenExpiresAt;
		await writeJsonStore();
	},

	updatePassword: async (user, passwordSalt, passwordHash) => {
		if (pool) {
			await pool.query(
				`UPDATE users
				 SET password_salt = $1,
					 password_hash = $2,
					 reset_token = NULL,
					 reset_token_expires_at = NULL
				 WHERE id = $3`,
				[passwordSalt, passwordHash, user.id],
			);
			return;
		}

		user.passwordSalt = passwordSalt;
		user.passwordHash = passwordHash;
		delete user.resetToken;
		delete user.resetTokenExpiresAt;
		await writeJsonStore();
	},

	getRateLimitRecord: async (userId) => {
		const now = Date.now();

		if (pool) {
			const existing = await pool.query(
				'SELECT count, reset_at FROM rate_limits WHERE user_id = $1',
				[userId],
			);
			const row = existing.rows[0];

			if (!row || now >= toMs(row.reset_at)) {
				const resetAt = now + RATE_LIMIT_WINDOW_MS;
				await pool.query(
					`INSERT INTO rate_limits (user_id, count, reset_at)
					 VALUES ($1, 0, $2)
					 ON CONFLICT (user_id)
					 DO UPDATE SET count = 0, reset_at = EXCLUDED.reset_at`,
					[userId, toIso(resetAt)],
				);
				return { count: 0, resetAt };
			}

			return { count: Number(row.count), resetAt: toMs(row.reset_at) };
		}

		const existingRecord = jsonStore.rateLimitsByUserId[userId];
		if (!existingRecord || now >= existingRecord.resetAt) {
			const record = {
				count: 0,
				resetAt: now + RATE_LIMIT_WINDOW_MS,
			};
			jsonStore.rateLimitsByUserId[userId] = record;
			return record;
		}

		return existingRecord;
	},

	incrementRateLimit: async (userId) => {
		if (pool) {
			await pool.query(
				'UPDATE rate_limits SET count = count + 1 WHERE user_id = $1',
				[userId],
			);
			return;
		}

		jsonStore.rateLimitsByUserId[userId].count += 1;
		await writeJsonStore();
	},

	getSessions: async (userId) => {
		if (pool) {
			const result = await pool.query(
				`SELECT id, title, messages, created_at, updated_at
				 FROM chat_sessions
				 WHERE user_id = $1
				 ORDER BY updated_at DESC`,
				[userId],
			);

			return result.rows.map((row) => ({
				id: row.id,
				title: row.title,
				messages: row.messages,
				createdAt: toMs(row.created_at),
				updatedAt: toMs(row.updated_at),
			}));
		}

		return jsonStore.sessionsByUserId[userId] || [];
	},

	saveSessions: async (userId, sessions) => {
		const cleanSessions = sanitizeSessions(sessions);

		if (pool) {
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				await client.query('DELETE FROM chat_sessions WHERE user_id = $1', [
					userId,
				]);

				for (const session of cleanSessions) {
					await client.query(
						`INSERT INTO chat_sessions
							(id, user_id, title, messages, created_at, updated_at)
						 VALUES ($1, $2, $3, $4, $5, $6)`,
						[
							session.id,
							userId,
							session.title,
							JSON.stringify(session.messages),
							toIso(session.createdAt),
							toIso(session.updatedAt),
						],
					);
				}

				await client.query('COMMIT');
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			} finally {
				client.release();
			}
			return cleanSessions;
		}

		jsonStore.sessionsByUserId[userId] = cleanSessions;
		await writeJsonStore();
		return cleanSessions;
	},

	renameSession: async (userId, sessionId, title) => {
		const cleanTitle = sanitizeTitle(title);

		if (pool) {
			const result = await pool.query(
				`UPDATE chat_sessions
				 SET title = $1, updated_at = NOW()
				 WHERE user_id = $2 AND id = $3
				 RETURNING id, title, messages, created_at, updated_at`,
				[cleanTitle, userId, sessionId],
			);

			if (!result.rows[0]) return null;
			const row = result.rows[0];
			return {
				id: row.id,
				title: row.title,
				messages: row.messages,
				createdAt: toMs(row.created_at),
				updatedAt: toMs(row.updated_at),
			};
		}

		const sessions = jsonStore.sessionsByUserId[userId] || [];
		const session = sessions.find((item) => item.id === sessionId);
		if (!session) return null;
		session.title = cleanTitle;
		session.updatedAt = Date.now();
		await writeJsonStore();
		return session;
	},
};

const requireAuth = async (req, res, next) => {
	const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
	const payload = verifyToken(token);
	const user = payload && (await db.findUserById(payload.userId));

	if (!user) {
		return res.status(401).json({ message: 'Please log in first.' });
	}

	req.user = user;
	next();
};

const rateLimitChat = async (req, res, next) => {
	const record = await db.getRateLimitRecord(req.user.id);

	if (record.count >= DAILY_MESSAGE_LIMIT) {
		return res.status(429).json({
			message: 'Daily chat limit reached.',
			limit: DAILY_MESSAGE_LIMIT,
			retryAt: toIso(record.resetAt),
		});
	}

	await db.incrementRateLimit(req.user.id);
	next();
};

const sendPasswordResetEmail = async ({ email, name, resetToken }) => {
	if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
		console.log(`Password reset token for ${email}: ${resetToken}`);
		return { delivered: false };
	}

	const safeName = escapeHtml(name);
	const safeResetToken = escapeHtml(resetToken);

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: process.env.EMAIL_FROM,
			to: email,
			subject: 'Reset your Alice password',
			html: `<p>Hi ${safeName},</p><p>Your password reset token is:</p><p><strong>${safeResetToken}</strong></p><p>This token expires in 15 minutes.</p>`,
		}),
	});

	if (!response.ok) {
		throw new Error('Could not send password reset email.');
	}

	return { delivered: true };
};

app.post('/auth/signup', async (req, res) => {
	const name = String(req.body.name || '').trim();
	const email = normalizeEmail(req.body.email);
	const password = String(req.body.password || '');

	if (!name || !email || password.length < 6) {
		return res.status(400).json({
			message: 'Enter a name, email, and password with at least 6 characters.',
		});
	}

	if (await db.findUserByEmail(email)) {
		return res.status(409).json({ message: 'An account already exists.' });
	}

	const { salt, hash } = hashPassword(password);
	const user = await db.createUser({
		name,
		email,
		passwordSalt: salt,
		passwordHash: hash,
	});

	res.status(201).json({
		user: publicUser(user),
		token: signToken(user.id),
	});
});

app.post('/auth/login', async (req, res) => {
	const email = normalizeEmail(req.body.email);
	const password = String(req.body.password || '');
	const user = await db.findUserByEmail(email);

	if (!user || !verifyPassword(password, user)) {
		return res.status(401).json({ message: 'Invalid email or password.' });
	}

	res.json({
		user: publicUser(user),
		token: signToken(user.id),
	});
});

app.get('/me', requireAuth, (req, res) => {
	res.json({ user: publicUser(req.user) });
});

app.post('/auth/forgot-password', async (req, res) => {
	const email = normalizeEmail(req.body.email);
	const user = await db.findUserByEmail(email);
	let resetToken;
	let delivered = false;

	if (user) {
		resetToken = crypto.randomBytes(24).toString('hex');
		await db.setResetToken(user, resetToken, Date.now() + RESET_TOKEN_TTL_MS);
		({ delivered } = await sendPasswordResetEmail({
			email,
			name: user.name,
			resetToken,
		}));
	}

	res.json({
		message: delivered
			? 'If this email exists, a password reset email was sent.'
			: 'If this email exists, a password reset token was generated.',
		devResetToken:
			process.env.NODE_ENV === 'production' ? undefined : resetToken,
	});
});

app.post('/auth/reset-password', async (req, res) => {
	const email = normalizeEmail(req.body.email);
	const token = String(req.body.token || '').trim();
	const password = String(req.body.password || '');
	const user = await db.findUserByEmail(email);

	if (
		!user ||
		!user.resetToken ||
		user.resetToken !== token ||
		Date.now() > user.resetTokenExpiresAt
	) {
		return res.status(400).json({ message: 'Invalid or expired reset token.' });
	}

	if (password.length < 6) {
		return res
			.status(400)
			.json({ message: 'Password must be at least 6 characters.' });
	}

	const { salt, hash } = hashPassword(password);
	await db.updatePassword(user, salt, hash);

	res.json({ message: 'Password updated. You can log in now.' });
});

app.get('/limit-status', requireAuth, async (req, res) => {
	const record = await db.getRateLimitRecord(req.user.id);

	res.json({
		limit: DAILY_MESSAGE_LIMIT,
		remaining: Math.max(DAILY_MESSAGE_LIMIT - record.count, 0),
		retryAt: toIso(record.resetAt),
	});
});

app.get('/sessions', requireAuth, async (req, res) => {
	res.json({
		sessions: await db.getSessions(req.user.id),
	});
});

app.put('/sessions', requireAuth, async (req, res) => {
	res.json({
		sessions: await db.saveSessions(req.user.id, req.body.sessions),
	});
});

app.patch('/sessions/:sessionId', requireAuth, async (req, res) => {
	const session = await db.renameSession(
		req.user.id,
		req.params.sessionId,
		req.body.title,
	);

	if (!session) {
		return res.status(404).json({ message: 'Chat not found.' });
	}

	res.json({ session });
});

app.post('/chat', requireAuth, rateLimitChat, async (req, res) => {
	try {
		const { contents } = req.body;

		const styleGuide =
			'You are Alice, a simple ChatGPT-style assistant. Answer in clean, readable paragraphs. Use bullet points only when they make the answer easier to scan or when the user asks for a list. Keep headings rare, short, and natural. Avoid long bullet-heavy formatting.';

		const conversation = contents
			.map((msg) =>
				msg.parts
					.filter((part) => part.text)
					.map((part) => `${msg.role}: ${part.text}`)
					.join('\n'),
			)
			.join('\n');

		const input = `${styleGuide}\n\nConversation:\n${conversation}`;

		const stream = await client.responses.create({
			model: 'gpt-5-mini',
			input,
			stream: true,
		});

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');

		res.flushHeaders();

		for await (const event of stream) {
			if (event.type === 'response.output_text.delta') {
				res.write(`data: ${JSON.stringify(event.delta)}\n\n`);
			}
		}

		res.write('data: [DONE]\n\n');
		res.end();
	} catch (err) {
		console.error(err);

		res.status(500).end(err.message);
	}
});

app.get('/health', (req, res) => {
	res.json({
		status: 'OK',
		database: pool ? 'postgres' : 'local-json',
	});
});

await initDatabase();

app.listen(3000, () => {
	console.log('Server running on port 3000');
});
