const express = require('express');
const requireLogin = require('../auth/require-login');
const notFound = require('./not-found');
const defaultActives = require('../data/actives.json');
const { findActives } = require('../lib/ingredients');
const { parseId, validateProduct } = require('../lib/products');

// store: createProductStore(pool) from db/products.js.
// The user id always comes from req.user.id. Nothing from the request body or URL names a user.
function createProductsRouter(store, actives = defaultActives) {
  const router = express.Router();
  router.use(requireLogin);

  // Actives are worked out here, on every read, and never stored.
  async function render(req, res, status, errors, values) {
    const rows = await store.list(req.user.id);
    const products = rows.map((row) => ({
      id: row.id,
      name: row.name,
      ingredients: row.ingredients_raw,
      actives: findActives(row.ingredients_raw, actives).map((active) => active.name),
    }));
    res.status(status).render('products', { title: 'My products', products, errors, values });
  }

  router.get('/', (req, res) => render(req, res, 200, {}, {}));

  router.post('/', async (req, res) => {
    const { errors, clean } = validateProduct(req.body);
    if (Object.keys(errors).length > 0) {
      return render(req, res, 400, errors, { name: clean.name, ingredients: clean.ingredients });
    }
    await store.add(req.user.id, clean);
    res.redirect('/products');
  });

  router.post('/:id/delete', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const removed = await store.remove(req.user.id, id);
    if (!removed) return notFound(res); // missing, or someone else's: same answer
    res.redirect('/products');
  });

  return router;
}

module.exports = { createProductsRouter };
