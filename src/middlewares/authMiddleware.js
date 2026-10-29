import jwt from 'jsonwebtoken'
import { env } from '#config/env.js'
import { AppError } from '#utils/AppError.js'

export const authenticate = (req, _res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticação não informado', 401))
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    req.userId = payload.sub
    return next()
  } catch {
    return next(new AppError('Token inválido ou expirado', 401))
  }
}
