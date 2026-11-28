// Reads public/style.css and the views and checks the rules of the "doodle + crayon" design:
// the palette, readable text pairs, fonts only from our own server, handwriting only where allowed,
// the crayon filter only on drawings, and the placeholder illustrations. No browser, no server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { css, vars, resolve, ratio, rules } = require('./css-colours');
const { fontFileFor } = require('./fonts');

const root = path.join(__dirname, '..');
const viewFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? viewFiles(path.join(dir, e.name)) : e.name.endsWith('.ejs') ? [path.join(dir, e.name)] : []);

test('palette: the agreed colours, and no clay or beige tokens left', () => {
  const expected = { '--white': '#ffffff', '--ink': '#151515', '--hairline': '#eaeaea', '--sky': '#a9d3f5', '--sky-tint': '#c9e6fa', '--orange': '#ff7a45', '--orange-tint': '#ffd3bf', '--orange-tint-2': '#ffe7dc' };
  for (const [name, hex] of Object.entries(expected)) assert.equal(resolve(name).toLowerCase(), hex, name);
  assert.ok(['#555555', '#666666'].includes(resolve('--muted').toLowerCase()), 'muted text is #555 or #666');
  for (const old of ['--paper', '--clay', '--brick', '--surface', '--rule', '--seg-track', '--serif']) {
    assert.ok(!vars.has(old), `${old} should be gone`);
    assert.ok(!css.includes(`var(${old})`), `${old} is still used`);
  }
  assert.doesNotMatch(css, /#(?:f3eee4|9c4a2f|a1281c|faf7f0|26221e)\b/i, 'an old beige or clay colour is still in the style sheet');
});

test('contrast: every text and background pair in use is at least 4.5:1', () => {
  const pairs = [
    ['--ink', '--white'], ['--muted', '--white'], ['--ink', '--sky'], ['--ink', '--sky-tint'],
    ['--ink', '--orange-tint'], ['--ink', '--orange-tint-2'], ['--ink', '--hairline'],
    ['--muted', '--sky-tint'], ['--muted', '--orange-tint-2'], ['--white', '--ink'], // the dark pill and the buttons
    ['--ink', '--orange'], // the badge triangle on orange
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1`);
});

test('contrast: borders and the focus ring that show the shape of a control are at least 3:1 on white and sky blue', () => {
  for (const bg of ['--white', '--sky', '--sky-tint']) assert.ok(ratio('--ink', bg) >= 3, bg);
});

test('orange is never a text colour, and never the colour of an icon that carries meaning', () => {
  for (const { selectors, body } of rules()) {
    assert.doesNotMatch(body, /(?:^|[;\s])color:\s*(?:var\(--orange|#ff7a45)/i, `${selectors} uses orange as a text colour`);
  }
});

test('no request goes to Google Fonts or any other outside host for fonts or styles', () => {
  const withoutDataUris = css.replace(/url\("data:[^)]*\)/g, ''); // an SVG data URI names the w3.org namespace, which is not a request
  assert.doesNotMatch(withoutDataUris, /fonts\.googleapis|fonts\.gstatic|@import|https?:\/\//i);
  for (const file of viewFiles(path.join(root, 'views'))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /fonts\.googleapis|fonts\.gstatic|<link[^>]+href="https?:/i, path.relative(root, file));
  }
});

test('every @font-face and preloaded font points at a file that exists in the fontsource packages', () => {
  const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
  const head = fs.readFileSync(path.join(root, 'views', 'partials', 'head.ejs'), 'utf8');
  urls.push(...[...head.matchAll(/href="(\/fonts\/[^"]+)"/g)].map((m) => m[1]));
  assert.ok(urls.length >= 5, 'expected the Inter Tight and Reenie Beanie files');
  for (const url of urls) assert.ok(fs.existsSync(fontFileFor(url) || '/nonexistent'), url);
  assert.match(css, /font-family:\s*"Inter Tight Variable"/);
  assert.match(css, /font-family:\s*"Reenie Beanie"/);
});

test('handwriting (Reenie Beanie) is used only for the wordmark, home headline, warning titles, step numbers and the margin note', () => {
  const allowed = new Set(['.masthead__name', '.home__headline', '.insight__title', '.step__number', '.margin-note']);
  let seen = 0;
  for (const { selectors, body } of rules()) {
    if (!/var\(--hand\)/.test(body)) continue;
    seen += 1;
    for (const selector of selectors) assert.ok(allowed.has(selector), `${selector} may not use the handwriting font`);
  }
  assert.ok(seen >= 1);
  // The font stack is only ever used through the token, and never in a "font:" shorthand.
  assert.ok(!/font:[^;]*var\(--hand\)/.test(css), 'use font-family: var(--hand), not the font shorthand');
  const users = [...css.matchAll(/font-family:\s*var\(--hand\)/g)].length;
  assert.equal(users, 1, 'the handwriting font is switched on in one rule only');
});

test('the crayon filter is applied only through the .doodle class, never to text', () => {
  const withFilter = rules().filter(({ body }) => /filter:\s*url\(/.test(body));
  assert.deepEqual(withFilter.map((r) => r.selectors), [['.doodle']]);
  const head = fs.readFileSync(path.join(root, 'views', 'partials', 'head.ejs'), 'utf8');
  assert.match(head, /<filter id="crayon"[^]*feTurbulence[^]*feDisplacementMap/);
  assert.doesNotMatch(head, /<animate|<set\b/, 'the filter is static');
  for (const file of viewFiles(path.join(root, 'views'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const tag of source.match(/<[a-z0-9]+\b[^>]*class="[^"]*\bdoodle\b[^"]*"[^>]*>/gi) || []) {
      assert.match(tag, /^<img\b/i, `${path.relative(root, file)}: .doodle is for drawings (img) only: ${tag.slice(0, 60)}`);
    }
  }
});

test('headings and buttons are never turned into capitals', () => {
  assert.doesNotMatch(css, /text-transform\s*:\s*uppercase/i);
});

test('motion: entrances are ease-out 150 to 250 ms, buttons shrink to 0.97 when pressed, reduced motion turns it off', () => {
  assert.match(css, /--ease-out:\s*cubic-bezier\(0\.22,\s*0\.61,\s*0\.36,\s*1\)/);
  for (const match of css.matchAll(/animation:\s*(?:rise|pulse)\s+(\d+)ms/g)) {
    if (match[0].includes('pulse')) continue;
    assert.ok(Number(match[1]) >= 150 && Number(match[1]) <= 250, match[0]);
  }
  assert.match(css, /\.button:active\s*\{\s*transform:\s*scale\(0\.97\)/);
  assert.match(css, /calc\(min\(var\(--i, 0\), 10\) \* 30ms\)/, 'rows are staggered by 30ms');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*animation:\s*none !important[^]*transition:\s*none !important/);
  assert.doesNotMatch(css, /cubic-bezier\([^)]*-\d/, 'no bounce curves');
});

test('paragraph width stays inside 45 to 75 characters', () => {
  assert.match(css, /--line:\s*65ch/);
  assert.match(css, /\bp\s*\{\s*max-width:\s*var\(--line\)/);
});

test('illustrations: the named placeholder files exist, are small SVG drawings and hold no script or outside link', () => {
  const dir = path.join(root, 'public', 'illustrations');
  for (const name of ['bottle-1', 'bottle-2', 'bottle-3', 'star', 'sun', 'moon', 'blob']) {
    const file = path.join(dir, `${name}.svg`);
    assert.ok(fs.existsSync(file), `${name}.svg is missing`);
    const svg = fs.readFileSync(file, 'utf8');
    assert.match(svg, /^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, name);
    assert.ok(svg.length < 4000, `${name}.svg is not small`);
    assert.match(svg, /PLACEHOLDER/, `${name}.svg should say it is a placeholder`);
    assert.doesNotMatch(svg, /<script|\son[a-z]+\s*=|href\s*=|<image|<foreignObject|javascript:/i, name);
  }
});

test('views reference illustrations by file name only (they never depend on the drawing inside)', () => {
  for (const file of viewFiles(path.join(root, 'views'))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\/illustrations\/([a-z0-9<>%=\s'"+()-]+?\.svg)/gi)) {
      assert.match(m[1], /^(bottle-\d|bottle-<%=[^%]+%>|star|sun|moon|blob)\.svg$/, `${path.relative(root, file)}: ${m[1]}`);
    }
  }
});
