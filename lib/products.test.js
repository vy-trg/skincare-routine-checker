// Pure-function tests: no database, no Express.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_INPUT_LENGTH } = require('./ingredients');
const { NAME_MAX_LENGTH, parseId, parsePeriod, validateProduct } = require('./products');

// ---------------------------------------------------------------- parseId

test('parseId: accepts positive integers written as plain digits', () => {
  assert.equal(parseId('1'), 1);
  assert.equal(parseId('42'), 42);
  assert.equal(parseId('2147483647'), 2147483647);
});

test('parseId: rejects anything that is not a plain positive integer', () => {
  for (const value of ['', ' ', 'abc', '0', '-1', '1.5', '007', '1e3', '0x10', '+5', ' 5', '5 ', '5\n', '١٢']) {
    assert.equal(parseId(value), null, JSON.stringify(value));
  }
});

test('parseId: rejects numbers that do not fit a Postgres INTEGER', () => {
  assert.equal(parseId('2147483648'), null);
  assert.equal(parseId('99999999999'), null);
  assert.equal(parseId('9'.repeat(400)), null);
});

test('parseId: rejects non-strings, including arrays from repeated form fields', () => {
  for (const value of [undefined, null, 5, true, {}, ['1'], ['1', '2']]) {
    assert.equal(parseId(value), null, JSON.stringify(value));
  }
});

// ---------------------------------------------------------------- parsePeriod

test('parsePeriod: only exact lowercase am and pm', () => {
  assert.equal(parsePeriod('am'), 'am');
  assert.equal(parsePeriod('pm'), 'pm');
  for (const value of ['AM', 'Pm', ' am', 'am ', 'morning', '', undefined, null, ['am'], {}]) {
    assert.equal(parsePeriod(value), null, JSON.stringify(value));
  }
});

// ---------------------------------------------------------------- validateProduct

test('validateProduct: accepts a normal product and trims both fields', () => {
  const { errors, clean } = validateProduct({
    name: '  Daily Serum  ',
    ingredients: '\n Aqua, Niacinamide, Glycerin \n',
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(clean, { name: 'Daily Serum', ingredients: 'Aqua, Niacinamide, Glycerin' });
});

test('validateProduct: keeps line breaks inside the ingredient list', () => {
  const { errors, clean } = validateProduct({ name: 'X', ingredients: 'Aqua,\nGlycerin' });
  assert.deepEqual(errors, {});
  assert.equal(clean.ingredients, 'Aqua,\nGlycerin');
});

test('validateProduct: a missing or blank name is an error', () => {
  for (const name of [undefined, '', '   ', '\n\t']) {
    const { errors } = validateProduct({ name, ingredients: 'Aqua' });
    assert.equal(typeof errors.name, 'string', JSON.stringify(name));
    assert.equal(errors.ingredients, undefined);
  }
});

test('validateProduct: the name limit counts characters, not UTF-16 units', () => {
  assert.deepEqual(validateProduct({ name: 'a'.repeat(NAME_MAX_LENGTH), ingredients: 'Aqua' }).errors, {});
  assert.equal(typeof validateProduct({ name: 'a'.repeat(NAME_MAX_LENGTH + 1), ingredients: 'Aqua' }).errors.name, 'string');
  // 100 emoji are 200 UTF-16 units but 100 characters.
  assert.deepEqual(validateProduct({ name: '😀'.repeat(NAME_MAX_LENGTH), ingredients: 'Aqua' }).errors, {});
});

test('validateProduct: a missing or blank ingredient list is an error', () => {
  for (const ingredients of [undefined, '', '   ', '\n']) {
    const { errors } = validateProduct({ name: 'X', ingredients });
    assert.equal(typeof errors.ingredients, 'string', JSON.stringify(ingredients));
    assert.equal(errors.name, undefined);
  }
});

test('validateProduct: a list with no real items is an error', () => {
  for (const ingredients of [',,,', ' ; ; ', 'Ingredients:', '.']) {
    const { errors } = validateProduct({ name: 'X', ingredients });
    assert.equal(typeof errors.ingredients, 'string', JSON.stringify(ingredients));
  }
});

test('validateProduct: the ingredient list is rejected, not cut, above the parser limit', () => {
  const atLimit = 'a'.repeat(MAX_INPUT_LENGTH);
  assert.deepEqual(validateProduct({ name: 'X', ingredients: atLimit }).errors, {});
  const over = validateProduct({ name: 'X', ingredients: `${atLimit}b` });
  assert.equal(typeof over.errors.ingredients, 'string');
});

test('validateProduct: NUL characters are rejected before they reach Postgres', () => {
  assert.equal(typeof validateProduct({ name: 'a\u0000b', ingredients: 'Aqua' }).errors.name, 'string');
  assert.equal(typeof validateProduct({ name: 'X', ingredients: 'Aqua,\u0000Urea' }).errors.ingredients, 'string');
});

test('validateProduct: non-string fields (arrays, numbers, objects) count as missing', () => {
  for (const value of [['Serum'], 5, {}, true, null]) {
    const { errors, clean } = validateProduct({ name: value, ingredients: value });
    assert.equal(typeof errors.name, 'string', JSON.stringify(value));
    assert.equal(typeof errors.ingredients, 'string', JSON.stringify(value));
    assert.deepEqual(clean, { name: '', ingredients: '' });
  }
});

test('validateProduct: a missing or non-object body gives errors, not a crash', () => {
  for (const body of [undefined, null, 'text', 5, []]) {
    const { errors } = validateProduct(body);
    assert.equal(typeof errors.name, 'string', JSON.stringify(body));
    assert.equal(typeof errors.ingredients, 'string', JSON.stringify(body));
  }
});

test('validateProduct: ignores extra fields such as user_id or id', () => {
  const { errors, clean } = validateProduct({ name: 'X', ingredients: 'Aqua', user_id: 99, id: 5 });
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(clean).sort(), ['ingredients', 'name']);
});
