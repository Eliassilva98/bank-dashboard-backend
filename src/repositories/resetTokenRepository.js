import { pool } from '#config/database.js'

export const resetTokenRepository = {
  async create({ userId, tokenHash, expiresAt }, db = pool) {
    const { rows } = await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, expires_at`,
      [userId, tokenHash, expiresAt]
    )
    return rows[0]
  },

  async consumeValidByHash(tokenHash, db = pool) {
    const { rows } = await db.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING user_id`,
      [tokenHash]
    )
    return rows[0] ?? null
  },

  async invalidateAllForUser(userId, db = pool) {
    await db.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    )
  }
}
