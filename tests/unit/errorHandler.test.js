import { describe, expect, it, jest } from '@jest/globals'
import { errorHandler } from '#middlewares/errorHandler.js'
import { AppError } from '#utils/AppError.js'

const createResponse = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

describe('errorHandler', () => {
  it('devolve o status e a mensagem de um AppError', () => {
    const res = createResponse()

    errorHandler(new AppError('Saldo insuficiente', 400), {}, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Saldo insuficiente'
    })
  })

  it('esconde a mensagem de erros inesperados (500)', () => {
    const res = createResponse()
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    errorHandler(new Error('senha do banco: 123'), {}, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Erro interno do servidor'
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('trata JSON malformado como 400', () => {
    const res = createResponse()
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed'
    })

    errorHandler(error, {}, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'JSON inválido no corpo da requisição'
    })
  })
})
