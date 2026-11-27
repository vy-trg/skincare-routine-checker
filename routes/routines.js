const express = require('express');
const requireLogin = require('../auth/require-login');
const notFound = require('./not-found');
const { parseId, parsePeriod } = require('../lib/products');
const { summarizeRoutine } = require('../lib/routine-summary');

const LABELS = { am: 'Morning routine', pm: 'Evening routine' };

// stores.routines: createRoutineStore(pool); stores.products: createProductStore(pool).
// A routine is never named by an id from the request: it is "this user's AM/PM routine".
function createRoutinesRouter({ routines, products }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/:period', async (req, res, next) => {
    const period = parsePeriod(req.params.period);
    if (period === null) return next(); // unknown period: falls through to the normal 404

    const [inRoutine, allProducts] = await Promise.all([
      routines.getProducts(req.user.id, period),
      products.list(req.user.id),
    ]);
    const usedIds = new Set(inRoutine.map((row) => row.id));
    const available = allProducts.filter((row) => !usedIds.has(row.id));
    const summary = summarizeRoutine(inRoutine);

    res.render('routine', {
      title: LABELS[period],
      period,
      label: LABELS[period],
      otherPeriod: period === 'am' ? 'pm' : 'am',
      otherLabel: period === 'am' ? LABELS.pm : LABELS.am,
      items: inRoutine.map((row) => ({ id: row.id, name: row.name })),
      available: available.map((row) => ({ id: row.id, name: row.name })),
      hasAnyProduct: allProducts.length > 0,
      actives: summary.actives,
      warnings: summary.warnings,
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
