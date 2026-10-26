import { pool } from '#config/database.js'

export const userRepository = {
  async findByEmail(email, db = pool) {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [
      email
    ])
    return rows[0] ?? null
  },

  async create({ name, email, passwordHash }, db = pool) {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    )
    return rows[0]
  },

  async updatePasswordHash(userId, passwordHash, db = pool) {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    )
  }
}
