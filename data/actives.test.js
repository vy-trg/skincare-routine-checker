// Checks the shape of data/actives.json. Reads a file only: no database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { matchKey } = require('../lib/ingredients');

const FILE = path.join(__dirname, 'actives.json');

const ALLOWED_CATEGORIES = [
  'retinoid',
  'aha',
  'pha',
  'bha',
  'vitamin-c',
  'benzoyl-peroxide',
  'acne',
  'brightening',
  'hydration-and-barrier',
  'antioxidant',
];

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const actives = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Alias comparison ignores case and extra spaces, like a label lookup would.
const normaliseAlias = (alias) => alias.trim().replace(/\s+/g, ' ').toLowerCase();

test('actives.json is a non-empty array', () => {
  assert.ok(Array.isArray(actives));
  assert.ok(actives.length > 0);
});

test('every entry has the required fields with the right types', () => {
  for (const entry of actives) {
    const label = entry && entry.id;
    assert.equal(typeof entry, 'object', `entry ${label} is not an object`);
    for (const field of ['id', 'name', 'category', 'summary']) {
      assert.equal(typeof entry[field], 'string', `${label}: ${field} must be a string`);
      assert.notEqual(entry[field].trim(), '', `${label}: ${field} must not be empty`);
    }
    assert.ok(Array.isArray(entry.inciAliases), `${label}: inciAliases must be an array`);
    assert.ok(entry.inciAliases.length > 0, `${label}: inciAliases must not be empty`);
    for (const alias of entry.inciAliases) {
      assert.equal(typeof alias, 'string', `${label}: aliases must be strings`);
      assert.notEqual(alias.trim(), '', `${label}: aliases must not be empty`);
    }
    assert.equal(typeof entry.sourceUrl, 'string', `${label}: sourceUrl must be a string (use "" if unknown)`);
  }
});

test('ids are unique and kebab-case', () => {
  const seen = new Set();
  for (const { id } of actives) {
    assert.match(id, KEBAB_CASE, `${id} is not kebab-case`);
    assert.equal(seen.has(id), false, `duplicate id ${id}`);
    seen.add(id);
  }
});

test('categories come from the allowed list', () => {
  for (const { id, category } of actives) {
    assert.ok(ALLOWED_CATEGORIES.includes(category), `${id}: unknown category "${category}"`);
  }
});

test('no INCI alias appears twice, within or across entries', () => {
  const owner = new Map(); // normalised alias -> id that owns it
  for (const { id, inciAliases } of actives) {
    for (const alias of inciAliases) {
      const key = normaliseAlias(alias);
      assert.equal(owner.has(key), false, `alias "${alias}" in ${id} is already used by ${owner.get(key)}`);
      owner.set(key, id);
    }
  }
});

test('no two aliases collide once hyphens and spaces are treated alike', () => {
  // findActives compares names with matchKey, so "X-Y" and "X Y" would be the same alias.
  const owner = new Map();
  for (const { id, inciAliases } of actives) {
    for (const alias of inciAliases) {
      const key = matchKey(alias);
      assert.equal(owner.has(key), false, `alias "${alias}" in ${id} collides with ${owner.get(key)}`);
      owner.set(key, id);
    }
  }
});

test('every non-empty sourceUrl is a valid https URL', () => {
  for (const { id, sourceUrl } of actives) {
    if (sourceUrl === '') continue;
    assert.ok(sourceUrl.startsWith('https://'), `${id}: sourceUrl must start with https://`);
    assert.doesNotThrow(() => new URL(sourceUrl), `${id}: sourceUrl is not a parseable URL`);
  }
});

test('summaries are a single plain sentence', () => {
  for (const { id, summary } of actives) {
    assert.ok(summary.endsWith('.'), `${id}: summary should end with a full stop`);
    assert.equal(summary.slice(0, -1).includes('. '), false, `${id}: summary should be one sentence`);
  }
});
