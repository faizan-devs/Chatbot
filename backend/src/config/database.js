import pg from 'pg';
import env from './env.js';

const { Pool } = pg;

const pool = new Pool({
	connectionString: env.databaseUrl,
	ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

export default pool;
