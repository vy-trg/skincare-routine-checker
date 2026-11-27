const express = require('express');
const requireLogin = require('../auth/require-login');
const notFound = require('./not-found');
const { parseId, parsePeriod } = require('../lib/products');
const { LABELS, buildRoutinePage } = require('../lib/routine-page');

// stores.routines: createRoutineStore(pool); stores.products: createProductStore(pool).
// A routine is never named by an id from the request: it is "this user's AM/PM routine".
function createRoutinesRouter({ routines, products }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/:period', async (req, res, next) => {
    const period = parsePeriod(req.params.period);
    if (period === null) return next(); // unknown period: falls through to the normal 404

    // Both routines are read: wide screens show AM and PM side by side. Every query is for this user only.
    const [am, pm, allProducts] = await Promise.all([
      routines.getProducts(req.user.id, 'am'),
      routines.getProducts(req.user.id, 'pm'),
      products.list(req.user.id),
    ]);

    res.render('routine', {
      title: LABELS[period],
      period,
      page: buildRoutinePage({ period, rowsByPeriod: { am, pm }, allProducts }),
    });
  });

  router.post('/:period/items', async (req, res, next) => {
    const period = parsePeriod(req.params.period);
    if (period === null) return next();
    const productId = parseId(req.body && req.body.product_id);
    if (productId === null) return notFound(res);

    const result = await routines.addItem(req.user.id, period, productId);
    if (result === 'not-found') return notFound(res); // missing, or someone else's product
    res.redirect(`/routines/${period}`); // 'already' is fine too: adding twice changes nothing
  });

  router.post('/:period/items/:productId/delete', async (req, res, next) => {
    const period = parsePeriod(req.params.period);
    if (period === null) return next();
    const productId = parseId(req.params.productId);
    if (productId === null) return notFound(res);

    const removed = await routines.removeItem(req.user.id, period, productId);
    if (!removed) return notFound(res);
    res.redirect(`/routines/${period}`);
  });

  return router;
}

module.exports = { createRoutinesRouter };
