import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { accountRepository, transactionRepository } = mocks

const marketService = { getOverview: jest.fn() }
jest.unstable_mockModule('#services/marketService.js', () => ({
  marketService
}))

const { app } = await import('#app.js')

const SECRET = process.env.JWT_SECRET
const tokenFor = (userId, options = {}) =>
  jwt.sign({ sub: userId }, SECRET, { expiresIn: '1h', ...options })
const auth = (token = tokenFor('user-1')) => ({
  Authorization: `Bearer ${token}`
})

const myAccount = { id: 'acc-1', balance: '100.00', updated_at: 'agora' }

beforeEach(() => {
  mocks.reset()
  marketService.getOverview.mockReset()
  accountRepository.findByUserId.mockResolvedValue(myAccount)
})

describe('autenticação nas rotas protegidas', () => {
  const routes = [
    ['get', '/api/accounts/me'],
    ['get', '/api/transactions'],
    ['post', '/api/transactions'],
    ['get', '/api/market']
  ]

  it.each(routes)('%s %s sem token → 401', async (method, path) => {
    const res = await request(app)[method](path)

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Token de autenticação não informado')
  })

  it.each([
    [
      'token assinado com outro segredo',
      jwt.sign({ sub: 'user-1' }, 'segredo-errado')
    ],
    ['token expirado', tokenFor('user-1', { expiresIn: -10 })],
    [
      'token sem assinatura (alg: none)',
      jwt.sign({ sub: 'user-1' }, null, { algorithm: 'none' })
    ],
    ['token adulterado', tokenFor('user-1').slice(0, -3) + 'abc'],
    ['texto qualquer', 'nao-sou-um-jwt']
  ])('%s → 401', async (_label, token) => {
    const res = await request(app).get('/api/accounts/me').set(auth(token))

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Token inválido ou expirado')
    expect(accountRepository.findByUserId).not.toHaveBeenCalled()
  })

  it('header sem o prefixo Bearer → 401', async () => {
    const res = await request(app)
      .get('/api/accounts/me')
      .set('Authorization', tokenFor('user-1'))

    expect(res.status).toBe(401)
  })

  it('usa o id do token, não um id enviado pelo cliente', async () => {
    await request(app)
      .get('/api/accounts/me?userId=outro-usuario')
      .set(auth(tokenFor('user-1')))

    expect(accountRepository.findByUserId.mock.calls[0][0]).toBe('user-1')
  })
})

describe('GET /api/transactions', () => {
  beforeEach(() => {
    transactionRepository.listByAccountIdWithPagination.mockResolvedValue([])
    transactionRepository.countByAccountId.mockResolvedValue(0)
  })

  it('200 com paginação padrão', async () => {
    const res = await request(app).get('/api/transactions').set(auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
      items: []
    })
  })

  it('400 com paginação inválida', async () => {
    const res = await request(app)
      .get('/api/transactions?pageSize=500')
      .set(auth())

    expect(res.status).toBe(400)
    expect(res.body.message).toBe("'pageSize' deve ser no máximo 50")
  })

  it('400 com parâmetro repetido (?page=1&page=2)', async () => {
    const res = await request(app)
      .get('/api/transactions?page=1&page=2')
      .set(auth())

    expect(res.status).toBe(400)
  })
})

describe('POST /api/transactions', () => {
  it('201 em um depósito válido', async () => {
    accountRepository.credit.mockResolvedValue({ balance: '150.00' })
    transactionRepository.create.mockResolvedValue({
      id: 'tx-1',
      type: 'deposit',
      amount: '50.00',
      description: null,
      counterparty_account_id: null,
      created_at: 'agora'
    })

    const res = await request(app)
      .post('/api/transactions')
      .set(auth())
      .send({ type: 'deposit', amount: '50.00' })

    expect(res.status).toBe(201)
    expect(res.body.new_balance).toBe(150)
  })

  it('400 em transferência com saldo insuficiente', async () => {
    accountRepository.findByUserEmail.mockResolvedValue({
      id: 'acc-2',
      name: 'João'
    })
    accountRepository.debit.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/transactions')
      .set(auth())
      .send({ type: 'transfer', amount: '500', targetEmail: 'joao@email.com' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Saldo insuficiente')
  })

  it('400 (e não 500) sem corpo', async () => {
    const res = await request(app).post('/api/transactions').set(auth())

    expect(res.status).toBe(400)
  })
})

describe('GET /api/market', () => {
  it('200 com os indicadores', async () => {
    const overview = {
      dolar: { value: 5.03, variationPct: -0.07, updatedAt: 'x' },
      selic: { date: '20/10/2026', value: 13.75 },
      cdi: { date: '20/10/2026', value: 13.65 }
    }
    marketService.getOverview.mockResolvedValue(overview)

    const res = await request(app).get('/api/market').set(auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual(overview)
  })

  it('502 quando o serviço de mercado está fora', async () => {
    const { AppError } = await import('#utils/AppError.js')
    marketService.getOverview.mockRejectedValue(
      new AppError('Serviço de mercado indisponível', 502)
    )

    const res = await request(app).get('/api/market').set(auth())

    expect(res.status).toBe(502)
    expect(res.body.message).toBe('Serviço de mercado indisponível')
  })
})
