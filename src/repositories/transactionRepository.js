import { pool } from '#config/database.js'

export const transactionRepository = {
  async create(
    { accountId, counterpartyAccountId, type, amount, description },
    db = pool
  ) {
    const { rows } = await db.query(
      `INSERT INTO transactions (account_id, counterparty_account_id, type, amount, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, counterparty_account_id, type, amount, description, created_at`,
      [accountId, counterpartyAccountId, type, amount, description]
    )
    return rows[0]
  },

  async listByAccountIdWithPagination(accountId, limit, offset, db = pool) {
    const { rows } = await db.query(
      `SELECT
        t.id, t.type, t.amount, t.counterparty_account_id, t.description, t.created_at,
        cu.name AS counterparty_name
       FROM transactions t
       LEFT JOIN accounts cp ON cp.id = t.counterparty_account_id
       LEFT JOIN users cu ON cu.id = cp.user_id
       WHERE t.account_id = $1
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    )
    return rows
  },

  async countByAccountId(accountId, db = pool) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM transactions WHERE account_id = $1',
      [accountId]
    )
    return rows[0].total
  }
}
