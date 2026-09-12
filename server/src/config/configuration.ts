export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientBaseUrl: process.env.CLIENT_BASE_URL ?? 'http://localhost:3000',
  corsAllowedOrigins: (
    process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  auth: {
    jwtSecret: process.env.JWT_SECRET,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});
