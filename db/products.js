// Product queries. A factory that receives the pool (like configurePassport), so tests can pass a
// fake pool and this file never requires db/pool.js.
//
// Ownership rule: every query is filtered by the user id the caller passes in, which routes take
// from req.user.id and nowhere else. A product id from a request is only ever used together with it.

function createProductStore(pool) {
  return {
    // All products of one user, newest first.
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT id, name, ingredients_raw, created_at
           FROM products
          WHERE user_id = $1
          ORDER BY created_at DESC, id DESC`,
        [userId],
      );
      return rows;
    },

    // `product` is already validated (lib/products.js validateProduct).
    async add(userId, { name, ingredients }) {
      const { rows } = await pool.query(
        `INSERT INTO products (user_id, name, ingredients_raw)
         VALUES ($1, $2, $3)
         RETURNING id, name`,
        [userId, name, ingredients],
      );
      return rows[0];
    },

    // true if a product of THIS user was deleted. false for a missing id and for another user's id
    // alike, so the route answers 404 in both cases. routine_items rows go away by ON DELETE CASCADE.
    async remove(userId, productId) {
      const result = await pool.query(
        `DELETE FROM products
          WHERE id = $1 AND user_id = $2`,
        [productId, userId],
      );
      return result.rowCount > 0;
    },
  };
}

module.exports = { createProductStore };
