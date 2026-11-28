const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { FONT_ROUTES, fontFileFor } = require('./fonts');

test('fonts: each served folder exists and holds woff2 files', () => {
  for (const [prefix, dir] of Object.entries(FONT_ROUTES)) {
    assert.ok(fs.existsSync(dir), `${prefix} -> ${dir} is missing (run npm install)`);
    assert.ok(fs.readdirSync(dir).some((f) => f.endsWith('.woff2')), `${prefix} has no woff2 files`);
  }
});

test('fonts: the files the style sheet needs exist', () => {
  for (const url of [
    '/fonts/inter-tight/inter-tight-latin-wght-normal.woff2',
    '/fonts/inter-tight/inter-tight-latin-ext-wght-normal.woff2',
    '/fonts/inter-tight/inter-tight-vietnamese-wght-normal.woff2',
    '/fonts/reenie-beanie/reenie-beanie-latin-400-normal.woff2',
  ]) {
    assert.ok(fs.existsSync(fontFileFor(url)), url);
  }
});

test('fontFileFor: only plain file names under our two prefixes, never a path out of them', () => {
  assert.equal(fontFileFor('/fonts/other/x.woff2'), null);
  assert.equal(fontFileFor('https://fonts.gstatic.com/x.woff2'), null);
  for (const bad of ['/fonts/inter-tight/', '/fonts/inter-tight/../package.json', '/fonts/inter-tight/a/b.woff2', '/fonts/inter-tight/..\\x', undefined, null, 5]) {
    assert.equal(fontFileFor(bad), null, String(bad));
  }
});
