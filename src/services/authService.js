import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '#config/env.js'
import { withTransaction } from '#config/database.js'
import { AppError } from '#utils/AppError.js'
import { userRepository } from '#repositories/userRepository.js'
import { accountRepository } from '#repositories/accountRepository.js'
import { resetTokenRepository } from '#repositories/resetTokenRepository.js'
import { mailService } from '#services/mailService.js'

const SALT_ROUNDS = 10
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_TOKEN_TTL_MINUTES = 60
const PG_UNIQUE_VIOLATION = '23505'

const FORGOT_PASSWORD_MESSAGE =
  'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.'

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('A senha deve ter no mínimo 8 caracteres')
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export const authService = {
  async register({ name, email, password }) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('Nome é obrigatório')
    }

    const normalizedEmail = normalizeEmail(email)
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new AppError('E-mail inválido')
    }

    validatePassword(password)

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    try {
      return await withTransaction(async (client) => {
        const user = await userRepository.create(
          { name: name.trim(), email: normalizedEmail, passwordHash },
          client
        )

        await accountRepository.create(user.id, client)

        return user
      })
    } catch (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        throw new AppError('Já existe uma conta com este e-mail', 409)
      }

      throw error
    }
  },

  async login({ email, password }) {
    const user = await userRepository.findByEmail(normalizeEmail(email))
    if (!user) throw new AppError('E-mail ou senha incorretos', 401)

    const passwordMatches = await bcrypt.compare(
      typeof password === 'string' ? password : '',
      user.password_hash
    )
    if (!passwordMatches) throw new AppError('E-mail ou senha incorretos', 401)

    const token = jwt.sign({ sub: user.id }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn
    })

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email }
    }
  },

  async forgotPassword({ email }) {
    const user = await userRepository.findByEmail(normalizeEmail(email))

    if (!user) {
      return { message: FORGOT_PASSWORD_MESSAGE }
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)

    await withTransaction(async (client) => {
      await resetTokenRepository.invalidateAllForUser(user.id, client)
      await resetTokenRepository.create(
        { userId: user.id, tokenHash: hashToken(resetToken), expiresAt },
        client
      )
    })

    const resetLink = `${env.frontendUrl}/reset-password?token=${resetToken}`

    mailService
      .sendPasswordReset({
        to: user.email,
        name: user.name,
        resetLink,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES
      })
      .catch((error) => {
        console.error('[mail] Falha ao enviar e-mail de redefinição:', error)
      })

    return { message: FORGOT_PASSWORD_MESSAGE }
  },

  async resetPassword({ token, password }) {
    validatePassword(password)

    if (typeof token !== 'string' || !token.trim()) {
      throw new AppError('Token de redefinição inválido ou expirado')
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    await withTransaction(async (client) => {
      const consumed = await resetTokenRepository.consumeValidByHash(
        hashToken(token.trim()),
        client
      )

      if (!consumed) {
        throw new AppError('Token de redefinição inválido ou expirado')
      }

      await userRepository.updatePasswordHash(
        consumed.user_id,
        passwordHash,
        client
      )
    })

    return { message: 'Senha redefinida com sucesso' }
  }
}
