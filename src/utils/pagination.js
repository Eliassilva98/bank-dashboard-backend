import { AppError } from './AppError.js'

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50

const INTEGER_REGEX = /^\d+$/

function parsePositiveInteger(rawValue, { name, defaultValue, max }) {
  if (rawValue === undefined || rawValue === '') return defaultValue

  if (typeof rawValue !== 'string' || !INTEGER_REGEX.test(rawValue)) {
    throw new AppError(`'${name}' deve ser um número inteiro maior que zero`)
  }

  const value = Number(rawValue)

  if (value < 1) {
    throw new AppError(`'${name}' deve ser um número inteiro maior que zero`)
  }

  if (max !== undefined && value > max) {
    throw new AppError(`'${name}' deve ser no máximo ${max}`)
  }

  return value
}

export function parsePagination(query) {
  return {
    page: parsePositiveInteger(query.page, {
      name: 'page',
      defaultValue: 1,
      max: Number.MAX_SAFE_INTEGER
    }),
    pageSize: parsePositiveInteger(query.pageSize, {
      name: 'pageSize',
      defaultValue: DEFAULT_PAGE_SIZE,
      max: MAX_PAGE_SIZE
    })
  }
}
