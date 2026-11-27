const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  normalizeDisplayName,
  normalizeSkinType,
  validateRegistration,
} = require('./validation');

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
});

test('normalizeEmail returns an empty string for non-strings', () => {
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(['a@b.co', 'c@d.co']), '');
  assert.equal(normalizeEmail(42), '');
});

test('isValidEmail accepts normal addresses and rejects obvious junk', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('a.b+tag@sub.example.com'), true);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('no-at-sign.com'), false);
  assert.equal(isValidEmail('two@@example.com'), false);
  assert.equal(isValidEmail('a b@example.com'), false);
  assert.equal(isValidEmail('a@nodot'), false);
  assert.equal(isValidEmail(`${'a'.repeat(250)}@b.co`), false);
});

test('validatePassword enforces 8 to 72 characters', () => {
  assert.notEqual(validatePassword('1234567'), null);
  assert.equal(validatePassword('12345678'), null);
  assert.equal(validatePassword('a'.repeat(72)), null);
  assert.notEqual(validatePassword('a'.repeat(73)), null);
});

test('validatePassword rejects non-strings', () => {
  assert.notEqual(validatePassword(undefined), null);
  assert.notEqual(validatePassword(['12345678']), null);
});

test('validatePassword does not trim spaces', () => {
  assert.equal(validatePassword('        '), null); // 8 spaces is 8 characters
});

test('validatePassword rejects passwords over 72 bytes even if under 72 characters', () => {
  // 40 two-byte characters = 40 characters but 80 bytes
  assert.notEqual(validatePassword('é'.repeat(40)), null);
  // 36 two-byte characters = 72 bytes, still allowed
  assert.equal(validatePassword('é'.repeat(36)), null);
});

test('normalizeDisplayName trims and turns empty into null', () => {
  assert.equal(normalizeDisplayName('  Mai  '), 'Mai');
  assert.equal(normalizeDisplayName('   '), null);
  assert.equal(normalizeDisplayName(undefined), null);
});

test('normalizeSkinType: empty means not set', () => {
  assert.deepEqual(normalizeSkinType('', 'ignored'), {
    skinType: null,
    skinTypeOther: null,
    error: null,
  });
});

test('normalizeSkinType accepts each listed type and drops the free text', () => {
  for (const type of ['dry', 'oily', 'combination', 'normal', 'sensitive']) {
    assert.deepEqual(normalizeSkinType(type, 'leftover text'), {
      skinType: type,
      skinTypeOther: null,
      error: null,
    });
  }
});

test('normalizeSkinType rejects unknown types', () => {
  const result = normalizeSkinType('scaly', '');
  assert.equal(result.error.field, 'skin_type');
  assert.equal(result.skinType, null);
});

test('normalizeSkinType: other requires a description', () => {
  assert.equal(normalizeSkinType('other', '').error.field, 'skin_type_other');
  assert.equal(normalizeSkinType('other', '   ').error.field, 'skin_type_other');
});

test('normalizeSkinType: other with a description keeps it trimmed', () => {
  assert.deepEqual(normalizeSkinType('other', '  dry on cheeks, oily T-zone '), {
    skinType: 'other',
    skinTypeOther: 'dry on cheeks, oily T-zone',
    error: null,
  });
});

test('normalizeSkinType: other description has a maximum length', () => {
  assert.equal(normalizeSkinType('other', 'x'.repeat(101)).error.field, 'skin_type_other');
  assert.equal(normalizeSkinType('other', 'x'.repeat(100)).error, null);
});

test('validateRegistration returns clean values for valid input', () => {
  const { errors, clean } = validateRegistration({
    email: ' Test@Example.com ',
    password: 'correct horse',
    display_name: ' ',
    skin_type: 'other',
    skin_type_other: ' mixed ',
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(clean, {
    email: 'test@example.com',
    displayName: null,
    skinType: 'other',
    skinTypeOther: 'mixed',
  });
  assert.equal('password' in clean, false);
});

test('validateRegistration collects every error at once', () => {
  const { errors } = validateRegistration({
    email: 'nope',
    password: 'short',
    skin_type: 'other',
    skin_type_other: '',
  });
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'password', 'skin_type_other']);
});

test('validatePassword rejects every non-string type', () => {
  for (const value of [undefined, null, 12345678, true, ['12345678'], { length: 12 }]) {
    assert.notEqual(validatePassword(value), null, `accepted ${JSON.stringify(value)}`);
  }
});

test('validateRegistration rejects missing and non-string passwords', () => {
  // A repeated form field (password=a&password=b) arrives as an array.
  const repeated = ['correct horse', 'correct horse'];
  for (const password of [undefined, null, 12345678, repeated, ['correct horse']]) {
    const { errors } = validateRegistration({ email: 'a@b.co', password });
    assert.ok(errors.password, `accepted ${JSON.stringify(password)}`);
  }
  const noPasswordField = validateRegistration({ email: 'a@b.co' });
  assert.ok(noPasswordField.errors.password);
});

test('validateRegistration survives a missing body', () => {
  const { errors } = validateRegistration(undefined);
  assert.ok(errors.email);
  assert.ok(errors.password);
});
