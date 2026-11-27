// Pure helpers for reading ingredient lists. No database, no Express.

// Longest input we look at. Anything beyond this is ignored.
const MAX_INPUT_LENGTH = 5000;

// "Ingredients:" / "Full ingredients -" at the very start of the text.
const LEADING_HEADING = /^\s*(?:full\s+)?ingredients?\b\s*[:\-：]?\s*/i;

// "Active ingredients:" / "Inactive ingredient:" anywhere in the text.
// The colon is required so ordinary words are never touched.
const INNER_HEADING = /\b(?:in)?active\s+ingredients?\s*[:：]/gi;

// Hyphen look-alikes copied from web pages (U+2010 to U+2015 and the minus sign).
const ODD_DASHES = /[‐-―−]/g;

const WHITESPACE = /\s+/g;
const TRAILING_DOTS = /[.\s]+$/;
const DIGIT = /[0-9]/;

const OPENING_BRACKETS = '([{';
const CLOSING_BRACKETS = ')]}';

// Is the character at `index` a list separator?
// Commas, semicolons and line breaks separate items, except a comma that sits
// between two digits (1,2-Hexanediol), which is part of the name.
function isSeparatorAt(text, index) {
  const char = text[index];
  if (char === ';' || char === '\n' || char === '\r') return true;
  if (char !== ',') return false;
  return !(DIGIT.test(text[index - 1] || '') && DIGIT.test(text[index + 1] || ''));
}

// For every character, 1 if it sits inside a matched pair of brackets, else 0.
// A regex cannot count nesting, so this is a small stack-based scan.
// An opening bracket without a closing one (or the reverse) is ignored, so a
// stray "(" can never swallow the rest of the list.
function insideBrackets(text) {
  const change = new Int32Array(text.length + 1);
  const open = [];
  for (let i = 0; i < text.length; i += 1) {
    if (OPENING_BRACKETS.includes(text[i])) {
      open.push(i);
    } else if (CLOSING_BRACKETS.includes(text[i]) && open.length > 0) {
      const start = open.pop();
      change[start] += 1;
      change[i + 1] -= 1;
    }
  }
  const inside = new Uint8Array(text.length);
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    depth += change[i];
    inside[i] = depth > 0 ? 1 : 0;
  }
  return inside;
}

function splitItems(text) {
  const inside = insideBrackets(text);
  const items = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!inside[i] && isSeparatorAt(text, i)) {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  items.push(text.slice(start));
  return items;
}

// Did the length cap fall between two items (so the last kept item is complete)?
function capIsClean(input) {
  const window = input.slice(0, MAX_INPUT_LENGTH * 4);
  const inside = insideBrackets(window);
  return [MAX_INPUT_LENGTH, MAX_INPUT_LENGTH - 1].some(
    (index) => isSeparatorAt(window, index) && !inside[index],
  );
}

// Splits a pasted ingredient list into lowercase, tidy item names.
// Duplicates and order are kept; findActives does the deduplication.
function parseIngredients(input) {
  if (typeof input !== 'string') return [];

  const truncated = input.length > MAX_INPUT_LENGTH;
  const cleanCut = truncated ? capIsClean(input) : true;

  const text = (truncated ? input.slice(0, MAX_INPUT_LENGTH) : input)
    .replace(ODD_DASHES, '-')
    .replace(INNER_HEADING, '\n') // a heading acts like a line break, so it never sticks to an item
    .replace(LEADING_HEADING, '');

  const items = splitItems(text)
    .map((item) => item.replace(WHITESPACE, ' ').trim().replace(TRAILING_DOTS, '').trim().toLowerCase())
    .filter((item) => item !== '');

  // An item cut in half by the cap could be mistaken for a different name.
  if (!cleanCut) items.pop();

  return items;
}

// The form of a name used for comparing: lowercase, with hyphens and runs of
// spaces treated as one space. "Alpha-Arbutin" and "alpha arbutin" share a key.
// Words are never joined or fuzzy-matched: "alphaarbutin" has a different key.
function matchKey(value) {
  if (typeof value !== 'string') return '';
  return value.replace(ODD_DASHES, '-').replace(/-/g, ' ').replace(WHITESPACE, ' ').trim().toLowerCase();
}

const BRACKET_GROUP = /[(\[{]([^()\[\]{}]*)[)\]}]/;
const BRACKET_PART_SEPARATOR = /[,;/]/;

// The names to try for one parsed item: the item with its brackets removed,
// then each part found inside a bracket. "vitamin c (ascorbic acid)" gives
// ["vitamin c", "ascorbic acid"].
function candidatesFor(item) {
  let rest = item;
  const inner = [];
  let group = BRACKET_GROUP.exec(rest);
  while (group !== null) {
    inner.push(...group[1].split(BRACKET_PART_SEPARATOR));
    rest = `${rest.slice(0, group.index)} ${rest.slice(group.index + group[0].length)}`;
    group = BRACKET_GROUP.exec(rest);
  }
  return [rest, ...inner];
}

// Returns the actives whose INCI aliases appear in the pasted list: each once,
// in the order they first appear on the label. A name must equal an alias
// (ignoring case, hyphens and extra spaces); parts of names never match.
function findActives(text, actives) {
  if (!Array.isArray(actives)) return [];

  const byKey = new Map();
  for (const active of actives) {
    for (const alias of (active && active.inciAliases) || []) {
      const key = matchKey(alias);
      if (key !== '' && !byKey.has(key)) byKey.set(key, active);
    }
  }

  const found = new Set();
  for (const item of parseIngredients(text)) {
    for (const candidate of candidatesFor(item)) {
      const active = byKey.get(matchKey(candidate));
      if (active) found.add(active);
    }
  }
  return [...found];
}

module.exports = { MAX_INPUT_LENGTH, parseIngredients, matchKey, findActives };
