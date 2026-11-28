// Test helper: reads public/style.css and works out colours (custom properties) and WCAG contrast.
// Pure: no browser, no server. Lives in lib/ and not in public/, which is served to everyone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

// Contrast between two custom properties, e.g. ratio('--ink', '--sky')
const ratio = (fg, bg) => contrast(resolve(fg), resolve(bg));

// Every rule as { selectors: [...], body }. Good enough for this flat style sheet (no nesting;
// @media blocks are looked into, @font-face and @keyframes are skipped).
function rules() {
  const found = [];
  const strip = css.replace(/\/\*[^]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(strip))) {
    const selector = match[1].trim().split(/\n/).pop().trim();
    if (selector === '' || selector.startsWith('@')) continue;
    found.push({ selectors: selector.split(',').map((s) => s.trim()), body: match[2] });
  }
  return found;
}

module.exports = { css, vars, resolve, contrast, ratio, rules };
