// Renders the REAL views/routine.ejs with sample data (no database, no server) and checks the HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { buildRoutinePage, PRECAUTION_LINE } = require('./routine-page');
const knownCount = require('../data/actives.json').length;

const view = path.join(__dirname, '..', 'views', 'routine.ejs');
const row = (id, name, ingredients_raw) => ({ id, name, ingredients_raw });
const everyProduct = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Product ${id}` }));

async function render({ period = 'am', am = [], pm = [], products = everyProduct } = {}) {
  const page = buildRoutinePage({ period, rowsByPeriod: { am, pm }, allProducts: products });
  return ejs.renderFile(view, { title: 'Test', period, page, currentUser: { id: 1 }, csrfToken: () => 'tok-123' });
}

const clearAm = [row(1, 'Serum', 'Aqua, Niacinamide'), row(2, 'Cream', 'Aqua, Sodium Hyaluronate')];
const conflictPm = [row(3, 'Toner', 'Aqua, Glycolic Acid'), row(4, 'Night Serum', 'Aqua, Retinol, Tocopherol')];

test('routine view: an AM | PM toggle of two real links, with only the current one marked', async () => {
  for (const period of ['am', 'pm']) {
    const html = await render({ period });
    const nav = /<nav class="seg"[^]*?<\/nav>/.exec(html)[0];
    assert.match(nav, /href="\/routines\/am"/);
    assert.match(nav, /href="\/routines\/pm"/);
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    assert.match(nav, new RegExp(`href="/routines/${period}" aria-current="page"`));
    assert.match(nav, /AM<span class="status-live"> \(morning routine\)/);
  }
});

test('routine view: both routines are in the page, and only the current one is marked as current', async () => {
  const html = await render({ period: 'pm', am: clearAm, pm: conflictPm });
  assert.match(html, /id="routine-am-title">Morning Routine</);
  assert.match(html, /id="routine-pm-title">Evening Routine</);
  assert.equal((html.match(/class="routine routine--current"/g) || []).length, 1);
  assert.match(html, /<section class="routine routine--current" aria-labelledby="routine-pm-title">/);
});

test('routine view: rows have a step number, the name in bold, an icon and one chip per active', async () => {
  const html = await render({ pm: conflictPm });
  const pm = html.slice(html.indexOf('routine-pm-title'));
  assert.match(pm, /<span class="step__number" aria-hidden="true">1<\/span>/);
  assert.match(pm, /<span class="step__number" aria-hidden="true">2<\/span>/);
  assert.match(pm, /<strong class="step__name">Night Serum<\/strong>/);
  assert.match(pm, /<span class="product-icon" data-category="aha"/); // Toner: glycolic acid is an AHA
  assert.match(pm, /<span class="product-icon" data-category="retinoid"/); // Night Serum: retinol is listed first
  assert.match(pm, /<span class="chip" data-category="retinoid">Retinol<\/span>/);
  assert.match(pm, /<span class="chip" data-category="antioxidant">Tocopherol \(vitamin E\)<\/span>/);
});

test('routine view: a product with no known active gets a grey icon, no chips and a plain note', async () => {
  const html = await render({ am: [row(1, 'Plain Cream', 'Aqua, Cetyl Alcohol')] });
  const am = html.slice(html.indexOf('routine-am-title'), html.indexOf('routine-pm-title'));
  assert.match(am, /<span class="product-icon" aria-hidden="true">/);
  assert.doesNotMatch(am, /class="chip"/);
  assert.match(am, /No known actives found/);
});

test('routine view: there are no percentages anywhere', async () => {
  const html = await render({ am: clearAm, pm: conflictPm });
  const body = html.replace(/<style[^]*?<\/style>/g, '').replace(/<svg class="crayon-defs"[^]*?<\/svg>/, ''); // the drawing filter uses % for its size
  assert.doesNotMatch(body, /\d\s*%/);
});

test('routine view: a conflict is an insight card with title, level, reason, source and the precaution', async () => {
  const html = await render({ pm: conflictPm });
  const card = /<article class="insight insight--caution">[^]*?<\/article>/.exec(html)[0];
  assert.match(card, /<p class="insight__level">Use With Care<\/p>/);
  assert.match(card, /<h4 class="insight__title">Glycolic acid with Retinol<\/h4>/);
  assert.match(card, /<p class="insight__reason">The source says exfoliating/);
  assert.match(card, /<a href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer"/);
  assert.ok(card.includes(PRECAUTION_LINE));
  assert.doesNotMatch(html.slice(html.indexOf('routine-am-title'), html.indexOf('routine-pm-title')), /class="insight/);
});

test('routine view: the calm card shows the claim, the three facts and the reminder', async () => {
  const html = await render({ am: clearAm });
  const card = /<div class="calm">[^]*?<\/div>/.exec(html)[0];
  assert.ok(card.includes(`No conflicts found among the ${knownCount} actives we know`));
  assert.equal((card.match(/<span class="calm__tick"/g) || []).length, 3);
  assert.match(card, /No warning does not mean this routine suits you\./);
});

test('routine view: no "no conflicts" claim for an empty routine or a single known active', async () => {
  const empty = await render({});
  const one = await render({ am: [row(1, 'Serum', 'Aqua, Niacinamide')] });
  for (const html of [empty, one]) {
    assert.doesNotMatch(html, /No conflicts found/);
    assert.doesNotMatch(html, /class="calm"/);
  }
  assert.match(empty, /Add products to this routine to check them for conflicts\./);
  assert.match(one, /Only one known active was found in this routine/);
});

test('routine view: every POST form has the CSRF field, and ids are not repeated', async () => {
  const html = await render({ am: clearAm, pm: conflictPm });
  const forms = html.match(/<form method="post"/g) || [];
  const fields = html.match(/<input type="hidden" name="_csrf" value="tok-123">/g) || [];
  assert.ok(forms.length >= 7, `forms: ${forms.length}`); // logout + 4 removes + 2 add forms
  assert.equal(fields.length, forms.length);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
  assert.match(html, /<label for="product_id_am">Add a Product<\/label>/);
  assert.match(html, /<label for="product_id_pm">Add a Product<\/label>/);
});

test('routine view: forms post to the routine they sit in', async () => {
  const html = await render({ am: clearAm, pm: conflictPm });
  const am = html.slice(html.indexOf('routine-am-title'), html.indexOf('routine-pm-title'));
  const pm = html.slice(html.indexOf('routine-pm-title'));
  assert.match(am, /action="\/routines\/am\/items"/);
  assert.match(am, /action="\/routines\/am\/items\/1\/delete"/);
  assert.doesNotMatch(am, /\/routines\/pm\//);
  assert.match(pm, /action="\/routines\/pm\/items\/3\/delete"/);
});

test('routine view: product names are escaped', async () => {
  const html = await render({ am: [row(1, '<script>alert(1)</script>', 'Aqua, Niacinamide')] });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('routine view: the disclaimer stays on the page', async () => {
  const html = await render({});
  assert.match(html, /For general information only\. This is not medical advice\./);
});
