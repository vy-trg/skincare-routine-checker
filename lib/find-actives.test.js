// Pure-function tests for matchKey and findActives: no database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchKey, findActives } = require('./ingredients');
const realActives = require('../data/actives.json');

const fixture = [
  { id: 'retinol', inciAliases: ['Retinol'] },
  { id: 'retinyl-palmitate', inciAliases: ['Retinyl Palmitate'] },
  { id: 'l-ascorbic-acid', inciAliases: ['Ascorbic Acid', 'L-Ascorbic Acid'] },
  { id: 'ascorbyl-glucoside', inciAliases: ['Ascorbyl Glucoside'] },
  { id: 'niacinamide', inciAliases: ['Niacinamide', 'Nicotinamide'] },
  { id: 'alpha-arbutin', inciAliases: ['Alpha-Arbutin'] },
  { id: 'hydroxypinacolone-retinoate', inciAliases: ['Hydroxypinacolone Retinoate'] },
  { id: 'hyaluronic-acid', inciAliases: ['Hyaluronic Acid', 'Sodium Hyaluronate'] },
  { id: 'salicylic-acid', inciAliases: ['Salicylic Acid'] },
];

const ids = (list) => list.map((active) => active.id);
const find = (text) => ids(findActives(text, fixture));

// ---------------------------------------------------------------- matchKey

test('matchKey: lowercases and treats hyphens and spaces the same', () => {
  assert.equal(matchKey('Alpha-Arbutin'), 'alpha arbutin');
  assert.equal(matchKey('alpha arbutin'), 'alpha arbutin');
  assert.equal(matchKey('  ALPHA --  Arbutin '), 'alpha arbutin');
  assert.equal(matchKey('Alpha‐Arbutin'), 'alpha arbutin');
});

test('matchKey: does not join words (no fuzzy matching)', () => {
  assert.notEqual(matchKey('Alphaarbutin'), matchKey('Alpha-Arbutin'));
});

test('matchKey: non-strings give an empty key', () => {
  for (const value of [undefined, null, 5, {}, ['a']]) assert.equal(matchKey(value), '');
});

// ---------------------------------------------------------------- findActives: basics

test('find: empty, blank and non-string input find nothing', () => {
  for (const value of ['', '    ', '\n\n', undefined, null, 42, ['Retinol']]) {
    assert.deepEqual(find(value), [], `input ${JSON.stringify(value)}`);
  }
});

test('find: a missing or invalid actives list finds nothing and does not throw', () => {
  for (const actives of [undefined, null, 'x', {}]) {
    assert.deepEqual(findActives('Retinol', actives), []);
  }
});

test('find: a list without known actives finds nothing', () => {
  assert.deepEqual(find('Aqua, Glycerin, Phenoxyethanol, Parfum'), []);
});

test('find: returns actives in label order', () => {
  assert.deepEqual(find('Aqua, Niacinamide, Glycerin, Retinol'), ['niacinamide', 'retinol']);
  assert.deepEqual(find('Aqua, Retinol, Glycerin, Niacinamide'), ['retinol', 'niacinamide']);
});

test('find: returns each active once, even if listed many times or by several aliases', () => {
  assert.deepEqual(find('Retinol, Aqua, retinol, RETINOL'), ['retinol']);
  assert.deepEqual(find('Ascorbic Acid, Aqua, L-Ascorbic Acid'), ['l-ascorbic-acid']);
  assert.deepEqual(find('Nicotinamide, Niacinamide'), ['niacinamide']);
});

test('find: matching is case-insensitive', () => {
  assert.deepEqual(find('rEtInOl, NIACINAMIDE'), ['retinol', 'niacinamide']);
});

test('find: returns the very objects that were passed in', () => {
  const [match] = findActives('Retinol', fixture);
  assert.equal(match, fixture[0]);
});

// ---------------------------------------------------------------- findActives: no substring matches

test('find: "Retinol" does not match "Retinyl Palmitate" and the reverse', () => {
  assert.deepEqual(find('Retinyl Palmitate'), ['retinyl-palmitate']);
  assert.deepEqual(find('Retinol'), ['retinol']);
  assert.deepEqual(find('Retinyl Palmitate, Retinol'), ['retinyl-palmitate', 'retinol']);
});

test('find: an alias that is only part of another name does not match', () => {
  assert.deepEqual(find('Ascorbyl Glucoside'), ['ascorbyl-glucoside']);
  assert.deepEqual(find('Hyaluronic Acid Crosspolymer'), []);
  assert.deepEqual(find('Retinoic Acid, Retinol Palmitate, Retinyl'), []);
  assert.deepEqual(find('Salicylic Acid Sodium Salt'), []);
  assert.deepEqual(find('Hydroxypinacolone'), []);
});

// ---------------------------------------------------------------- findActives: brackets

test('find: bracket content stays with its ingredient and does not hide it', () => {
  assert.deepEqual(find('Niacinamide (Vitamin B3), Aqua'), ['niacinamide']);
  assert.deepEqual(find('Niacinamide (Vitamin B3, Nicotinamide)'), ['niacinamide']);
});

test('find: an alias inside brackets also counts', () => {
  assert.deepEqual(find('Vitamin C (Ascorbic Acid), Aqua'), ['l-ascorbic-acid']);
  assert.deepEqual(find('Vitamin B3 (Niacinamide)'), ['niacinamide']);
});

test('find: bracket content that merely contains an alias as a word does not match', () => {
  assert.deepEqual(find('Aqua (Retinol-free), Glycerin'), []);
});

// ---------------------------------------------------------------- findActives: hyphens and spaces

test('find: hyphens and spaces are interchangeable', () => {
  for (const text of ['alpha arbutin', 'Alpha Arbutin', 'ALPHA-ARBUTIN', 'alpha   arbutin', 'Alpha‐Arbutin']) {
    assert.deepEqual(find(text), ['alpha-arbutin'], text);
  }
  assert.deepEqual(find('Hydroxypinacolone-Retinoate'), ['hydroxypinacolone-retinoate']);
  assert.deepEqual(find('L Ascorbic Acid'), ['l-ascorbic-acid']);
  assert.deepEqual(find('Sodium-Hyaluronate'), ['hyaluronic-acid']);
});

test('find: still no fuzzy matching', () => {
  for (const text of ['Alphaarbutin', 'Arbutin', 'Alpha Arbutinn', 'Alfa Arbutin']) {
    assert.deepEqual(find(text), [], text);
  }
});

// ---------------------------------------------------------------- findActives: headings, percentages, cap

test('find: "Active ingredients:" and "Inactive ingredients:" headings do not hide items', () => {
  assert.deepEqual(
    find('Active ingredients: Salicylic Acid. Inactive ingredients: Aqua, Niacinamide'),
    ['salicylic-acid', 'niacinamide'],
  );
  assert.deepEqual(find('Aqua, Glycerin Inactive Ingredients: Retinol'), ['retinol']);
});

test('find: known limitation, items with a percentage are not matched', () => {
  assert.deepEqual(find('Niacinamide 5%, Retinol 0.3%'), []);
});

test('find: only the first 5000 characters are read', () => {
  assert.deepEqual(find(`Retinol, ${'Aqua, '.repeat(1000)}`), ['retinol']);
  assert.deepEqual(find(`${'Aqua, '.repeat(1000)}Retinol`), []);
});

// ---------------------------------------------------------------- real data

test('real data: every alias finds exactly its own active, in any hyphen or space spelling', () => {
  for (const active of realActives) {
    for (const alias of active.inciAliases) {
      const variants = [alias, alias.toUpperCase(), alias.replace(/[- ]/g, '-'), alias.replace(/[- ]/g, ' ')];
      for (const variant of variants) {
        assert.deepEqual(ids(findActives(variant, realActives)), [active.id], `"${variant}"`);
      }
    }
  }
});

test('real data: a typical label finds the right actives in label order', () => {
  const label =
    'Ingredients: Aqua, Glycerin, Niacinamide (Vitamin B3), Sodium Hyaluronate, 1,2-Hexanediol, ' +
    'Salicylic Acid, Tocopherol, Phenoxyethanol.';
  assert.deepEqual(ids(findActives(label, realActives)), [
    'niacinamide',
    'hyaluronic-acid',
    'salicylic-acid',
    'tocopherol',
  ]);
});
