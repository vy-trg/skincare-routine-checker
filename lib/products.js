// Pure helpers for the product and routine pages: no database, no Express.
const { MAX_INPUT_LENGTH, parseIngredients } = require('./ingredients');

const NAME_MAX_LENGTH = 100;
const INT4_MAX = 2147483647; // largest value a Postgres INTEGER column holds
const PERIODS = ['am', 'pm'];

// Form fields can arrive as arrays or undefined (e.g. ?name=a&name=b), so never assume a string.
function toText(value) {
  return typeof value === 'string' ? value : '';
}

// Postgres text cannot contain a NUL character: the insert would fail with a 500.
const hasNul = (text) => text.includes('\u0000');

// An id from a URL or a form. Returns a positive integer, or null for anything else
// ("abc", "0", "-1", "1.5", "007", "1e3", arrays, numbers too big for INTEGER).
// Callers treat null as "not found", so a bad id never reaches the database.
function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= INT4_MAX ? id : null;
}

// 'am' or 'pm' exactly (lowercase), otherwise null.
function parsePeriod(value) {
  return typeof value === 'string' && PERIODS.includes(value) ? value : null;
}

// Validates the "add product" form. Returns { errors, clean }.
// `clean` always holds strings so the form can be shown again; the name and ingredients are trimmed.
function validateProduct(body) {
  const source = typeof body === 'object' && body !== null ? body : {};
  const name = toText(source.name).trim();
  const ingredients = toText(source.ingredients).trim();
  const errors = {};

  if (name === '') {
    errors.name = 'Enter a product name.';
  } else if ([...name].length > NAME_MAX_LENGTH) {
    errors.name = `Product name must be at most ${NAME_MAX_LENGTH} characters.`;
  } else if (hasNul(name)) {
    errors.name = 'Product name contains a character that is not allowed.';
  }

  if (ingredients === '') {
    errors.ingredients = 'Paste the ingredient list.';
  } else if (ingredients.length > MAX_INPUT_LENGTH) {
    // Rejected, not cut: the part after the limit would never be analysed.
    errors.ingredients = `The ingredient list is too long (limit ${MAX_INPUT_LENGTH} characters).`;
  } else if (hasNul(ingredients)) {
    errors.ingredients = 'The ingredient list contains a character that is not allowed.';
  } else if (parseIngredients(ingredients).length === 0) {
    errors.ingredients = 'No ingredients found. Separate them with commas.';
  }

  return { errors, clean: { name, ingredients } };
}

module.exports = { NAME_MAX_LENGTH, PERIODS, parseId, parsePeriod, validateProduct };
