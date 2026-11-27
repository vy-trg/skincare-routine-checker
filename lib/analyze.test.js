// Pure-function tests for the /api/analyze logic: no database, no Express, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeRequest } = require('./analyze');
const { MAX_INPUT_LENGTH } = require('./ingredients');

const fixture = [
  {
    id: 'retinol',
    name: 'Retinol',
    inciAliases: ['Retinol'],
    category: 'retinoid',
    summary: 'A form of vitamin A.',
    sourceUrl: 'https://example.org/retinol',
  },
  {
    id: 'niacinamide',
    name: 'Niacinamide',
    inciAliases: ['Niacinamide'],
    category: 'brightening',
    summary: 'A form of vitamin B3.',
    sourceUrl: '',
  },
  {
    id: 'alpha-arbutin',
    name: 'Alpha-arbutin',
    inciAliases: ['Alpha-Arbutin'],
    category: 'brightening',
    summary: 'A brightening ingredient.',
    sourceUrl: '',
  },
];

const run = (body) => analyzeRequest(body, fixture);
const ids = (response) => response.body.actives.map((active) => active.id);

test('analyze: a valid request gives status 200 and the matched actives', () => {
  const response = run({ text: 'Aqua, Niacinamide, Retinol' });
  assert.equal(response.status, 200);
  assert.deepEqual(ids(response), ['niacinamide', 'retinol']);
});

test('analyze: each active has only the public fields', () => {
  const [active] = run({ text: 'Retinol' }).body.actives;
  assert.deepEqual(active, {
    id: 'retinol',
    name: 'Retinol',
    category: 'retinoid',
    summary: 'A form of vitamin A.',
    sourceUrl: 'https://example.org/retinol',
  });
  assert.equal(JSON.stringify(run({ text: 'Retinol' }).body).includes('inciAliases'), false);
});

test('analyze: empty and blank text give 200 with an empty list', () => {
  for (const text of ['', '   ', '\n\n']) {
    assert.deepEqual(run({ text }), { status: 200, body: { actives: [] } }, JSON.stringify(text));
  }
});

test('analyze: text without known actives gives an empty list', () => {
  assert.deepEqual(run({ text: 'Aqua, Glycerin' }), { status: 200, body: { actives: [] } });
});

test('analyze: a missing or non-object body gives 400 with an error message', () => {
  for (const body of [undefined, null, 'Retinol', 42, true, ['Retinol'], {}]) {
    const response = run(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(typeof response.body.error, 'string');
    assert.equal('actives' in response.body, false);
  }
});

test('analyze: text that is not a string gives 400', () => {
  for (const text of [undefined, null, 42, true, ['Retinol'], { a: 1 }]) {
    const response = run({ text });
    assert.equal(response.status, 400, JSON.stringify(text));
    assert.equal(typeof response.body.error, 'string');
  }
});

test('analyze: extra properties in the body are ignored', () => {
  const response = run({ text: 'Retinol', actives: ['x'], admin: true });
  assert.equal(response.status, 200);
  assert.deepEqual(ids(response), ['retinol']);
});

test('analyze: matching rules from findActives apply (hyphens, headings, no duplicates)', () => {
  const response = run({
    text: 'Active ingredients: alpha arbutin. Inactive ingredients: Aqua, RETINOL, retinol',
  });
  assert.deepEqual(ids(response), ['alpha-arbutin', 'retinol']);
});

test('analyze: the truncated flag is absent for short text and for text of exactly the maximum length', () => {
  assert.equal('truncated' in run({ text: 'Retinol' }).body, false);
  const exact = `Retinol, ${'x'.repeat(MAX_INPUT_LENGTH - 9)}`;
  assert.equal(exact.length, MAX_INPUT_LENGTH);
  assert.equal('truncated' in run({ text: exact }).body, false);
});

test('analyze: text over the maximum length is cut and flagged as truncated', () => {
  const text = `Retinol, ${'Aqua, '.repeat(1000)}Niacinamide`;
  assert.ok(text.length > MAX_INPUT_LENGTH);
  const response = run({ text });
  assert.equal(response.status, 200);
  assert.equal(response.body.truncated, true);
  assert.deepEqual(ids(response), ['retinol']); // Niacinamide is past the cap
});

test('analyze: uses the real actives list when none is passed', () => {
  const response = analyzeRequest({ text: 'Aqua, Niacinamide (Vitamin B3), Salicylic Acid' });
  assert.equal(response.status, 200);
  assert.deepEqual(ids(response), ['niacinamide', 'salicylic-acid']);
});

test('analyze: does not change the request body or the actives list', () => {
  const body = { text: 'Retinol, Niacinamide' };
  const bodyCopy = JSON.parse(JSON.stringify(body));
  const activesCopy = JSON.parse(JSON.stringify(fixture));
  run(body);
  assert.deepEqual(body, bodyCopy);
  assert.deepEqual(fixture, activesCopy);
});
