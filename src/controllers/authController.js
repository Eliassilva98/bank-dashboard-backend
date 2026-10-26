import { asyncHandler } from '#utils/asyncHandler.js'
import { authService } from '#services/authService.js'

export const authController = {
  register: asyncHandler(async (req, res) => {
    const user = await authService.register(req.body ?? {})
    return res.status(201).json(user)
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body ?? {})
    return res.json(result)
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body ?? {})
    return res.json(result)
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body ?? {})
    return res.json(result)
  })
}
