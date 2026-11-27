// A form that forgets the token would be refused with 403 in production, so check every view.
// Reads the view files only: no server, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', 'views');

function viewFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? viewFiles(path.join(dir, entry.name)) : entry.name.endsWith('.ejs') ? [path.join(dir, entry.name)] : []);
}

// Each <form ...> opening tag that posts, and the text up to the matching </form>.
function postForms(source) {
  const forms = [];
  const open = /<form\b[^]*?(?:method\s*=\s*"post"|method\s*=\s*'post')[^]*?>/gi;
  let match;
  while ((match = open.exec(source))) {
    const end = source.indexOf('</form>', match.index);
    forms.push(source.slice(match.index, end === -1 ? source.length : end));
  }
  return forms;
}

test('every <form method="post"> in views/ includes the CSRF partial', () => {
  let found = 0;
  for (const file of viewFiles(viewsDir)) {
    const forms = postForms(fs.readFileSync(file, 'utf8'));
    for (const form of forms) {
      found++;
      assert.match(form, /include\(\s*'(?:partials\/)?csrf'\s*\)/, `${path.relative(viewsDir, file)} has a POST form without the CSRF partial: ${form.slice(0, 80)}`);
    }
  }
  assert.ok(found >= 7, `expected at least 7 POST forms, found ${found}`);
});

test('no view submits a form with a method other than get or post (those would skip the check)', () => {
  for (const file of viewFiles(viewsDir)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /<form\b[^>]*method\s*=\s*["'](?:put|patch|delete)["']/i, path.relative(viewsDir, file));
  }
});

test('the partial prints a hidden _csrf field with the token, and an empty one when there is no token function', async () => {
  const file = path.join(viewsDir, 'partials', 'csrf.ejs');
  const withToken = await ejs.renderFile(file, { csrfToken: () => 'abc.def' });
  assert.match(withToken, /<input type="hidden" name="_csrf" value="abc\.def">/);
  const without = await ejs.renderFile(file, {});
  assert.match(without, /name="_csrf" value=""/);
});

test('the partial escapes the token (it is only ever hex and a dot, but it must never break out of the attribute)', async () => {
  const html = await ejs.renderFile(path.join(viewsDir, 'partials', 'csrf.ejs'), { csrfToken: () => '"><script>x</script>' });
  assert.doesNotMatch(html, /<script>/);
});
