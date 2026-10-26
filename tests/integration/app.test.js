import { describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { app } = await import('#app.js')

const ALLOWED_ORIGIN = 'http://localhost:5173'

describe('aplicação', () => {
  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('aplica os headers de segurança do helmet e esconde o Express', async () => {
    const res = await request(app).get('/health')

    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('rota inexistente devolve 404 em JSON', async () => {
    const res = await request(app).get('/api/nao-existe')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({
      status: 'error',
      message: 'Rota não encontrada'
    })
  })

  it('método não suportado em rota existente também é 404 em JSON', async () => {
    const res = await request(app).delete('/api/auth/login')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Rota não encontrada')
  })

  it('JSON malformado devolve 400 em JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "x",')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      status: 'error',
      message: 'JSON inválido no corpo da requisição'
    })
  })

  it('erro inesperado vira 500 genérico, sem vazar detalhes', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    mocks.userRepository.findByEmail.mockRejectedValueOnce(
      new Error('password authentication failed for user "neondb_owner"')
    )

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@a.com', password: '12345678' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      status: 'error',
      message: 'Erro interno do servidor'
    })
    expect(JSON.stringify(res.body)).not.toMatch(/neondb/)
    consoleError.mockRestore()
  })
})

describe('CORS', () => {
  it('libera a origem do frontend com credentials (preflight)', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization')

    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('não libera outras origens', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://site-malicioso.com')
      .set('Access-Control-Request-Method', 'POST')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('erros também levam o header CORS (o frontend consegue ler a mensagem)', async () => {
    const res = await request(app)
      .get('/api/accounts/me')
      .set('Origin', ALLOWED_ORIGIN)

    expect(res.status).toBe(401)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
  })
})
