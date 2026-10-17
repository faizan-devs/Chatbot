import pool from '../../config/database.js';

const hasConversation = (session) =>
	Array.isArray(session.messages) &&
	session.messages.some((message) => message.role === 'user');

const sanitizeTitle = (title) => {
	const cleanTitle = String(title || '')
		.replace(/\s+/g, ' ')
		.trim();

	return cleanTitle.slice(0, 80) || 'Untitled chat';
};

const sanitizeSessions = (sessions) => {
	if (!Array.isArray(sessions)) return [];

	return sessions.filter(hasConversation).map((session) => ({
		id: String(session.id),
		title: sanitizeTitle(session.title || 'New chat'),
		messages: Array.isArray(session.messages) ? session.messages : [],
		createdAt: Number(session.createdAt) || Date.now(),
		updatedAt: Number(session.updatedAt) || Date.now(),
	}));
};

const mapSessionRow = (row) => ({
	id: row.id,
	title: row.title,
	messages: row.messages || [],
	createdAt: new Date(row.created_at).getTime(),
	updatedAt: new Date(row.updated_at).getTime(),
});

export const getSessions = async (userId) => {
	const result = await pool.query(
		`
		SELECT id, title, messages, created_at, updated_at
		FROM chat_sessions
		WHERE user_id = $1
		ORDER BY updated_at DESC
		`,
		[userId],
	);

	return result.rows.map(mapSessionRow);
};

export const saveSessions = async (userId, sessions) => {
	const cleanSessions = sanitizeSessions(sessions);
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		await client.query('DELETE FROM chat_sessions WHERE user_id = $1', [
			userId,
		]);

		for (const session of cleanSessions) {
			await client.query(
				`
				INSERT INTO chat_sessions
					(id, user_id, title, messages, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6)
				`,
				[
					session.id,
					userId,
					session.title,
					JSON.stringify(session.messages),
					new Date(session.createdAt).toISOString(),
					new Date(session.updatedAt).toISOString(),
				],
			);
		}

		await client.query('COMMIT');
		return cleanSessions;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
};

export const renameSession = async (userId, sessionId, title) => {
	const result = await pool.query(
		`
		UPDATE chat_sessions
		SET title = $1,
			updated_at = NOW()
		WHERE user_id = $2
			AND id = $3
		RETURNING id, title, messages, created_at, updated_at
		`,
		[sanitizeTitle(title), userId, sessionId],
	);

	return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
};
