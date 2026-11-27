// Turns one routine's products into "which actives are in it" and "which warnings apply".
// Pure function: no database, no Express. Actives are computed here on every read, never stored.
const defaultActives = require('../data/actives.json');
const defaultRules = require('../data/rules.json');
const { findActives } = require('./ingredients');
const { checkRoutine } = require('./rules');

// products: rows like { id, name, ingredients_raw } (all belong to ONE routine, e.g. the AM one).
// Returns:
//   actives:  [{ id, name, category, products: [product names] }], in the order they first appear
//   warnings: checkRoutine warnings, each with
//               details:       [{ id, name }, { id, name }] for the two actives
//               inSameProduct: true when one product already contains both actives
//                              (a product can be formulated for that, so the page can say so)
function summarizeRoutine(products, actives = defaultActives, rules = defaultRules) {
  if (!Array.isArray(products) || !Array.isArray(actives)) return { actives: [], warnings: [] };

  const found = new Map(); // active id -> { id, name, category, products: [] }
  const idsByProduct = []; // one Set of active ids per usable product

  for (const product of products) {
    if (typeof product !== 'object' || product === null || typeof product.ingredients_raw !== 'string') continue;
    const productName = typeof product.name === 'string' ? product.name : '';
    const ids = new Set();

    for (const active of findActives(product.ingredients_raw, actives)) {
      ids.add(active.id);
      if (!found.has(active.id)) {
        found.set(active.id, { id: active.id, name: active.name, category: active.category, products: [] });
      }
      const entry = found.get(active.id);
      if (!entry.products.includes(productName)) entry.products.push(productName);
    }
    idsByProduct.push(ids);
  }

  const warnings = checkRoutine([...found.keys()], actives, rules).map((warning) => {
    const [x, y] = warning.actives;
    return {
      ...warning,
      details: [
        { id: x, name: found.get(x).name },
        { id: y, name: found.get(y).name },
      ],
      inSameProduct: idsByProduct.some((ids) => ids.has(x) && ids.has(y)),
    };
  });

  return { actives: [...found.values()], warnings };
}

module.exports = { summarizeRoutine };
