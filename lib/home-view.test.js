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

test('home view: there is a place for the result chips, above the result list, hidden until there are results', async () => {
  const html = await render(null);
  const chips = html.indexOf('id="results-chips"');
  assert.ok(chips > -1);
  assert.ok(chips < html.indexOf('id="results-list"'), 'the chips come before the accordion');
  assert.match(html, /<ul id="results-chips" class="chips results__chips" aria-hidden="true" hidden>/);
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
