import { rateLimit } from 'express-rate-limit'

const FIFTEEN_MINUTES = 15 * 60 * 1000

const createLimiter = ({ limit, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { status: 'error', message }
  })

const TOO_MANY_REQUESTS = 'Muitas requisições. Tente novamente em 15 minutos.'

export const loginLimiter = createLimiter({
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
})

export const registerLimiter = createLimiter({
  limit: 5,
  message: TOO_MANY_REQUESTS
})

export const forgotPasswordLimiter = createLimiter({
  limit: 5,
  message: TOO_MANY_REQUESTS
})

export const resetPasswordLimiter = createLimiter({
  limit: 5,
  message: TOO_MANY_REQUESTS
})
