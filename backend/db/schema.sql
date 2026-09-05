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
