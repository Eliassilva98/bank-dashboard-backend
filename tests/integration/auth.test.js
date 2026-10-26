import { beforeEach, describe, expect, it } from '@jest/globals'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { userRepository, accountRepository, resetTokenRepository } = mocks
const { app } = await import('#app.js')

const maria = {
  name: 'Maria Silva',
  email: 'maria@email.com',
  password: 'senhaforte123'
}

beforeEach(() => mocks.reset())

describe('POST /api/auth/register', () => {
  it('201 e devolve o usuário sem dados sensíveis', async () => {
    userRepository.create.mockImplementation(async ({ name, email }) => ({
      id: 'user-1',
      name,
      email,
      created_at: '2026-10-20T10:00:00.000Z'
    }))

    const res = await request(app).post('/api/auth/register').send(maria)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: 'user-1',
      name: 'Maria Silva',
      email: 'maria@email.com',
      created_at: '2026-10-20T10:00:00.000Z'
    })
    expect(JSON.stringify(res.body)).not.toMatch(/senhaforte123|password/)
    expect(accountRepository.create).toHaveBeenCalled()
  })

  it('400 com mensagem clara quando os dados são inválidos', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...maria, email: 'invalido' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ status: 'error', message: 'E-mail inválido' })
  })

  it('400 (e não 500) quando o corpo não vem em JSON', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'text/plain')
      .send('qualquer coisa')

    expect(res.status).toBe(400)
    expect(res.body.status).toBe('error')
  })

  it('409 quando o e-mail já existe', async () => {
    userRepository.create.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: '23505' })
    )

    const res = await request(app).post('/api/auth/register').send(maria)

    expect(res.status).toBe(409)
    expect(res.body.message).toBe('Já existe uma conta com este e-mail')
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    userRepository.findByEmail.mockImplementation(async (email) =>
      email === maria.email
        ? {
            id: 'user-1',
            name: maria.name,
            email: maria.email,
            password_hash: await bcrypt.hash(maria.password, 4)
          }
        : null
    )
  })

  it('200 com token que funciona nas rotas protegidas', async () => {
    accountRepository.findByUserId.mockResolvedValue({
      id: 'acc-1',
      balance: '250.75',
      updated_at: '2026-10-20T10:00:00.000Z'
    })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: maria.email, password: maria.password })

    expect(login.status).toBe(200)
    expect(login.body.user).toEqual({
      id: 'user-1',
      name: maria.name,
      email: maria.email
    })

    const me = await request(app)
      .get('/api/accounts/me')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(me.status).toBe(200)
    expect(me.body).toEqual({
      user_id: 'user-1',
      account: {
        id: 'acc-1',
        balance: 250.75,
        updated_at: '2026-10-20T10:00:00.000Z'
      }
    })
  })

  it('401 com senha errada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: maria.email, password: 'errada123' })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('E-mail ou senha incorretos')
  })

  it('401 (e não 500) quando o corpo vem vazio', async () => {
    const res = await request(app).post('/api/auth/login')

    expect(res.status).toBe(401)
  })
})

describe('rotas de auth sem corpo nunca dão 500', () => {
  it.each([
    ['/api/auth/forgot-password', 200],
    ['/api/auth/reset-password', 400]
  ])('POST %s sem corpo → %i', async (path, status) => {
    userRepository.findByEmail.mockResolvedValue(null)

    const res = await request(app).post(path)

    expect(res.status).toBe(status)
  })
})

describe('esqueci / redefinir senha', () => {
  it('forgot-password não revela se o e-mail existe nem expõe o token fora de dev', async () => {
    userRepository.findByEmail.mockResolvedValueOnce({ id: 'user-1' })
    const existing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: maria.email })

    userRepository.findByEmail.mockResolvedValueOnce(null)
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ninguem@email.com' })

    expect(existing.status).toBe(200)
    expect(missing.status).toBe(200)
    expect(existing.body).toEqual(missing.body)
    expect(existing.body).not.toHaveProperty('devResetToken')
  })

  it('reset-password com token inválido devolve 400', async () => {
    resetTokenRepository.consumeValidByHash.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'token-falso', password: 'novasenha123' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Token de redefinição inválido ou expirado')
  })

  it('reset-password com token válido devolve 200', async () => {
    resetTokenRepository.consumeValidByHash.mockResolvedValue({
      user_id: 'user-1'
    })

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'token-bom', password: 'novasenha123' })

    expect(res.status).toBe(200)
    expect(userRepository.updatePasswordHash).toHaveBeenCalled()
  })
})
