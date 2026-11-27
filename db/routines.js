// Routine queries. A factory that receives the pool, so tests can pass a fake pool.
//
// A routine is never addressed by an id from a request. It is always "this user's AM (or PM)
// routine", found by (user_id, period). The schema does not stop a routine_items row from
// pointing at another user's product, so this file checks ownership itself.

function createRoutineStore(pool) {
  return {
    // The products in one routine, in routine order. The join on p.user_id = r.user_id means a
    // row that points at someone else's product is never returned, even if one existed.
    async getProducts(userId, period) {
      const { rows } = await pool.query(
        `SELECT p.id, p.name, p.ingredients_raw, ri.position
           FROM routines r
           JOIN routine_items ri ON ri.routine_id = r.id
           JOIN products p ON p.id = ri.product_id AND p.user_id = r.user_id
          WHERE r.user_id = $1 AND r.period = $2
          ORDER BY ri.position, p.id`,
        [userId, period],
      );
      return rows;
    },

    // Adds one of the user's own products to the end of the user's routine.
    // Returns 'added', 'already' (it was in the routine) or 'not-found' (no such product for this
    // user: missing id and another user's id look the same). The routine row is created on demand,
    // and only after the product is known to be the user's, so a rejected request leaves no trace.
    async addItem(userId, period, productId) {
      const owned = await pool.query(
        `SELECT id FROM products WHERE id = $1 AND user_id = $2`,
        [productId, userId],
      );
      if (owned.rowCount === 0) return 'not-found';

      const routine = await pool.query(
        `INSERT INTO routines (user_id, period)
         VALUES ($1, $2)
         ON CONFLICT (user_id, period) DO UPDATE SET period = EXCLUDED.period
         RETURNING id`,
        [userId, period],
      );
      const routineId = routine.rows[0].id;

      const inserted = await pool.query(
        `INSERT INTO routine_items (routine_id, product_id, position)
         SELECT $1::int, $2::int, COALESCE(MAX(position), 0) + 1
           FROM routine_items
          WHERE routine_id = $1::int
         ON CONFLICT (routine_id, product_id) DO NOTHING`,
        [routineId, productId],
      );
      return inserted.rowCount > 0 ? 'added' : 'already';
    },

    // true if the product was in this user's routine and is now removed (the product itself stays).
    async removeItem(userId, period, productId) {
      const result = await pool.query(
        `DELETE FROM routine_items ri
          USING routines r
          WHERE ri.routine_id = r.id
            AND r.user_id = $1
            AND r.period = $2
            AND ri.product_id = $3`,
        [userId, period, productId],
      );
      return result.rowCount > 0;
    },
  };
}

module.exports = { createRoutineStore };
