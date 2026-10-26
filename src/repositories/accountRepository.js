import { pool } from '#config/database.js'

export const accountRepository = {
  async findByUserId(userId, db = pool) {
    const { rows } = await db.query(
      'SELECT id, user_id, balance, updated_at FROM accounts WHERE user_id = $1',
      [userId]
    )
    return rows[0] ?? null
  },

  async findByUserEmail(email, db = pool) {
    const { rows } = await db.query(
      `SELECT a.id, u.name
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE u.email = $1`,
      [email]
    )
    return rows[0] ?? null
  },

  async create(userId, db = pool) {
    const { rows } = await db.query(
      'INSERT INTO accounts (user_id) VALUES ($1) RETURNING id, user_id, balance, updated_at',
      [userId]
    )
    return rows[0]
  },

  async lockByIds(accountIds, db = pool) {
    const { rows } = await db.query(
      'SELECT id FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [accountIds]
    )
    return rows
  },

  async debit(accountId, amount, db = pool) {
    const { rows } = await db.query(
      `UPDATE accounts
      SET balance = balance - $1::numeric, updated_at = NOW()
      WHERE id = $2 AND balance >= $1::numeric
      RETURNING balance`,
      [amount, accountId]
    )
    return rows[0] ?? null
  },

  async credit(accountId, amount, db = pool) {
    const { rows } = await db.query(
      `UPDATE accounts
      SET balance = balance + $1::numeric, updated_at = NOW()
      WHERE id = $2
      RETURNING balance`,
      [amount, accountId]
    )
    return rows[0] ?? null
  }
}
