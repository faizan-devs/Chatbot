import pool from '../../config/database.js';

export const findUserByEmail = async (email) => {
	const result = await pool.query('SELECT * FROM users WHERE email = $1', [
		email,
	]);

	return result.rows[0] || null;
};

export const findUserById = async (id) => {
	const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

	return result.rows[0] || null;
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

	return result.rows[0];
};
