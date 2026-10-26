import { describe, expect, it } from '@jest/globals'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { app } = await import('#app.js')

const sendFrom = (ip, path, body) =>
  request(app).post(path).set('X-Forwarded-For', ip).send(body)

describe('rate limit', () => {
  it('forgot-password: bloqueia na 6ª requisição em 15 minutos', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue(null)

    const statuses = []
    for (let i = 0; i < 6; i++) {
      const res = await sendFrom('10.0.0.1', '/api/auth/forgot-password', {
        email: 'a@a.com'
      })
      statuses.push(res.status)
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  it('o 429 vem em JSON e com o header RateLimit', async () => {
    let res
    for (let i = 0; i < 6; i++) {
      res = await sendFrom('10.0.0.2', '/api/auth/reset-password', {
        token: 'x',
        password: '123'
      })
    }

    expect(res.status).toBe(429)
    expect(res.body).toEqual({
      status: 'error',
      message: 'Muitas requisições. Tente novamente em 15 minutos.'
    })
    expect(res.headers.ratelimit).toBeDefined()
  })

  it('login: só as tentativas que FALHARAM contam (10 por IP)', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      name: 'Maria',
      email: 'maria@email.com',
      password_hash: await bcrypt.hash('senhaforte123', 4)
    })
    const login = (password) =>
      sendFrom('10.0.0.3', '/api/auth/login', {
        email: 'maria@email.com',
        password
      })

    for (let i = 0; i < 12; i++) {
      expect((await login('senhaforte123')).status).toBe(200)
    }

    for (let i = 0; i < 10; i++) {
      expect((await login('errada')).status).toBe(401)
    }

    const blocked = await login('errada')
    expect(blocked.status).toBe(429)
    expect(blocked.body.message).toBe(
      'Muitas tentativas de login. Tente novamente em 15 minutos.'
    )
  })

  it('limites são por IP: outro IP continua liberado', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue(null)

    const res = await sendFrom('10.0.0.99', '/api/auth/forgot-password', {
      email: 'a@a.com'
    })

    expect(res.status).toBe(200)
  })

  it('cada rota tem o seu contador (register não herda o do forgot-password)', async () => {
    const res = await sendFrom('10.0.0.1', '/api/auth/register', {
      name: 'X',
      email: 'invalido',
      password: '12345678'
    })

    expect(res.status).toBe(400)
  })
})
