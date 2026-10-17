const env = {
	nodeEnv: process.env.NODE_ENV || 'development',

	port: Number(process.env.PORT || 3000),

	openaiApiKey: process.env.OPENAI_API_KEY,

	databaseUrl:
		process.env.DATABASE_URL ||
		'postgresql://chatbot:chatbot_password@localhost:5432/chatbot',
	databaseSsl: process.env.DATABASE_SSL === 'true',

	authSecret:
		process.env.AUTH_SECRET || 'alice-local-development-secret-change-me',

	allowedOrigins:
		process.env.ALLOWED_ORIGINS?.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean) || [],

	dailyMessageLimit: Number(process.env.DAILY_MESSAGE_LIMIT || 5),

	frontendUrl: process.env.FRONTEND_URL,

	resendApiKey: process.env.RESEND_API_KEY,

	emailFrom: process.env.EMAIL_FROM,
};

export default env;
