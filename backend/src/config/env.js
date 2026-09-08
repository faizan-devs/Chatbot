const env = {
	nodeEnv: process.env.NODE_ENV || 'development',

	port: Number(process.env.PORT || 3000),

	openaiApiKey: process.env.OPENAI_API_KEY,

	databaseUrl: process.env.DATABASE_URL,
	databaseSsl: process.env.DATABASE_SSL !== 'false',

	authSecret: process.env.AUTH_SECRET,

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
