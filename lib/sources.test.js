const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceName, PUBLISHERS } = require('./sources');
const actives = require('../data/actives.json');
const rules = require('../data/rules.json');

test('sourceName: the three known sites give their publisher, with or without www', () => {
  assert.equal(sourceName('https://www.aad.org/public/everyday-care'), 'American Academy of Dermatology');
  assert.equal(sourceName('https://aad.org/x'), 'American Academy of Dermatology');
  assert.equal(sourceName('https://dermnetnz.org/topics/retinoids'), 'DermNet');
  assert.equal(sourceName('https://pmc.ncbi.nlm.nih.gov/articles/PMC123/'), 'PubMed Central');
  assert.equal(sourceName('HTTPS://WWW.AAD.ORG/X'), 'American Academy of Dermatology');
});

test('sourceName: an unknown host falls back to the host name (without www)', () => {
  assert.equal(sourceName('https://www.example.org/page'), 'example.org');
  assert.equal(sourceName('https://skin.example.com/a?b=1'), 'skin.example.com');
});

test('sourceName: a look-alike host is not mistaken for a known publisher', () => {
  assert.equal(sourceName('https://notaad.org/x'), 'notaad.org');
  assert.equal(sourceName('https://aad.org.evil.example/x'), 'aad.org.evil.example');
});

test('sourceName: not a web address means no name', () => {
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'ftp://aad.org/x', null, undefined, 5]) {
    assert.equal(sourceName(bad), null, String(bad));
  }
});

test('every source in the data gets a name, and the map holds only the agreed publishers', () => {
  for (const item of [...actives, ...rules]) {
    if (item.sourceUrl) assert.ok(sourceName(item.sourceUrl), item.sourceUrl);
  }
  assert.deepEqual(Object.keys(PUBLISHERS).sort(), ['aad.org', 'dermnetnz.org', 'pmc.ncbi.nlm.nih.gov']);
});
