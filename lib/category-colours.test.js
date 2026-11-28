// The category colour map lives in public/style.css (custom properties) and nowhere else. This test
// reads that file, resolves the variables and checks WCAG contrast, so a new colour or a new category
// cannot slip in unchecked. Pure: no browser, no server.
const test = require('node:test');
const assert = require('node:assert/strict');
const actives = require('../data/actives.json');
const { css, vars, resolve, contrast, ratio } = require('./css-colours');

const categories = [...new Set(actives.map((a) => a.category))];

// The agreed rule: blue = gentle families, orange = treatment families. Colour only groups; it is not about safety.
const GENTLE = ['brightening', 'hydration-and-barrier', 'antioxidant', 'vitamin-c'];
const TREATMENT = ['aha', 'pha', 'bha', 'retinoid', 'benzoyl-peroxide', 'acne'];

test('contrast helper: black on white is 21:1 and the same colour is 1:1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#336699', '#336699'), 1);
});

test('every category in data/actives.json has a background, text and mark colour and a [data-category] rule', () => {
  assert.ok(categories.length >= 10, 'expected the categories from actives.json');
  for (const category of categories) {
    for (const part of ['bg', 'fg', 'mark']) assert.ok(vars.has(`--cat-${category}-${part}`), `missing --cat-${category}-${part}`);
    const rule = new RegExp(`\\[data-category="${category}"\\]\\s*\\{[^}]*--c-bg:\\s*var\\(--cat-${category}-bg\\)[^}]*--c-fg:\\s*var\\(--cat-${category}-fg\\)[^}]*--c-mark:\\s*var\\(--cat-${category}-mark\\)`);
    assert.match(css, rule, `no [data-category="${category}"] rule in style.css`);
  }
});

test('the two tones: gentle categories are blue, treatment categories are orange, and together they cover every category', () => {
  assert.deepEqual([...GENTLE, ...TREATMENT].sort(), [...categories].sort(), 'a category is in neither group: decide its tone');
  const toneOf = (c) => /^var\(--fam-(gentle|treatment)-bg\)$/.exec(vars.get(`--cat-${c}-bg`))?.[1];
  for (const c of GENTLE) assert.equal(toneOf(c), 'gentle', c);
  for (const c of TREATMENT) assert.equal(toneOf(c), 'treatment', c);
  assert.equal(resolve('--fam-gentle-mark'), resolve('--sky'));
  assert.equal(resolve('--fam-treatment-mark'), resolve('--orange-tint'));
});

test('chip text is readable on its chip background and on its marker stroke (WCAG AA, 4.5:1)', () => {
  for (const category of [...categories, 'none']) {
    for (const part of ['bg', 'mark']) {
      const value = ratio(`--cat-${category}-fg`, `--cat-${category}-${part}`);
      assert.ok(value >= 4.5, `${category}: text on ${part} is ${value.toFixed(2)}:1`);
    }
  }
});

test('chips and markers are not the colour of the page, so they never disappear', () => {
  for (const category of [...categories, 'none']) {
    assert.notEqual(resolve(`--cat-${category}-bg`).toLowerCase(), resolve('--white').toLowerCase(), category);
  }
});
