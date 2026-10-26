import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const client = { query: jest.fn(), release: jest.fn() }
const pool = { connect: jest.fn(async () => client), query: jest.fn() }

jest.unstable_mockModule('pg', () => ({
  default: { Pool: jest.fn(() => pool) }
}))

const { withTransaction } = await import('#config/database.js')

const executedQueries = () => client.query.mock.calls.map(([sql]) => sql)

describe('withTransaction', () => {
  beforeEach(() => {
    client.query.mockReset()
    client.release.mockReset()
  })

  it('faz BEGIN, executa o callback, COMMIT e libera a conexão', async () => {
    const result = await withTransaction(async (db) => {
      await db.query('SELECT 1')
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(executedQueries()).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('faz ROLLBACK, repassa o erro e ainda libera a conexão', async () => {
    const failure = new Error('falhou no meio')

    await expect(
      withTransaction(async (db) => {
        await db.query('UPDATE accounts')
        throw failure
      })
    ).rejects.toBe(failure)

    expect(executedQueries()).toEqual(['BEGIN', 'UPDATE accounts', 'ROLLBACK'])
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})
