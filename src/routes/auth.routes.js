import { Router } from 'express'
import { authController } from '#controllers/authController.js'
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter
} from '#middlewares/rateLimiter.js'

const authRoutes = Router()

authRoutes.post('/register', registerLimiter, authController.register)
authRoutes.post('/login', loginLimiter, authController.login)
authRoutes.post(
  '/forgot-password',
  forgotPasswordLimiter,
  authController.forgotPassword
)
authRoutes.post(
  '/reset-password',
  resetPasswordLimiter,
  authController.resetPassword
)

export { authRoutes }
