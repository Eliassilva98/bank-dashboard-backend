import { jest } from '@jest/globals'

export const mockDatabase = () => {
  const client = { query: jest.fn() }
  const database = {
    pool: { query: jest.fn() },
    withTransaction: jest.fn()
  }

  const repositories = {
    userRepository: {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn()
    },
    accountRepository: {
      findByUserId: jest.fn(),
      findByUserEmail: jest.fn(),
      create: jest.fn(),
      lockByIds: jest.fn(),
      debit: jest.fn(),
      credit: jest.fn()
    },
    transactionRepository: {
      create: jest.fn(),
      listByAccountIdWithPagination: jest.fn(),
      countByAccountId: jest.fn()
    },
    resetTokenRepository: {
      create: jest.fn(),
      consumeValidByHash: jest.fn(),
      invalidateAllForUser: jest.fn()
    }
  }

  const mailService = { sendPasswordReset: jest.fn() }

  jest.unstable_mockModule('#config/database.js', () => database)
  jest.unstable_mockModule('#services/mailService.js', () => ({ mailService }))

  for (const [name, repository] of Object.entries(repositories)) {
    jest.unstable_mockModule(`#repositories/${name}.js`, () => ({
      [name]: repository
    }))
  }

  const reset = () => {
    jest.resetAllMocks()
    database.withTransaction.mockImplementation((callback) => callback(client))
    mailService.sendPasswordReset.mockResolvedValue({})
  }

  reset()

  return { client, database, mailService, ...repositories, reset }
}
