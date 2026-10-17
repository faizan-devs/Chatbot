# Local PostgreSQL Testing

Use Docker when you do not have PostgreSQL installed locally.

## Start the database

From the `backend` folder:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5432`
- Adminer database UI on `http://localhost:8080`

## Configure backend

Copy `.env.example` to `.env`, then set your real `OPENAI_API_KEY`.

The local database URL is:

```bash
DATABASE_URL=postgresql://chatbot:chatbot_password@localhost:5432/chatbot
DATABASE_SSL=false
```

Restart the backend after changing `.env`.

## Confirm backend is using PostgreSQL

Open:

```text
http://localhost:3000/health
```

You should see:

```json
{
  "status": "OK",
  "database": "postgres"
}
```

If it says `local-json`, your backend did not read `DATABASE_URL`.

## See the data manually

Open Adminer:

```text
http://localhost:8080
```

Use these values:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `chatbot`
- Password: `chatbot_password`
- Database: `chatbot`

After you sign up and send a chat, check these tables:

- `users`
- `chat_sessions`
- `rate_limits`
