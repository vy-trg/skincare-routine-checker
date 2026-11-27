// Checks the shape of data/rules.json. Reads files only: no database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json'), 'utf8'));
const actives = require('./actives.json');
const { checkRoutine } = require('../lib/rules');

const activeIds = new Set(actives.map((active) => active.id));
const categories = new Set(actives.map((active) => active.category));

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEVERITIES = ['avoid', 'caution'];
const SCOPES = ['same-routine'];
// Words that would turn a "use at different times" tip into a medical claim.
const MEDICAL_WORDS = /\b(cures?|treat(?:s|ed|ing|ment)?|heals?|healing|diagnos\w*|diseases?|prevents?|therapy)\b/i;

const isActiveOrCategory = (value) => activeIds.has(value) || categories.has(value);

test('rules.json is a non-empty array of objects', () => {
  assert.ok(Array.isArray(rules));
  assert.ok(rules.length > 0, 'rules.json must contain at least one rule');
  for (const rule of rules) assert.equal(typeof rule, 'object');
});

test('every rule has the required fields with the right types', () => {
  for (const rule of rules) {
    const label = rule && rule.id;
    for (const field of ['id', 'a', 'b', 'severity', 'scope', 'reason', 'sourceUrl']) {
      assert.equal(typeof rule[field], 'string', `${label}: ${field} must be a string`);
      assert.notEqual(rule[field].trim(), '', `${label}: ${field} must not be empty`);
    }
  }
});

test('rule ids are unique and kebab-case', () => {
  const seen = new Set();
  for (const { id } of rules) {
    assert.match(id, KEBAB_CASE, `${id} is not kebab-case`);
    assert.equal(seen.has(id), false, `duplicate rule id ${id}`);
    seen.add(id);
  }
});

test('a and b are real active ids or real categories', () => {
  for (const { id, a, b } of rules) {
    assert.ok(isActiveOrCategory(a), `${id}: a "${a}" is not an active id or a category`);
    assert.ok(isActiveOrCategory(b), `${id}: b "${b}" is not an active id or a category`);
  }
});

test('a rule never pairs an active with itself', () => {
  for (const { id, a, b } of rules) {
    if (activeIds.has(a) && activeIds.has(b)) assert.notEqual(a, b, `${id}: a and b are the same active`);
  }
});

test('no two rules cover the same pair of sides, in either order', () => {
  const owner = new Map();
  for (const { id, a, b } of rules) {
    const key = [a, b].sort().join('|');
    assert.equal(owner.has(key), false, `${id} repeats the pair of ${owner.get(key)}`);
    owner.set(key, id);
  }
});

test('severity and scope have allowed values', () => {
  for (const { id, severity, scope } of rules) {
    assert.ok(SEVERITIES.includes(severity), `${id}: severity "${severity}" is not allowed`);
    assert.ok(SCOPES.includes(scope), `${id}: scope "${scope}" is not allowed`);
  }
});

test('reasons are a single plain sentence without medical wording', () => {
  for (const { id, reason } of rules) {
    assert.ok(reason.endsWith('.'), `${id}: reason should end with a full stop`);
    assert.equal(reason.slice(0, -1).includes('. '), false, `${id}: reason should be one sentence`);
    assert.doesNotMatch(reason, MEDICAL_WORDS, `${id}: reason uses medical wording`);
  }
});

// ---- the real rules, run through checkRoutine (pure functions, no database)

const warningsFor = (ids) => checkRoutine(ids, actives, rules).map((warning) => warning.ruleId);

test('real rules: an exfoliating acid with a retinoid or benzoyl peroxide is flagged', () => {
  assert.deepEqual(warningsFor(['retinol', 'glycolic-acid']), ['aha-retinoid']);
  assert.deepEqual(warningsFor(['benzoyl-peroxide', 'lactic-acid']), ['aha-benzoyl-peroxide']);
});

test('real rules: salicylic acid is flagged with benzoyl peroxide and with retinoids', () => {
  assert.deepEqual(warningsFor(['salicylic-acid', 'benzoyl-peroxide']), ['salicylic-acid-benzoyl-peroxide']);
  assert.deepEqual(warningsFor(['salicylic-acid', 'retinal']), ['salicylic-acid-retinoid']);
});

test('real rules: adapalene with benzoyl peroxide is a marketed combination and is not flagged', () => {
  assert.deepEqual(warningsFor(['adapalene', 'benzoyl-peroxide']), []);
  assert.deepEqual(warningsFor(['retinol', 'benzoyl-peroxide']), []);
});

test('real rules: combinations without a verified source are not flagged', () => {
  // niacinamide + vitamin C, vitamin C + retinol, two retinoids: no source was found for these.
  assert.deepEqual(warningsFor(['niacinamide', 'l-ascorbic-acid']), []);
  assert.deepEqual(warningsFor(['l-ascorbic-acid', 'retinol']), []);
  assert.deepEqual(warningsFor(['retinol', 'adapalene']), []);
});

test('real rules: a busy routine gives each pair once, with the rule source attached', () => {
  const warnings = checkRoutine(['retinol', 'glycolic-acid', 'salicylic-acid', 'benzoyl-peroxide'], actives, rules);
  const pairs = warnings.map((warning) => warning.actives.join('+'));
  assert.equal(new Set(pairs).size, pairs.length);
  for (const warning of warnings) assert.ok(warning.sourceUrl.startsWith('https://'));
});

test('every rule has a non-empty https sourceUrl', () => {
  for (const { id, sourceUrl } of rules) {
    assert.ok(sourceUrl.startsWith('https://'), `${id}: sourceUrl must start with https://`);
    assert.doesNotThrow(() => new URL(sourceUrl), `${id}: sourceUrl is not a parseable URL`);
  }
});
