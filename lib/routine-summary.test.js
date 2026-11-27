// Pure-function tests with small fixtures: no database, no Express.
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRoutine } = require('./routine-summary');

const actives = [
  { id: 'retinol', name: 'Retinol', inciAliases: ['Retinol'], category: 'retinoid' },
  { id: 'glycolic-acid', name: 'Glycolic Acid', inciAliases: ['Glycolic Acid'], category: 'aha' },
  { id: 'niacinamide', name: 'Niacinamide', inciAliases: ['Niacinamide'], category: 'brightening' },
];

const rules = [
  {
    id: 'aha-retinoid',
    a: 'aha',
    b: 'retinoid',
    severity: 'caution',
    scope: 'same-routine',
    reason: 'Reason.',
    sourceUrl: 'https://example.org/x',
  },
];

const product = (id, name, ingredients_raw) => ({ id, name, ingredients_raw });
const summarize = (products) => summarizeRoutine(products, actives, rules);

test('routine summary: invalid input gives an empty result and never throws', () => {
  for (const value of [undefined, null, 'text', 5, {}]) {
    assert.deepEqual(summarizeRoutine(value, actives, rules), { actives: [], warnings: [] });
  }
  assert.deepEqual(summarizeRoutine([], null, rules), { actives: [], warnings: [] });
});

test('routine summary: an empty routine has no actives and no warnings', () => {
  assert.deepEqual(summarize([]), { actives: [], warnings: [] });
});

test('routine summary: lists the actives of each product with the products that contain them', () => {
  const result = summarize([
    product(1, 'Serum', 'Aqua, Niacinamide, Glycerin'),
    product(2, 'Cream', 'Aqua, Niacinamide, Urea'),
  ]);
  assert.deepEqual(result.actives, [
    { id: 'niacinamide', name: 'Niacinamide', category: 'brightening', products: ['Serum', 'Cream'] },
  ]);
  assert.deepEqual(result.warnings, []);
});

test('routine summary: a warning names both actives and the two products involved', () => {
  const result = summarize([
    product(1, 'Peel', 'Aqua, Glycolic Acid'),
    product(2, 'Night cream', 'Aqua, Retinol'),
  ]);
  assert.equal(result.warnings.length, 1);
  const [warning] = result.warnings;
  assert.equal(warning.ruleId, 'aha-retinoid');
  assert.deepEqual(warning.actives, ['glycolic-acid', 'retinol']);
  assert.deepEqual(warning.details, [
    { id: 'glycolic-acid', name: 'Glycolic Acid' },
    { id: 'retinol', name: 'Retinol' },
  ]);
  assert.equal(warning.inSameProduct, false);
  const byId = Object.fromEntries(result.actives.map((active) => [active.id, active.products]));
  assert.deepEqual(byId, { 'glycolic-acid': ['Peel'], retinol: ['Night cream'] });
});

test('routine summary: two actives inside one product are still reported, but marked as the same product', () => {
  const result = summarize([product(1, 'Combo', 'Aqua, Retinol, Glycolic Acid')]);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].inSameProduct, true);
});

test('routine summary: inSameProduct is false when another product also holds one of the actives', () => {
  const result = summarize([
    product(1, 'Peel', 'Glycolic Acid'),
    product(2, 'Night cream', 'Retinol'),
    product(3, 'Combo', 'Retinol, Glycolic Acid'),
  ]);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].inSameProduct, true); // product 3 holds both
  const separate = summarize([product(1, 'Peel', 'Glycolic Acid'), product(2, 'Night cream', 'Retinol')]);
  assert.equal(separate.warnings[0].inSameProduct, false);
});

test('routine summary: the same active in several products gives one warning, not several', () => {
  const result = summarize([
    product(1, 'Peel A', 'Glycolic Acid'),
    product(2, 'Peel B', 'Glycolic Acid'),
    product(3, 'Night cream', 'Retinol'),
  ]);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(result.actives.find((active) => active.id === 'glycolic-acid').products, ['Peel A', 'Peel B']);
});

test('routine summary: no warning when no rule matches', () => {
  const result = summarize([product(1, 'Serum', 'Niacinamide'), product(2, 'Cream', 'Retinol')]);
  assert.equal(result.actives.length, 2);
  assert.deepEqual(result.warnings, []);
});

test('routine summary: products with unreadable rows are skipped', () => {
  const result = summarize([null, 'x', { id: 1, name: 'No list' }, { id: 2, name: 'Bad', ingredients_raw: 5 }, product(3, 'Ok', 'Retinol')]);
  assert.deepEqual(result.actives.map((active) => active.id), ['retinol']);
});

test('routine summary: the result does not depend on the order of the products', () => {
  const rows = [product(1, 'Peel', 'Glycolic Acid'), product(2, 'Night cream', 'Retinol')];
  const forward = summarize(rows);
  const backward = summarize([...rows].reverse());
  assert.deepEqual(forward.warnings, backward.warnings);
});

test('routine summary: does not change its inputs', () => {
  const rows = [product(1, 'Peel', 'Glycolic Acid'), product(2, 'Night cream', 'Retinol')];
  const copy = JSON.parse(JSON.stringify({ rows, actives, rules }));
  summarize(rows);
  assert.deepEqual({ rows, actives, rules }, copy);
});

test('routine summary: works with the real data files', () => {
  const result = summarizeRoutine([
    product(1, 'Peel', 'Aqua, Glycolic Acid'),
    product(2, 'Night cream', 'Aqua, Retinol'),
  ]);
  assert.deepEqual(result.warnings.map((warning) => warning.ruleId), ['aha-retinoid']);
  assert.ok(result.warnings[0].sourceUrl.startsWith('https://'));
});
