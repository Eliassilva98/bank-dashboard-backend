import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { setImmediate } from 'node:timers'
import { URL } from 'node:url'
import jwt from 'jsonwebtoken'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { userRepository, accountRepository, resetTokenRepository, mailService } =
  mocks
const { authService } = await import('#services/authService.js')

const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex')

const validUser = {
  name: 'Maria Silva',
  email: 'maria@email.com',
  password: 'senhaforte123'
}

describe('authService.register', () => {
  beforeEach(() => mocks.reset())

  it.each([
    [{ ...validUser, name: '   ' }, 'Nome é obrigatório'],
    [{ ...validUser, name: undefined }, 'Nome é obrigatório'],
    [{ ...validUser, email: 'maria@' }, 'E-mail inválido'],
    [{ ...validUser, email: 42 }, 'E-mail inválido'],
    [
      { ...validUser, password: '1234567' },
      'A senha deve ter no mínimo 8 caracteres'
    ],
    [
      { ...validUser, password: 12345678 },
      'A senha deve ter no mínimo 8 caracteres'
    ]
  ])('rejeita dados inválidos sem tocar no banco', async (input, message) => {
    await expect(authService.register(input)).rejects.toMatchObject({
      statusCode: 400,
      message
    })
    expect(mocks.database.withTransaction).not.toHaveBeenCalled()
  })

  it('cria usuário e conta na MESMA transação, com e-mail normalizado e senha com hash', async () => {
    const created = {
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com'
    }
    userRepository.create.mockResolvedValue(created)

    const result = await authService.register({
      name: '  Maria Silva  ',
      email: '  MARIA@Email.com ',
      password: validUser.password
    })

    expect(result).toEqual(created)

    const [data, userDb] = userRepository.create.mock.calls[0]
    expect(data.name).toBe('Maria Silva')
    expect(data.email).toBe('maria@email.com')
    expect(data.passwordHash).not.toBe(validUser.password)
    expect(await bcrypt.compare(validUser.password, data.passwordHash)).toBe(
      true
    )

    expect(accountRepository.create).toHaveBeenCalledWith(
      'user-1',
      mocks.client
    )
    expect(userDb).toBe(mocks.client)
  })

  it('transforma e-mail duplicado (UNIQUE do Postgres) em 409', async () => {
    userRepository.create.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' })
    )

    await expect(authService.register(validUser)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Já existe uma conta com este e-mail'
    })
  })

  it('repassa erros inesperados do banco sem mascarar', async () => {
    const failure = new Error('conexão perdida')
    userRepository.create.mockRejectedValue(failure)

    await expect(authService.register(validUser)).rejects.toBe(failure)
  })
})

describe('authService.login', () => {
  let storedUser

  beforeEach(async () => {
    mocks.reset()
    storedUser = {
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com',
      password_hash: await bcrypt.hash(validUser.password, 4)
    }
  })

  it('devolve um JWT válido e os dados públicos do usuário', async () => {
    userRepository.findByEmail.mockResolvedValue(storedUser)

    const result = await authService.login({
      email: ' MARIA@email.com ',
      password: validUser.password
    })

    expect(userRepository.findByEmail).toHaveBeenCalledWith('maria@email.com')
    expect(result.user).toEqual({
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com'
    })
    expect(result.user).not.toHaveProperty('password_hash')

    const payload = jwt.verify(result.token, process.env.JWT_SECRET)
    expect(payload.sub).toBe('user-1')
    expect(payload.exp - payload.iat).toBe(60 * 60)
  })

  it('usa a mesma mensagem para e-mail inexistente e senha errada', async () => {
    userRepository.findByEmail.mockResolvedValueOnce(null)
    const unknownEmail = authService.login(validUser)

    userRepository.findByEmail.mockResolvedValueOnce(storedUser)
    const wrongPassword = authService.login({
      ...validUser,
      password: 'outrasenha'
    })

    const expected = { statusCode: 401, message: 'E-mail ou senha incorretos' }
    await expect(unknownEmail).rejects.toMatchObject(expected)
    await expect(wrongPassword).rejects.toMatchObject(expected)
  })

  it('não quebra com senha que não é string', async () => {
    userRepository.findByEmail.mockResolvedValue(storedUser)

    await expect(
      authService.login({ email: validUser.email, password: { $ne: null } })
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('authService.forgotPassword', () => {
  beforeEach(() => mocks.reset())

  it('responde a mesma mensagem para e-mail não cadastrado (sem revelar)', async () => {
    userRepository.findByEmail.mockResolvedValue(null)

    const result = await authService.forgotPassword({ email: 'ninguem@x.com' })

    expect(result).toEqual({
      message:
        'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.'
    })
    expect(resetTokenRepository.create).not.toHaveBeenCalled()
  })

  it('invalida tokens antigos e guarda só o HASH do novo, válido por 60 min', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1' })
    const before = Date.now()

    const result = await authService.forgotPassword({ email: validUser.email })

    expect(resetTokenRepository.invalidateAllForUser).toHaveBeenCalledWith(
      'user-1',
      mocks.client
    )

    const [{ userId, tokenHash, expiresAt }, db] =
      resetTokenRepository.create.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(db).toBe(mocks.client)

    const ttl = expiresAt.getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(60 * 60 * 1000)
    expect(ttl).toBeLessThan(60 * 60 * 1000 + 5000)

    expect(result).not.toHaveProperty('devResetToken')
  })

  it('envia por e-mail um link cujo token corresponde ao hash salvo', async () => {
    userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com'
    })

    await authService.forgotPassword({ email: validUser.email })

    const [{ to, name, resetLink }] =
      mailService.sendPasswordReset.mock.calls[0]
    expect(to).toBe('maria@email.com')
    expect(name).toBe('Maria Silva')
    expect(resetLink).toMatch(
      /^http:\/\/localhost:5173\/reset-password\?token=[a-f0-9]{64}$/
    )

    const token = new URL(resetLink).searchParams.get('token')
    const [{ tokenHash }] = resetTokenRepository.create.mock.calls[0]
    expect(sha256(token)).toBe(tokenHash)
  })

  it('não envia e-mail quando o e-mail não está cadastrado', async () => {
    userRepository.findByEmail.mockResolvedValue(null)

    await authService.forgotPassword({ email: 'ninguem@x.com' })

    expect(mailService.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('se o envio falhar, registra o erro e responde normalmente (sem revelar nada)', async () => {
    userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com'
    })
    mailService.sendPasswordReset.mockRejectedValue(
      new Error('SMTP fora do ar')
    )
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const result = await authService.forgotPassword({ email: validUser.email })

    await new Promise(setImmediate)

    expect(result).toEqual({
      message:
        'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.'
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('authService.resetPassword', () => {
  beforeEach(() => mocks.reset())

  it('rejeita senha curta antes de qualquer outra coisa', async () => {
    await expect(
      authService.resetPassword({ token: 'abc', password: '123' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.database.withTransaction).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   ', 123])(
    'rejeita token vazio: %p',
    async (token) => {
      await expect(
        authService.resetPassword({ token, password: 'novasenha123' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Token de redefinição inválido ou expirado'
      })
    }
  )

  it('rejeita token inexistente, expirado ou já usado', async () => {
    resetTokenRepository.consumeValidByHash.mockResolvedValue(null)

    await expect(
      authService.resetPassword({ token: 'abc', password: 'novasenha123' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled()
  })

  it('consome o token pelo hash e grava o hash da nova senha', async () => {
    resetTokenRepository.consumeValidByHash.mockResolvedValue({
      user_id: 'user-1'
    })

    const result = await authService.resetPassword({
      token: '  token-recebido  ',
      password: 'novasenha123'
    })

    expect(result).toEqual({ message: 'Senha redefinida com sucesso' })
    expect(resetTokenRepository.consumeValidByHash).toHaveBeenCalledWith(
      sha256('token-recebido'),
      mocks.client
    )

    const [userId, passwordHash, db] =
      userRepository.updatePasswordHash.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(db).toBe(mocks.client)
    expect(await bcrypt.compare('novasenha123', passwordHash)).toBe(true)
  })
})
