import { describe, expect, it } from '@jest/globals'
import { parsePagination } from '#utils/pagination.js'
import { AppError } from '#utils/AppError.js'

describe('parsePagination', () => {
  it('usa page 1 e pageSize 10 quando nada é informado', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 10 })
  })

  it('trata string vazia como ausente', () => {
    expect(parsePagination({ page: '', pageSize: '' })).toEqual({
      page: 1,
      pageSize: 10
    })
  })

  it('converte valores válidos para número', () => {
    expect(parsePagination({ page: '3', pageSize: '25' })).toEqual({
      page: 3,
      pageSize: 25
    })
  })

  it('aceita pageSize no limite de 50', () => {
    expect(parsePagination({ pageSize: '50' }).pageSize).toBe(50)
  })

  it.each(['0', '-1', 'abc', '1.5', '1e3', ' 2'])(
    'rejeita page inválido: %p',
    (page) => {
      expect(() => parsePagination({ page })).toThrow(AppError)
    }
  )

  it('rejeita parâmetro repetido na query (array)', () => {
    expect(() => parsePagination({ page: ['1', '2'] })).toThrow(
      "'page' deve ser um número inteiro maior que zero"
    )
  })

  it('rejeita pageSize acima de 50', () => {
    expect(() => parsePagination({ pageSize: '51' })).toThrow(
      "'pageSize' deve ser no máximo 50"
    )
  })

  it('os erros são 400', () => {
    try {
      parsePagination({ page: '0' })
    } catch (error) {
      expect(error.statusCode).toBe(400)
    }
    expect.assertions(1)
  })
})
