import 'dotenv/config'

const required = ['DATABASE_URL', 'JWT_SECRET']
const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  throw new Error(
    `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`
  )
}

const nodeEnv = process.env.NODE_ENV || 'development'

const corsOrigin = (
  process.env.CORS_ORIGIN || 'https://bank-dashboard-frontend-zky1.vercel.app'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 3333,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  corsOrigin,
  isDev: nodeEnv === 'development',

  frontendUrl: (
    process.env.FRONTEND_URL ||
    'https://bank-dashboard-frontend-zky1.vercel.app'
  ).replace(/\/$/, ''),

  brevoApiKey: process.env.BREVO_API_KEY,

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'Bank Dashboard <no-reply@localhost>'
  }
}
