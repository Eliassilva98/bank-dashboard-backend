import pg from 'pg'
import { env } from './env.js'

export const pool = new pg.Pool({ connectionString: env.databaseUrl })

export const withTransaction = async (callback) => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
