// Keeps the deploy settings honest. Reads files only: no database, no network.
// Render reads "engines.node" and runs "npm start", so these must stay in step with CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'));
const ci = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'ci.yml'), 'utf8');

test('package.json: npm start runs the server', () => {
  assert.equal(pkg.scripts.start, 'node server.js');
});

test('package.json: npm run dev and npm test are still there', () => {
  assert.equal(pkg.scripts.dev, 'node --env-file=.env --watch server.js');
  assert.equal(pkg.scripts.test, 'node --test');
});

test('package.json: Node is pinned to 22.x', () => {
  assert.equal(pkg.engines.node, '22.x');
});

test('package-lock.json: records the same Node pin', () => {
  assert.equal(lock.packages[''].engines.node, pkg.engines.node);
});

test('CI runs the same Node major version as the engines pin', () => {
  const pinned = pkg.engines.node.split('.')[0];
  const match = ci.match(/node-version:\s*['"]?(\d+)/);
  assert.ok(match, 'ci.yml has no node-version');
  assert.equal(match[1], pinned);
});
