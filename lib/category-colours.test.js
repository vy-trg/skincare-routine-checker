// The category colour map lives in public/style.css (custom properties) and nowhere else. This test
// reads that file, resolves the variables and checks WCAG contrast, so a new colour or a new category
// cannot slip in unchecked. Pure: no browser, no server. (It is here and not in public/, which is served.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const actives = require('../data/actives.json');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

// All custom property declarations (--name: value;). A later declaration wins, like in CSS.
const vars = new Map();
for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+);/gi)) vars.set(match[1], match[2].trim());

function resolve(name, seen = new Set()) {
  assert.ok(vars.has(name), `style.css does not define ${name}`);
  assert.ok(!seen.has(name), `${name} refers to itself`);
  const value = vars.get(name);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  return ref ? resolve(ref[1], new Set([...seen, name])) : value;
}

function channel(hex, from) {
  const v = parseInt(hex.slice(from, from + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `expected a #rrggbb colour, got ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const categories = [...new Set(actives.map((a) => a.category))];
const colour = (name) => resolve(name);

test('contrast helper: black on white is 21:1 and the same colour is 1:1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#336699', '#336699'), 1);
});

test('every category in data/actives.json has a background, text and mark colour', () => {
  assert.ok(categories.length >= 10, 'expected the categories from actives.json');
  for (const category of categories) {
    for (const part of ['bg', 'fg', 'mark']) {
      assert.ok(vars.has(`--cat-${category}-${part}`), `missing --cat-${category}-${part} in style.css`);
    }
  }
});

test('every category has a [data-category] rule that sets the chip and icon colours', () => {
  for (const category of categories) {
    const rule = new RegExp(`\\[data-category="${category}"\\]\\s*\\{[^}]*--c-bg:\\s*var\\(--cat-${category}-bg\\)[^}]*--c-fg:\\s*var\\(--cat-${category}-fg\\)[^}]*--c-mark:\\s*var\\(--cat-${category}-mark\\)`);
    assert.match(css, rule, `no [data-category="${category}"] rule in style.css`);
  }
});

test('there are about five colour families, and every category maps to one of them', () => {
  const families = new Set();
  for (const category of categories) {
    const raw = vars.get(`--cat-${category}-bg`);
    const ref = /^var\(--fam-([a-z-]+)-bg\)$/.exec(raw);
    assert.ok(ref, `--cat-${category}-bg should point at a family colour (--fam-*-bg), got ${raw}`);
    families.add(ref[1]);
  }
  assert.equal(families.size, 5, [...families].join(', '));
});

test('the groups are the ones agreed: exfoliants, retinoids, vitamin C and antioxidants, brightening and acne, hydration', () => {
  const famOf = (c) => /^var\(--fam-([a-z-]+)-bg\)$/.exec(vars.get(`--cat-${c}-bg`))[1];
  assert.equal(new Set(['aha', 'pha', 'bha'].map(famOf)).size, 1);
  assert.equal(new Set(['vitamin-c', 'antioxidant'].map(famOf)).size, 1);
  assert.equal(new Set(['brightening', 'acne', 'benzoyl-peroxide'].map(famOf)).size, 1);
  const all = ['aha', 'retinoid', 'vitamin-c', 'brightening', 'hydration-and-barrier'].map(famOf);
  assert.equal(new Set(all).size, 5, 'the five groups must have five different colour families');
});

test('chip text is readable on its chip background (WCAG AA, 4.5:1)', () => {
  for (const category of [...categories, 'none']) {
    const ratio = contrast(colour(`--cat-${category}-fg`), colour(`--cat-${category}-bg`));
    assert.ok(ratio >= 4.5, `${category}: text on chip is ${ratio.toFixed(2)}:1`);
  }
});

test('the icon colour is visible on the page and card backgrounds (WCAG non-text, 3:1)', () => {
  for (const category of [...categories, 'none']) {
    for (const surface of ['--paper', '--surface']) {
      const ratio = contrast(colour(`--cat-${category}-mark`), colour(surface));
      assert.ok(ratio >= 3, `${category}: icon on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('chip backgrounds are not the same as the page, so a chip never disappears', () => {
  for (const category of [...categories, 'none']) {
    assert.notEqual(colour(`--cat-${category}-bg`).toLowerCase(), colour('--paper').toLowerCase(), category);
  }
});

test('the colours used for ordinary text and for the clay accent stay readable too', () => {
  const pairs = [
    ['--ink', '--paper'], ['--muted', '--paper'], ['--muted', '--surface'],
    ['--clay', '--paper'], ['--clay', '--surface'], ['--brick', '--paper'], ['--brick', '--surface'],
    ['--ink', '--seg-track'], // the AM | PM toggle uses ink text on its track (muted would be only 4.4:1)
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(colour(fg), colour(bg));
    assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  }
});

test('the style sheet never turns text into capitals (headings and labels are Title Case)', () => {
  assert.doesNotMatch(css, /text-transform\s*:\s*uppercase/i);
});
