// Pure-function tests for the home page helpers: no DOM, no network, no database.
// The tests live here, not in public/, because everything in public/ is served to the world.
const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../public/analyse-helpers');
const realActives = require('../data/actives.json');
const { MAX_INPUT_LENGTH } = require('./ingredients');

const sample = [
  { id: 'retinol', name: 'Retinol', inciAliases: ['Retinol'], category: 'retinoid' },
  { id: 'glycolic-acid', name: 'Glycolic acid', inciAliases: ['Glycolic Acid'], category: 'aha' },
  { id: 'alpha-arbutin', name: 'Alpha-arbutin', inciAliases: ['Alpha-Arbutin'], category: 'brightening' },
  { id: 'l-ascorbic-acid', name: 'L-ascorbic acid', inciAliases: ['Ascorbic Acid'], category: 'vitamin-c' },
  { id: 'salicylic-acid', name: 'Salicylic acid', inciAliases: ['Salicylic Acid'], category: 'bha' },
];

const ids = (list) => list.map((active) => active.id);

// ---------------------------------------------------------------- filterActives

test('filter: an empty or blank query keeps everything, in order, as a new array', () => {
  for (const query of ['', '   ', undefined, null, 5, {}]) {
    const result = helpers.filterActives(sample, query);
    assert.deepEqual(ids(result), ids(sample), JSON.stringify(query));
    assert.notEqual(result, sample);
  }
});

test('filter: ignores case', () => {
  assert.deepEqual(ids(helpers.filterActives(sample, 'RETINOL')), ['retinol']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'GlYcOlIc')), ['glycolic-acid']);
});

test('filter: matches part of a name', () => {
  assert.deepEqual(ids(helpers.filterActives(sample, 'retin')), ['retinol']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'acid')), ['glycolic-acid', 'l-ascorbic-acid', 'salicylic-acid']);
});

test('filter: treats hyphens and spaces alike', () => {
  assert.deepEqual(ids(helpers.filterActives(sample, 'alpha arbutin')), ['alpha-arbutin']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'alpha-arbutin')), ['alpha-arbutin']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'l ascorbic')), ['l-ascorbic-acid']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'alpha–arbutin')), ['alpha-arbutin']);
  assert.deepEqual(ids(helpers.filterActives(sample, '  alpha   arbutin  ')), ['alpha-arbutin']);
});

test('filter: every typed word must match, in any order', () => {
  assert.deepEqual(ids(helpers.filterActives(sample, 'acid glycolic')), ['glycolic-acid']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'acid zzz')), []);
});

test('filter: also matches INCI aliases and the category name', () => {
  assert.deepEqual(ids(helpers.filterActives(sample, 'ascorbic acid')), ['l-ascorbic-acid']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'vitamin c')), ['l-ascorbic-acid']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'retinoid')), ['retinol']);
  assert.deepEqual(ids(helpers.filterActives(sample, 'aha')), ['glycolic-acid']);
});

test('filter: no match gives an empty list', () => {
  assert.deepEqual(helpers.filterActives(sample, 'zzz'), []);
});

test('filter: bad input gives an empty list, never an error', () => {
  for (const list of [undefined, null, 'retinol', 5, {}]) {
    assert.deepEqual(helpers.filterActives(list, 'x'), []);
  }
  assert.deepEqual(ids(helpers.filterActives([null, 'x', 5, ...sample], 'retinol')), ['retinol']);
});

test('filter: entries without aliases or category still work', () => {
  const sparse = [{ id: 'x-1', name: 'Plain' }, { id: 'y', name: 'Other', inciAliases: 'oops' }];
  assert.deepEqual(ids(helpers.filterActives(sparse, 'plain')), ['x-1']);
  assert.deepEqual(ids(helpers.filterActives(sparse, 'other')), ['y']);
});

test('filter: does not change its input and returns the same objects', () => {
  const copy = JSON.parse(JSON.stringify(sample));
  const result = helpers.filterActives(sample, 'acid');
  assert.deepEqual(sample, copy);
  assert.equal(result[0], sample[1]);
});

test('filter: treats special characters as plain text, not as a pattern', () => {
  for (const query of ['.*', '(', '[a-z]', '\\', '+', '$']) {
    assert.deepEqual(helpers.filterActives(sample, query), [], query);
  }
});

test('filter: finds every real active by its own name and by its aliases', () => {
  for (const active of realActives) {
    assert.ok(ids(helpers.filterActives(realActives, active.name)).includes(active.id), active.name);
    for (const alias of active.inciAliases) {
      assert.ok(ids(helpers.filterActives(realActives, alias)).includes(active.id), alias);
    }
  }
});

// ---------------------------------------------------------------- labels and messages

test('categoryLabel: Title Case, with acronyms kept', () => {
  assert.equal(helpers.categoryLabel('vitamin-c'), 'Vitamin C');
  assert.equal(helpers.categoryLabel('aha'), 'AHA');
  assert.equal(helpers.categoryLabel('bha'), 'BHA');
  assert.equal(helpers.categoryLabel('pha'), 'PHA');
  assert.equal(helpers.categoryLabel('benzoyl-peroxide'), 'Benzoyl Peroxide');
  assert.equal(helpers.categoryLabel('hydration-and-barrier'), 'Hydration and Barrier');
  assert.equal(helpers.categoryLabel('retinoid'), 'Retinoid');
});

test('categoryLabel: unknown ids are still readable, bad input is empty', () => {
  assert.equal(helpers.categoryLabel('some-new-one'), 'Some New One');
  for (const value of ['', undefined, null, 5, {}, ['aha']]) {
    assert.equal(helpers.categoryLabel(value), '');
  }
});

test('categoryLabel: every category used in actives.json has a label with no hyphens or lowercase start', () => {
  for (const active of realActives) {
    const label = helpers.categoryLabel(active.category);
    assert.match(label, /^[A-Z]/, active.category);
    assert.ok(!label.includes('-'), active.category);
  }
});

test('resultsSummary: singular and plural', () => {
  assert.equal(helpers.resultsSummary(1), 'Found 1 known active.');
  assert.equal(helpers.resultsSummary(3), 'Found 3 known actives.');
});

test('emptyMessage: uses the real number of known actives, so it never goes stale', () => {
  const message = helpers.emptyMessage(realActives.length);
  assert.ok(message.startsWith('No known actives found.'));
  assert.ok(message.includes(`${realActives.length} actives`));
  assert.ok(message.includes("doesn't mean the product has none"));
});

test('truncated notice names the same limit as the server', () => {
  assert.ok(helpers.TRUNCATED_MESSAGE.includes(MAX_INPUT_LENGTH.toLocaleString('en-US')));
});

test('errorMessage: every message says how to fix it and never blames the person', () => {
  const messages = [
    helpers.errorMessage('empty'),
    helpers.errorMessage('network'),
    helpers.errorMessage('http', 400),
    helpers.errorMessage('http', 413),
    helpers.errorMessage('http', 500),
    helpers.errorMessage('http', 404),
    helpers.errorMessage('parse'),
    helpers.errorMessage('something-else'),
  ];
  for (const message of messages) {
    assert.ok(message.length > 20 && message.endsWith('.'), message);
    assert.doesNotMatch(message, /\b(you (entered|typed|pasted|did|forgot)|your fault|invalid|illegal|incorrect|bad input|mistake)\b/i, message);
  }
  assert.notEqual(helpers.errorMessage('http', 413), helpers.errorMessage('http', 500));
  assert.notEqual(helpers.errorMessage('network'), helpers.errorMessage('http', 500));
  assert.match(helpers.errorMessage('empty'), /Analyse Ingredients/);
});

test('errorMessage: errors that happen after pasting say the text is still there', () => {
  for (const message of [
    helpers.errorMessage('network'),
    helpers.errorMessage('http', 400),
    helpers.errorMessage('http', 413),
    helpers.errorMessage('http', 500),
    helpers.errorMessage('parse'),
  ]) {
    assert.match(message, /still here/);
  }
});

test('filterStatus: describes what is shown', () => {
  assert.equal(helpers.filterStatus(28, 28, ''), '28 known actives');
  assert.equal(helpers.filterStatus(3, 28, 'acid'), 'Showing 3 of 28 known actives');
  assert.equal(helpers.filterStatus(28, 28, 'a'), '28 known actives');
  assert.match(helpers.filterStatus(0, 28, 'zzz'), /^No known actives match "zzz"\./);
});

// ---------------------------------------------------------------- links and motion numbers

test('safeHref: only https links pass', () => {
  assert.equal(helpers.safeHref('https://dermnetnz.org/topics/retinol'), 'https://dermnetnz.org/topics/retinol');
  for (const bad of ['http://x.org', 'javascript:alert(1)', 'data:text/html,x', '//x.org', '', 'https://', undefined, null, 5, {}]) {
    assert.equal(helpers.safeHref(bad), null, JSON.stringify(bad));
  }
});

test('safeHref: every real source link is accepted', () => {
  for (const active of realActives) {
    assert.equal(typeof helpers.safeHref(active.sourceUrl), 'string', active.id);
  }
});

test('accordion: opens in 150-250ms and closes about 20% faster', () => {
  const open = helpers.accordionDuration(true);
  const close = helpers.accordionDuration(false);
  assert.ok(open >= 150 && open <= 250);
  assert.ok(close >= 150 && close <= 250);
  assert.ok(Math.abs(close / open - 0.8) < 0.01, `ratio ${close / open}`);
});

test('stagger: 30ms per row, capped so long lists do not make people wait', () => {
  assert.equal(helpers.staggerDelay(0), 0);
  assert.equal(helpers.staggerDelay(1), 30);
  assert.equal(helpers.staggerDelay(5), 150);
  assert.equal(helpers.staggerDelay(helpers.STAGGER_MAX_ROWS), helpers.STAGGER_MAX_ROWS * 30);
  assert.equal(helpers.staggerDelay(27), helpers.STAGGER_MAX_ROWS * 30);
  for (const bad of [-1, NaN, undefined, null, '3']) assert.equal(helpers.staggerDelay(bad), 0);
});

test('categoryKey: only a category the page knows can become a data-category value', () => {
  const H = require('../public/analyse-helpers');
  const known = ['aha', 'retinoid', 'vitamin-c'];
  assert.equal(H.categoryKey('aha', known), 'aha');
  assert.equal(H.categoryKey('vitamin-c', known), 'vitamin-c');
  // unknown, odd or hostile values give "" (the neutral chip), never something that reaches an attribute
  for (const value of ['new-one', '', 'AHA', 'aha"><script>', undefined, null, 5, {}, ['aha']]) {
    assert.equal(H.categoryKey(value, known), '', String(value));
  }
  assert.equal(H.categoryKey('aha', undefined), '');
  assert.equal(H.categoryKey('aha', []), '');
  assert.equal(H.categoryKey('constructor', known), '');
  assert.equal(H.categoryKey('toString', ['toString']), 'toString'); // only because it is in the list
});

test('categoryKey: knownCategories lists each category once, in the order first seen', () => {
  const H = require('../public/analyse-helpers');
  const actives = [{ category: 'aha' }, { category: 'retinoid' }, { category: 'aha' }, { category: '' }, null, { id: 'x' }, { category: 5 }];
  assert.deepEqual(H.knownCategories(actives), ['aha', 'retinoid']);
  assert.deepEqual(H.knownCategories(undefined), []);
});

// ---- highlightSegments: cutting the pasted text for marking ----
const { highlightSegments } = require('../public/analyse-helpers');
const { findActiveSpans: spansFor } = require('./ingredients');
const dataActives = require('../data/actives.json');

test('highlightSegments: cuts the text around the spans', () => {
  const text = 'Aqua, Niacinamide, Retinol';
  assert.deepEqual(highlightSegments(text, [{ start: 6, end: 17, id: 'niacinamide' }, { start: 19, end: 26, id: 'retinol' }]), [
    { text: 'Aqua, ', id: null },
    { text: 'Niacinamide', id: 'niacinamide' },
    { text: ', ', id: null },
    { text: 'Retinol', id: 'retinol' },
  ]);
});

test('highlightSegments: joining the pieces always gives the original text, whatever the spans are', () => {
  const text = 'Aqua, Niacinamide, Retinol 😀';
  const messy = [
    [], undefined, null, 'x', [null, 5, 'a', {}],
    [{ start: -1, end: 4 }, { start: 3, end: 3 }, { start: 2, end: 1 }, { start: 0.5, end: 3 }, { start: 0, end: 999 }],
    [{ start: 6, end: 17 }, { start: 8, end: 12 }, { start: 6, end: 17 }], // overlaps and repeats
    [{ start: 19, end: 26, id: 'b' }, { start: 6, end: 17, id: 'a' }], // out of order
  ];
  for (const spans of messy) {
    assert.equal(highlightSegments(text, spans).map((p) => p.text).join(''), text, JSON.stringify(spans));
  }
});

test('highlightSegments: invalid and overlapping spans are skipped, the first one wins', () => {
  const pieces = highlightSegments('abcdef', [{ start: 1, end: 4, id: 'x' }, { start: 2, end: 5, id: 'y' }, { start: 9, end: 12, id: 'z' }]);
  assert.deepEqual(pieces, [{ text: 'a', id: null }, { text: 'bcd', id: 'x' }, { text: 'ef', id: null }]);
});

test('highlightSegments: text that looks like HTML stays plain text (the page uses textContent)', () => {
  const text = '<script>alert(1)</script>, Niacinamide, <img src=x onerror=alert(1)>';
  const pieces = highlightSegments(text, spansFor(text, dataActives));
  assert.equal(pieces.map((p) => p.text).join(''), text);
  assert.deepEqual(pieces.filter((p) => p.id).map((p) => p.text), ['Niacinamide']);
});

test('highlightSegments: not a string gives an empty list; empty text gives an empty list', () => {
  assert.deepEqual(highlightSegments(undefined, []), []);
  assert.deepEqual(highlightSegments('', [{ start: 0, end: 1 }]), []);
  assert.deepEqual(highlightSegments('abc', undefined), [{ text: 'abc', id: null }]);
});
