// Renders the real views/home.ejs with sample data: no database, no server, no browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const actives = require('../data/actives.json');
const { categoryLabel } = require('../public/analyse-helpers');

const view = path.join(__dirname, '..', 'views', 'home.ejs');
const known = actives.map(({ id, name, category, inciAliases }) => ({ id, name, category, inciAliases }));
const render = (currentUser) => ejs.renderFile(view, { title: 'Test', actives: known, categoryLabel, currentUser, csrfToken: () => 'tok' });

test('home view: "No account needed." is shown to guests, under the Analyse button, and not to people who are logged in', async () => {
  const guest = await render(null);
  assert.match(guest, /id="analyse-button"[^]*?<\/button>\s*<p class="field__hint analyse__note">No account needed\.<\/p>/);
  const member = await render({ id: 1, email: 'a@b.co', display_name: 'A' });
  assert.doesNotMatch(member, /No account needed/);
});

test('home view: there is a hidden place for the marked list, above the result list', async () => {
  const html = await render(null);
  const marked = html.indexOf('id="results-marked"');
  assert.ok(marked > -1);
  assert.ok(marked < html.indexOf('id="results-list"'), 'the marked list comes before the accordion');
  assert.match(html, /<div id="results-marked-box" hidden>/);
  assert.doesNotMatch(html, /id="results-chips"/);
});

test('home view: the hero has the hand-lettered headline and the placeholder drawings, and exactly one margin note', async () => {
  const html = await render(null);
  assert.match(html, /<h1 class="home__headline">what's in the bottle\?<\/h1>/);
  assert.match(html, /class="hero__blob" src="\/illustrations\/blob\.svg" alt=""/);
  assert.match(html, /class="doodle hero__bottle" src="\/illustrations\/bottle-1\.svg" alt=""/);
  assert.match(html, /class="doodle hero__star" src="\/illustrations\/star\.svg" alt=""/);
  assert.equal((html.match(/class="margin-note"/g) || []).length, 1);
});

test('home view: every row of the Known Actives panel has a category chip with its colour', async () => {
  const html = await render(null);
  for (const category of new Set(known.map((a) => a.category))) {
    assert.match(html, new RegExp(`<span class="chip" data-category="${category}">`), category);
  }
  const rows = html.match(/<li class="known__item"/g) || [];
  const chips = html.match(/<li class="known__item"[^]*?<span class="chip" data-category=/g) || [];
  assert.equal(rows.length, known.length);
  assert.equal(chips.length, known.length);
});

test('home view: the old tag class is gone', async () => {
  assert.doesNotMatch(await render(null), /class="tag"/);
});
