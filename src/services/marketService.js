import axios from 'axios'
import { AppError } from '#utils/AppError.js'

const AWESOME_TIMEOUT_MS = 5000
const BRASIL_API_TIMEOUT_MS = 5000
const BCB_TIMEOUT_MS = 10000
const DOLAR_CACHE_TTL_MS = 60 * 1000
const INTEREST_CACHE_TTL_MS = 60 * 60 * 1000
const FAILURE_COOLDOWN_MS = 60 * 1000

const SGS_SERIES = {
  selic: 1178,
  cdi: 4389
}

const brasilApiClient = axios.create({
  baseURL: 'https://brasilapi.com.br/api/taxas/v1',
  timeout: BRASIL_API_TIMEOUT_MS
})

const bcbClient = axios.create({
  baseURL: 'https://api.bcb.gov.br/dados/serie',
  timeout: BCB_TIMEOUT_MS
})

const awesomeApiClient = axios.create({
  baseURL: 'https://economia.awesomeapi.com.br/json',
  timeout: AWESOME_TIMEOUT_MS
})

const withCache = (loader, ttlMs) => {
  let cachedValue = null
  let expiresAt = 0
  let retryAt = 0
  let lastError = null
  let pending = null

  return async () => {
    if (cachedValue !== null && Date.now() < expiresAt) {
      return cachedValue
    }

    if (!pending && Date.now() >= retryAt) {
      pending = loader()
        .then((value) => {
          cachedValue = value
          expiresAt = Date.now() + ttlMs
          lastError = null
          return value
        })
        .catch((error) => {
          lastError = error
          retryAt = Date.now() + FAILURE_COOLDOWN_MS
          throw error
        })
        .finally(() => {
          pending = null
        })
    }

    try {
      if (pending) return await pending
      throw lastError
    } catch (error) {
      if (cachedValue !== null) return cachedValue
      throw error
    }
  }
}

const getData = async (client, url) => {
  try {
    const { data } = await client.get(url)

    if (typeof data === 'string') {
      throw new Error('a resposta não é JSON')
    }

    return data
  } catch (error) {
    console.error(`[market] falha ao consultar ${url}: ${error.message}`)
    throw new AppError('Serviço de mercado indisponível', 502)
  }
}

const toNumber = (raw) => {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) {
    return null
  }

  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const fetchDolar = async () => {
  const data = await getData(awesomeApiClient, '/last/USD-BRL')
  const value = toNumber(data?.USDBRL?.bid)

  if (value === null) {
    throw new AppError('Serviço de mercado indisponível', 502)
  }

  return {
    value,
    variationPct: toNumber(data.USDBRL.pctChange) ?? 0,
    updatedAt: data.USDBRL.create_date
  }
}

const todayBr = () => new Date().toLocaleDateString('pt-BR')

const fetchFromBrasilApi = async (name) => {
  const data = await getData(brasilApiClient, `/${name}`)
  const value = toNumber(data?.valor)

  if (value === null) {
    throw new AppError('Serviço de mercado indisponível', 502)
  }

  return { date: todayBr(), value }
}

const fetchFromBcb = async (seriesId) => {
  const data = await getData(
    bcbClient,
    `/bcdata.sgs.${seriesId}/dados/ultimos/1?formato=json`
  )
  const entry = Array.isArray(data) ? data[0] : null
  const value = toNumber(entry?.valor)

  if (!entry || value === null) {
    throw new AppError('Serviço de mercado indisponível', 502)
  }

  return { date: entry.data, value }
}

const fetchInterestRate = async (name) => {
  try {
    return await fetchFromBrasilApi(name)
  } catch {
    return fetchFromBcb(SGS_SERIES[name])
  }
}

const getCachedDolar = withCache(fetchDolar, DOLAR_CACHE_TTL_MS)
const getCachedSelic = withCache(
  () => fetchInterestRate('selic'),
  INTEREST_CACHE_TTL_MS
)
const getCachedCdi = withCache(
  () => fetchInterestRate('cdi'),
  INTEREST_CACHE_TTL_MS
)

const valueOrNull = (result) =>
  result.status === 'fulfilled' ? result.value : null

export const marketService = {
  async getOverview() {
    const results = await Promise.allSettled([
      getCachedDolar(),
      getCachedSelic(),
      getCachedCdi()
    ])

    const [dolar, selic, cdi] = results.map(valueOrNull)

    if (!dolar && !selic && !cdi) {
      throw new AppError('Serviço de mercado indisponível', 502)
    }

    return { dolar, selic, cdi }
  }
}
