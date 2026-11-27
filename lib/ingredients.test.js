// Pure-function tests: no database, no network, no Express.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_INPUT_LENGTH, parseIngredients } = require('./ingredients');

// ---------------------------------------------------------------- parseIngredients

test('parse: non-string input gives an empty list', () => {
  for (const value of [undefined, null, 42, true, {}, ['Aqua']]) {
    assert.deepEqual(parseIngredients(value), [], `input ${JSON.stringify(value)}`);
  }
});

test('parse: empty and whitespace-only input give an empty list', () => {
  assert.deepEqual(parseIngredients(''), []);
  assert.deepEqual(parseIngredients('     '), []);
  assert.deepEqual(parseIngredients(' \n\t \r\n '), []);
});

test('parse: splits on commas, semicolons and newlines', () => {
  assert.deepEqual(parseIngredients('Aqua, Glycerin; Niacinamide\nUrea\r\nSqualane'), [
    'aqua',
    'glycerin',
    'niacinamide',
    'urea',
    'squalane',
  ]);
});

test('parse: trims, collapses extra spaces and drops empty items', () => {
  assert.deepEqual(parseIngredients('  Aqua  ,,  Sodium   Hyaluronate ; ; ,Urea,  '), [
    'aqua',
    'sodium hyaluronate',
    'urea',
  ]);
});

test('parse: lowercases everything', () => {
  assert.deepEqual(parseIngredients('AQUA, Glycerin, nIaCiNaMiDe'), ['aqua', 'glycerin', 'niacinamide']);
});

test('parse: strips trailing full stops from the whole list and from items', () => {
  assert.deepEqual(parseIngredients('Aqua, Glycerin, Urea.'), ['aqua', 'glycerin', 'urea']);
  assert.deepEqual(parseIngredients('Aqua. \nGlycerin..\nUrea'), ['aqua', 'glycerin', 'urea']);
});

test('parse: strips an "Ingredients:" prefix in any case', () => {
  assert.deepEqual(parseIngredients('Ingredients: Aqua, Glycerin'), ['aqua', 'glycerin']);
  assert.deepEqual(parseIngredients('  INGREDIENTS:Aqua, Glycerin'), ['aqua', 'glycerin']);
  assert.deepEqual(parseIngredients('ingredients - Aqua, Glycerin'), ['aqua', 'glycerin']);
  assert.deepEqual(parseIngredients('Full Ingredients: Aqua, Glycerin'), ['aqua', 'glycerin']);
});

test('parse: only strips "ingredients" at the very start', () => {
  assert.deepEqual(parseIngredients('Aqua, Ingredients, Glycerin'), ['aqua', 'ingredients', 'glycerin']);
});

test('parse: strips "Active ingredients:" and "Inactive ingredients:" headings anywhere', () => {
  assert.deepEqual(
    parseIngredients('Active ingredients: Salicylic Acid. Inactive ingredients: Aqua, Glycerin'),
    ['salicylic acid', 'aqua', 'glycerin'],
  );
  assert.deepEqual(
    parseIngredients('Aqua, Glycerin INACTIVE INGREDIENTS: Urea, Squalane'),
    ['aqua', 'glycerin', 'urea', 'squalane'],
  );
  assert.deepEqual(parseIngredients('Active Ingredient: Niacinamide\nInactive Ingredients:\nAqua'), [
    'niacinamide',
    'aqua',
  ]);
});

test('parse: headings do not stick to the next item', () => {
  const items = parseIngredients('Active ingredients: Retinol. Inactive ingredients: Aqua');
  assert.equal(items.some((item) => item.includes('ingredients')), false);
});

test('parse: words that merely start with "active" are left alone', () => {
  assert.deepEqual(parseIngredients('Activated Charcoal, Aqua'), ['activated charcoal', 'aqua']);
});

test('parse: keeps bracket content attached to its ingredient', () => {
  assert.deepEqual(parseIngredients('Niacinamide (Vitamin B3), Aqua'), ['niacinamide (vitamin b3)', 'aqua']);
});

test('parse: does not split on commas, semicolons or newlines inside brackets', () => {
  assert.deepEqual(parseIngredients('Niacinamide (Vitamin B3, Nicotinamide), Aqua'), [
    'niacinamide (vitamin b3, nicotinamide)',
    'aqua',
  ]);
  assert.deepEqual(parseIngredients('Tocopherol [Vitamin E; Antioxidant], Aqua'), [
    'tocopherol [vitamin e; antioxidant]',
    'aqua',
  ]);
  assert.deepEqual(parseIngredients('Niacinamide (Vitamin\nB3), Aqua'), ['niacinamide (vitamin b3)', 'aqua']);
});

test('parse: handles nested brackets', () => {
  assert.deepEqual(parseIngredients('Aqua (Water (Eau), Solvent), Glycerin'), [
    'aqua (water (eau), solvent)',
    'glycerin',
  ]);
});

test('parse: an unclosed bracket does not swallow the rest of the list', () => {
  assert.deepEqual(parseIngredients('Aqua (, Glycerin, Retinol'), ['aqua (', 'glycerin', 'retinol']);
  assert.deepEqual(parseIngredients('Aqua), Glycerin'), ['aqua)', 'glycerin']);
});

test('parse: does not split a comma between two digits (1,2-Hexanediol)', () => {
  assert.deepEqual(parseIngredients('Aqua, 1,2-Hexanediol, 1,3-Butylene Glycol, Glycerin'), [
    'aqua',
    '1,2-hexanediol',
    '1,3-butylene glycol',
    'glycerin',
  ]);
});

test('parse: still splits a comma that has a digit on only one side', () => {
  assert.deepEqual(parseIngredients('Ci 77891,Aqua, 5,Urea'), ['ci 77891', 'aqua', '5', 'urea']);
});

test('parse: normalises Unicode dashes and non-breaking spaces', () => {
  assert.deepEqual(parseIngredients('Hydroxypinacolone‐Retinoate, Alpha–Arbutin, Sodium Hyaluronate'), [
    'hydroxypinacolone-retinoate',
    'alpha-arbutin',
    'sodium hyaluronate',
  ]);
});

test('parse: keeps duplicates and order (deduplication is findActives job)', () => {
  assert.deepEqual(parseIngredients('Aqua, Urea, AQUA'), ['aqua', 'urea', 'aqua']);
});

test('parse: caps input at the maximum length', () => {
  const huge = 'Aqua, '.repeat(200000);
  const items = parseIngredients(huge);
  assert.ok(items.length > 0);
  assert.ok(items.join(', ').length <= MAX_INPUT_LENGTH);
  assert.deepEqual([...new Set(items)], ['aqua']);
});

test('parse: drops an item that the cap cut in half', () => {
  const tail = ', Retinol, Glycerin';
  // Place the cap in the middle of "Glycerin" (after "Glyc").
  const text = 'x'.repeat(MAX_INPUT_LENGTH - 4 - (tail.length - 'Glycerin'.length)) + tail;
  assert.equal(text.slice(MAX_INPUT_LENGTH - 4, MAX_INPUT_LENGTH + 4), 'Glycerin');
  const items = parseIngredients(text);
  assert.equal(items[items.length - 1], 'retinol');
  assert.equal(items.some((item) => item.startsWith('glyc')), false);
});

test('parse: keeps the last item when the cap lands exactly on a separator', () => {
  const text = 'x'.repeat(MAX_INPUT_LENGTH - 9) + ', Retinol, Glycerin';
  assert.equal(text[MAX_INPUT_LENGTH], ',');
  const items = parseIngredients(text);
  assert.equal(items[items.length - 1], 'retinol');
  assert.equal(items.includes('glycerin'), false);
});
