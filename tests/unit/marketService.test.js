import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals'

const AWESOME = 'https://economia.awesomeapi.com.br/json'
const BRASIL_API = 'https://brasilapi.com.br/api/taxas/v1'
const BCB = 'https://api.bcb.gov.br/dados/serie'

const dolarResponse = {
  USDBRL: {
    bid: '5.0364',
    pctChange: '-0.0754',
    create_date: '2026-10-20 10:00:00'
  }
}

let clients
let marketService
let now

const fail = () => Promise.reject(new Error('timeout of 5000ms exceeded'))

const respondWith = ({ dolar, selic, cdi, bcb }) => {
  clients[AWESOME].get.mockImplementation(dolar)
  clients[BRASIL_API].get.mockImplementation((url) =>
    url === '/selic' ? selic() : cdi()
  )
  clients[BCB].get.mockImplementation(bcb ?? fail)
}

const healthy = {
  dolar: async () => ({ data: dolarResponse }),
  selic: async () => ({ data: { nome: 'SELIC', valor: 13.75 } }),
  cdi: async () => ({ data: { nome: 'CDI', valor: 13.65 } })
}

const totalCalls = () =>
  Object.values(clients).reduce(
    (sum, client) => sum + client.get.mock.calls.length,
    0
  )

beforeEach(async () => {
  jest.resetModules()
  clients = {}
  jest.unstable_mockModule('axios', () => ({
    default: {
      create: ({ baseURL }) => (clients[baseURL] = { get: jest.fn() })
    }
  }))

  now = 1_800_000_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  jest.spyOn(console, 'error').mockImplementation(() => {})

  ;({ marketService } = await import('#services/marketService.js'))
})

afterEach(() => jest.restoreAllMocks())

describe('marketService.getOverview', () => {
  it('monta dólar, Selic e CDI quando tudo responde', async () => {
    respondWith(healthy)

    const result = await marketService.getOverview()

    expect(result).toEqual({
      dolar: {
        value: 5.0364,
        variationPct: -0.0754,
        updatedAt: '2026-10-20 10:00:00'
      },
      selic: {
        date: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
        value: 13.75
      },
      cdi: {
        date: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
        value: 13.65
      }
    })
    expect(clients[BCB].get).not.toHaveBeenCalled()
  })

  it('usa o BCB como reserva quando a BrasilAPI falha', async () => {
    respondWith({
      ...healthy,
      selic: fail,
      cdi: fail,
      bcb: async (url) => ({
        data: [
          {
            data: '17/10/2026',
            valor: url.includes('1178') ? '13.65' : '13.55'
          }
        ]
      })
    })

    const { selic, cdi } = await marketService.getOverview()

    expect(selic).toEqual({ date: '17/10/2026', value: 13.65 })
    expect(cdi).toEqual({ date: '17/10/2026', value: 13.55 })
  })

  it('trata a página HTML de bloqueio do BCB como falha (não como dado)', async () => {
    respondWith({
      ...healthy,
      selic: fail,
      cdi: fail,
      bcb: async () => ({ data: '<html>A sua requisição foi rejeitada</html>' })
    })

    const result = await marketService.getOverview()

    expect(result.selic).toBeNull()
    expect(result.cdi).toBeNull()
    expect(result.dolar).not.toBeNull()
  })

  it('usa o BCB como reserva do dólar quando a AwesomeAPI falha', async () => {
    respondWith({
      ...healthy,
      dolar: fail,
      bcb: async () => ({
        data: [
          { data: '28/10/2026', valor: '5.0000' },
          { data: '29/10/2026', valor: '5.1000' }
        ]
      })
    })

    const { dolar } = await marketService.getOverview()

    expect(dolar.value).toBe(5.1)
    expect(dolar.variationPct).toBeCloseTo(2, 5)
    expect(dolar.updatedAt).toBe('29/10/2026')
  })

  it('reserva do dólar com um único dia no BCB tem variação 0', async () => {
    respondWith({
      ...healthy,
      dolar: fail,
      bcb: async () => ({ data: [{ data: '29/10/2026', valor: '5.1000' }] })
    })

    const { dolar } = await marketService.getOverview()

    expect(dolar).toEqual({
      value: 5.1,
      variationPct: 0,
      updatedAt: '29/10/2026'
    })
  })

  it('a falha de um indicador não derruba os outros', async () => {
    respondWith({ ...healthy, dolar: fail })

    const result = await marketService.getOverview()

    expect(result.dolar).toBeNull()
    expect(result.selic.value).toBe(13.75)
    expect(result.cdi.value).toBe(13.65)
  })

  it.each([null, '', '   ', 'abc', undefined])(
    'taxa sem valor numérico (%p) vira indisponível, e não 0%%',
    async (valor) => {
      respondWith({
        ...healthy,
        selic: async () => ({ data: { nome: 'SELIC', valor } }),
        bcb: async () => ({ data: [{ data: '17/10/2026', valor }] })
      })

      const result = await marketService.getOverview()

      expect(result.selic).toBeNull()
    }
  )

  it('dólar sem cotação vira indisponível, e não NaN/null no valor', async () => {
    respondWith({
      ...healthy,
      dolar: async () => ({ data: { USDBRL: { bid: '', pctChange: '0.1' } } })
    })

    const result = await marketService.getOverview()

    expect(result.dolar).toBeNull()
  })

  it('variação ausente do dólar vira 0', async () => {
    respondWith({
      ...healthy,
      dolar: async () => ({
        data: { USDBRL: { bid: '5.10', create_date: 'x' } }
      })
    })

    const { dolar } = await marketService.getOverview()

    expect(dolar).toEqual({ value: 5.1, variationPct: 0, updatedAt: 'x' })
  })

  it('502 quando todas as fontes falham', async () => {
    respondWith({ dolar: fail, selic: fail, cdi: fail })

    await expect(marketService.getOverview()).rejects.toMatchObject({
      statusCode: 502,
      message: 'Serviço de mercado indisponível'
    })
  })
})

describe('marketService: cache', () => {
  it('dentro do TTL não chama as APIs de novo', async () => {
    respondWith(healthy)

    await marketService.getOverview()
    const callsAfterFirst = totalCalls()
    now += 30 * 1000
    await marketService.getOverview()

    expect(callsAfterFirst).toBe(3)
    expect(totalCalls()).toBe(3)
  })

  it('requisições simultâneas compartilham uma única chamada externa', async () => {
    respondWith(healthy)

    await Promise.all([
      marketService.getOverview(),
      marketService.getOverview(),
      marketService.getOverview()
    ])

    expect(totalCalls()).toBe(3)
  })

  it('o dólar expira em 1 minuto; Selic e CDI só em 1 hora', async () => {
    respondWith(healthy)
    await marketService.getOverview()

    now += 61 * 1000
    await marketService.getOverview()

    expect(clients[AWESOME].get).toHaveBeenCalledTimes(2)
    expect(clients[BRASIL_API].get).toHaveBeenCalledTimes(2)
  })

  it('se a API cair depois, devolve o último valor bom', async () => {
    respondWith(healthy)
    const first = await marketService.getOverview()

    respondWith({ dolar: fail, selic: fail, cdi: fail })
    now += 2 * 60 * 60 * 1000

    await expect(marketService.getOverview()).resolves.toEqual(first)
  })

  it('depois de uma falha, espera 1 minuto antes de tentar de novo', async () => {
    respondWith({ ...healthy, dolar: fail })
    await marketService.getOverview()

    now += 30 * 1000
    await marketService.getOverview()
    expect(clients[AWESOME].get).toHaveBeenCalledTimes(1)

    now += 31 * 1000
    respondWith(healthy)
    const result = await marketService.getOverview()
    expect(clients[AWESOME].get).toHaveBeenCalledTimes(2)
    expect(result.dolar).not.toBeNull()
  })
})
