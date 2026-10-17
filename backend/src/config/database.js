import pg from 'pg';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import env from './env.js';

const { Pool } = pg;

const pool = new Pool({
	connectionString: env.databaseUrl,
	ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

export const initDatabase = async () => {
	const currentFile = fileURLToPath(import.meta.url);
	const schemaPath = path.resolve(
		path.dirname(currentFile),
		'../../db/schema.sql',
	);
	const schema = await fs.readFile(schemaPath, 'utf8');
	await pool.query(schema);
};

export default pool;
