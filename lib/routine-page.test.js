// Pure-function tests with small fixtures: no database, no Express, no browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PRECAUTION_LINE, conflictArea, buildRoutinePage } = require('./routine-page');

const actives = [
  { id: 'retinol', name: 'Retinol', inciAliases: ['Retinol'], category: 'retinoid' },
  { id: 'glycolic-acid', name: 'Glycolic acid', inciAliases: ['Glycolic Acid'], category: 'aha' },
  { id: 'niacinamide', name: 'Niacinamide', inciAliases: ['Niacinamide'], category: 'brightening' },
  { id: 'hyaluronic-acid', name: 'Hyaluronic acid', inciAliases: ['Sodium Hyaluronate'], category: 'hydration-and-barrier' },
];
const rules = [
  { id: 'aha-retinoid', a: 'aha', b: 'retinoid', severity: 'caution', scope: 'same-routine', reason: 'One reason.', sourceUrl: 'https://example.org/x' },
  { id: 'ignored', a: 'aha', b: 'retinoid', severity: 'avoid', scope: 'other-scope', reason: 'Not used.', sourceUrl: 'https://example.org/y' },
];
const row = (id, name, ingredients_raw) => ({ id, name, ingredients_raw });
const everyProduct = [{ id: 1, name: 'Toner' }, { id: 2, name: 'Serum' }, { id: 3, name: 'Cream' }];
const build = (rowsByPeriod, period = 'am', products = everyProduct) =>
  buildRoutinePage({ period, rowsByPeriod, allProducts: products, actives, rules });

test('routine page: always has the AM panel first and the PM panel second, and marks the current one', () => {
  const page = build({ am: [], pm: [] }, 'pm');
  assert.deepEqual(page.panels.map((p) => p.period), ['am', 'pm']);
  assert.deepEqual(page.panels.map((p) => p.isCurrent), [false, true]);
  assert.deepEqual(page.panels.map((p) => p.label), ['Morning Routine', 'Evening Routine']);
  assert.deepEqual(page.panels.map((p) => p.shortLabel), ['Morning', 'Evening']);
});

test('routine page: counts come from the data, not from numbers typed into the page', () => {
  const page = build({ am: [], pm: [] });
  assert.equal(page.knownCount, 4);
  assert.equal(page.ruleCount, 1); // only same-routine rules
});

test('routine page: steps are numbered from 1 in the order of the routine, with actives and main category', () => {
  const { panels } = build({ am: [row(2, 'Serum', 'Aqua, Niacinamide, Sodium Hyaluronate'), row(1, 'Toner', 'Aqua, Glycolic Acid'), row(3, 'Cream', 'Aqua')], pm: [] });
  assert.deepEqual(panels[0].items.map((i) => [i.step, i.name, i.mainCategory]), [
    [1, 'Serum', 'brightening'], [2, 'Toner', 'aha'], [3, 'Cream', null],
  ]);
  assert.deepEqual(panels[0].items[0].actives.map((a) => a.name), ['Niacinamide', 'Hyaluronic acid']);
  assert.deepEqual(panels[0].items[2].actives, []);
});

test('routine page: each panel offers only the products that are not already in that routine', () => {
  const { panels } = build({ am: [row(1, 'Toner', 'Aqua')], pm: [row(2, 'Serum', 'Aqua'), row(3, 'Cream', 'Aqua')] });
  assert.deepEqual(panels[0].available.map((p) => p.id), [2, 3]);
  assert.deepEqual(panels[1].available.map((p) => p.id), [1]);
  assert.equal(panels[0].hasAnyProduct, true);
  assert.equal(build({ am: [], pm: [] }, 'am', []).panels[0].hasAnyProduct, false);
});

test('routine page: a conflict becomes a card with a short title, the level, the reason and the source', () => {
  const { panels } = build({ am: [], pm: [row(1, 'Toner', 'Aqua, Glycolic Acid'), row(2, 'Serum', 'Aqua, Retinol')] }, 'pm');
  const pm = panels[1];
  assert.equal(pm.warnings.length, 1);
  assert.deepEqual(pm.warnings[0], {
    severity: 'caution', level: 'Use With Care', headline: 'maybe not together', pair: ['Glycolic acid', 'Retinol'],
    title: 'Glycolic acid with Retinol', reason: 'One reason.', sourceUrl: 'https://example.org/x', sourceName: 'example.org', inSameProduct: false,
  });
  assert.equal(pm.precaution, PRECAUTION_LINE);
  assert.equal(pm.conflicts.status, 'conflicts');
  // the other routine is judged on its own
  assert.equal(panels[0].warnings.length, 0);
  assert.equal(panels[0].precaution, null);
});

test('routine page: the precaution is worded as general advice, not as a sourced rule', () => {
  assert.match(PRECAUTION_LINE, /^A common precaution: /);
  assert.match(PRECAUTION_LINE, /patch test changes and introduce one product at a time\.$/);
});

test('routine page: two actives in one product are still flagged, and the card can say so', () => {
  const { panels } = build({ am: [row(1, 'Combo', 'Glycolic Acid, Retinol')], pm: [] });
  assert.equal(panels[0].warnings[0].inSameProduct, true);
});

test('conflict area: the calm card appears only when there were at least two actives to compare', () => {
  const area = conflictArea({ productCount: 2, activeCount: 3, warnings: [], knownCount: 28, ruleCount: 4 });
  assert.equal(area.status, 'clear');
  assert.equal(area.heading, 'No conflicts found among the 28 actives we know');
  assert.deepEqual(area.checks, [
    '3 known actives in this routine were checked',
    'Every pair was compared with our 4 sourced conflict rules',
    'Morning and evening routines are checked separately',
  ]);
  assert.match(area.reminder, /^No warning does not mean this routine suits you\./);
});

test('conflict area: says "rule" for one rule', () => {
  const area = conflictArea({ productCount: 2, activeCount: 2, warnings: [], knownCount: 28, ruleCount: 1 });
  assert.match(area.checks[1], /our 1 sourced conflict rule$/);
});

test('conflict area: no "no conflicts" claim for an empty routine, no actives, or one active', () => {
  const none = conflictArea({ productCount: 0, activeCount: 0, warnings: [], knownCount: 28, ruleCount: 4 });
  const zero = conflictArea({ productCount: 2, activeCount: 0, warnings: [], knownCount: 28, ruleCount: 4 });
  const one = conflictArea({ productCount: 2, activeCount: 1, warnings: [], knownCount: 28, ruleCount: 4 });
  for (const area of [none, zero, one]) {
    assert.equal(area.status, 'nothing-to-compare');
    assert.doesNotMatch(area.message, /no conflicts found/i);
    assert.equal(area.heading, undefined);
  }
  assert.match(none.message, /^Add products/);
  assert.match(zero.message, /No known actives were found/);
  assert.match(one.message, /Only one known active/);
});

test('routine page: with real data the claim uses the real counts', () => {
  const page = buildRoutinePage({
    period: 'am',
    rowsByPeriod: { am: [row(1, 'A', 'Niacinamide'), row(2, 'B', 'Sodium Hyaluronate')], pm: [] },
    allProducts: everyProduct,
  });
  const area = page.panels[0].conflicts;
  assert.equal(area.status, 'clear');
  assert.equal(area.heading, `No conflicts found among the ${require('../data/actives.json').length} actives we know`);
});

test('routine page: bad input gives two empty panels and never throws', () => {
  for (const bad of [undefined, null, {}, { am: 'x', pm: 5 }]) {
    const page = buildRoutinePage({ period: 'am', rowsByPeriod: bad, allProducts: undefined, actives, rules });
    assert.equal(page.panels.length, 2);
    assert.deepEqual(page.panels.map((p) => p.items.length), [0, 0]);
  }
});
