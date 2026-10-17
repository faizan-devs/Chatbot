import pool from '../../config/database.js';

const mapUserRow = (row) =>
	row && {
		id: row.id,
		name: row.name,
		email: row.email,
		passwordSalt: row.password_salt,
		passwordHash: row.password_hash,
		resetToken: row.reset_token,
		resetTokenExpiresAt: row.reset_token_expires_at
			? new Date(row.reset_token_expires_at).getTime()
			: null,
		createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
	};

export const findUserByEmail = async (email) => {
	const result = await pool.query('SELECT * FROM users WHERE email = $1', [
		email,
	]);

	return mapUserRow(result.rows[0]) || null;
};

export const findUserById = async (id) => {
	const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

	return mapUserRow(result.rows[0]) || null;
};

export const createUser = async ({
	id,
	name,
	email,
	passwordSalt,
	passwordHash,
}) => {
	const result = await pool.query(
		`
        INSERT INTO users
        (id, name, email, password_salt, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
		[id, name, email, passwordSalt, passwordHash],
	);

	return mapUserRow(result.rows[0]);
};

export const setResetToken = async (user, resetToken, resetTokenExpiresAt) => {
	await pool.query(
		`
		UPDATE users
		SET reset_token = $1,
			reset_token_expires_at = $2
		WHERE id = $3
		`,
		[resetToken, new Date(resetTokenExpiresAt).toISOString(), user.id],
	);
};

export const updatePassword = async (user, passwordSalt, passwordHash) => {
	await pool.query(
		`
		UPDATE users
		SET password_salt = $1,
			password_hash = $2,
			reset_token = NULL,
			reset_token_expires_at = NULL
		WHERE id = $3
		`,
		[passwordSalt, passwordHash, user.id],
	);
};
