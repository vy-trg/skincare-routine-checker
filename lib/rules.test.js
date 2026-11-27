// Pure-function tests for checkRoutine: fixtures only, no data files, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRoutine } = require('./rules');

const actives = [
  { id: 'retinol', category: 'retinoid' },
  { id: 'retinal', category: 'retinoid' },
  { id: 'adapalene', category: 'retinoid' },
  { id: 'glycolic-acid', category: 'aha' },
  { id: 'lactic-acid', category: 'aha' },
  { id: 'salicylic-acid', category: 'bha' },
  { id: 'l-ascorbic-acid', category: 'vitamin-c' },
  { id: 'benzoyl-peroxide', category: 'benzoyl-peroxide' },
  { id: 'niacinamide', category: 'brightening' },
];

function rule(id, a, b, severity = 'caution', extra = {}) {
  return {
    id,
    a,
    b,
    severity,
    scope: 'same-routine',
    reason: `Reason for ${id}.`,
    sourceUrl: `https://example.org/${id}`,
    ...extra,
  };
}

const check = (ids, rules) => checkRoutine(ids, actives, rules);
const pairs = (warnings) => warnings.map((warning) => warning.actives.join('+'));

// ---------------------------------------------------------------- input handling

test('rules: invalid arguments give an empty list and never throw', () => {
  const rules = [rule('r1', 'retinol', 'benzoyl-peroxide')];
  assert.deepEqual(checkRoutine(undefined, actives, rules), []);
  assert.deepEqual(checkRoutine('retinol', actives, rules), []);
  assert.deepEqual(checkRoutine(['retinol', 'benzoyl-peroxide'], undefined, rules), []);
  assert.deepEqual(checkRoutine(['retinol', 'benzoyl-peroxide'], actives, undefined), []);
  assert.deepEqual(checkRoutine(['retinol', 'benzoyl-peroxide'], actives, null), []);
  assert.deepEqual(checkRoutine(['retinol', 'benzoyl-peroxide'], actives, {}), []);
});

test('rules: an empty routine, no rules, or a single active gives no warnings', () => {
  const rules = [rule('r1', 'retinol', 'benzoyl-peroxide')];
  assert.deepEqual(check([], rules), []);
  assert.deepEqual(check(['retinol'], rules), []);
  assert.deepEqual(check(['retinol', 'benzoyl-peroxide'], []), []);
});

test('rules: unknown and non-string ids are ignored', () => {
  const rules = [rule('r1', 'retinol', 'benzoyl-peroxide')];
  assert.deepEqual(check(['retinol', 'no-such-active', null, 5, undefined, {}], rules), []);
  assert.equal(check(['retinol', 'no-such-active', 'benzoyl-peroxide', null], rules).length, 1);
});

test('rules: duplicate ids count once', () => {
  const rules = [rule('r1', 'retinol', 'benzoyl-peroxide')];
  assert.equal(check(['retinol', 'retinol', 'benzoyl-peroxide', 'benzoyl-peroxide'], rules).length, 1);
  assert.deepEqual(check(['retinol', 'retinol'], [rule('r2', 'retinol', 'retinol')]), []);
});

// ---------------------------------------------------------------- one rule, two actives

test('rules: two actives that match a rule give one warning with all its details', () => {
  const rules = [rule('retinol-bpo', 'retinol', 'benzoyl-peroxide', 'avoid')];
  assert.deepEqual(check(['retinol', 'benzoyl-peroxide'], rules), [
    {
      ruleId: 'retinol-bpo',
      severity: 'avoid',
      scope: 'same-routine',
      reason: 'Reason for retinol-bpo.',
      sourceUrl: 'https://example.org/retinol-bpo',
      actives: ['benzoyl-peroxide', 'retinol'],
    },
  ]);
});

test('rules: a+b and b+a give the same warning', () => {
  const forward = check(['retinol', 'benzoyl-peroxide'], [rule('r1', 'retinol', 'benzoyl-peroxide')]);
  const backward = check(['retinol', 'benzoyl-peroxide'], [rule('r1', 'benzoyl-peroxide', 'retinol')]);
  assert.equal(forward.length, 1);
  assert.deepEqual(forward, backward);
});

test('rules: the order of the routine does not change the result', () => {
  const rules = [
    rule('r1', 'retinoid', 'aha'),
    rule('r2', 'aha', 'bha', 'avoid'),
    rule('r3', 'retinol', 'benzoyl-peroxide'),
  ];
  const ids = ['retinol', 'glycolic-acid', 'salicylic-acid', 'benzoyl-peroxide'];
  const expected = check(ids, rules);
  assert.ok(expected.length >= 3);
  const permutations = [
    [...ids].reverse(),
    [ids[2], ids[0], ids[3], ids[1]],
    [ids[3], ids[2], ids[1], ids[0]],
    [ids[1], ids[3], ids[0], ids[2]],
  ];
  for (const permutation of permutations) assert.deepEqual(check(permutation, rules), expected);
});

test('rules: actives that are not in the routine never cause a warning', () => {
  const rules = [rule('r1', 'retinoid', 'aha')];
  assert.deepEqual(check(['retinol', 'retinal'], rules), []);
  assert.deepEqual(check(['glycolic-acid', 'niacinamide'], rules), []);
});

// ---------------------------------------------------------------- categories

test('rules: a category side expands to the actives of that category in the routine', () => {
  const rules = [rule('r1', 'retinoid', 'aha')];
  assert.deepEqual(pairs(check(['retinol', 'glycolic-acid'], rules)), ['glycolic-acid+retinol']);
  assert.deepEqual(pairs(check(['retinol', 'retinal', 'glycolic-acid', 'lactic-acid'], rules)), [
    'glycolic-acid+retinal',
    'glycolic-acid+retinol',
    'lactic-acid+retinal',
    'lactic-acid+retinol',
  ]);
});

test('rules: a category can sit on either side of a rule', () => {
  const asA = check(['retinol', 'benzoyl-peroxide'], [rule('r1', 'retinoid', 'benzoyl-peroxide')]);
  const asB = check(['retinol', 'benzoyl-peroxide'], [rule('r1', 'benzoyl-peroxide', 'retinoid')]);
  assert.equal(asA.length, 1);
  assert.deepEqual(asA, asB);
});

test('rules: two categories give a warning for every cross pair', () => {
  const warnings = check(['glycolic-acid', 'lactic-acid', 'salicylic-acid'], [rule('r1', 'aha', 'bha')]);
  assert.deepEqual(pairs(warnings), ['glycolic-acid+salicylic-acid', 'lactic-acid+salicylic-acid']);
});

test('rules: a rule with the same category on both sides pairs different actives once', () => {
  const rules = [rule('r1', 'aha', 'aha')];
  assert.deepEqual(pairs(check(['glycolic-acid', 'lactic-acid'], rules)), ['glycolic-acid+lactic-acid']);
  assert.deepEqual(pairs(check(['lactic-acid', 'glycolic-acid'], rules)), ['glycolic-acid+lactic-acid']);
});

test('rules: there is never a warning for an active paired with itself', () => {
  assert.deepEqual(check(['glycolic-acid'], [rule('r1', 'aha', 'aha')]), []);
  assert.deepEqual(check(['retinol'], [rule('r1', 'retinol', 'retinol')]), []);
  assert.deepEqual(check(['retinol', 'niacinamide'], [rule('r1', 'retinol', 'retinoid')]), []);
});

test('rules: an active and its own category pair only with the other members', () => {
  const warnings = check(['retinol', 'retinal'], [rule('r1', 'retinol', 'retinoid')]);
  assert.deepEqual(pairs(warnings), ['retinal+retinol']);
});

test('rules: a side that is neither an active id nor a category matches nothing', () => {
  assert.deepEqual(check(['retinol', 'benzoyl-peroxide'], [rule('r1', 'retinol', 'no-such-category')]), []);
});

// ---------------------------------------------------------------- several rules, ordering

test('rules: a pair matched by several rules gives one warning, keeping the most severe', () => {
  const rules = [
    rule('general', 'retinoid', 'aha', 'caution'),
    rule('specific', 'retinol', 'glycolic-acid', 'avoid'),
  ];
  const warnings = check(['retinol', 'glycolic-acid'], rules);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].ruleId, 'specific');
  assert.equal(warnings[0].severity, 'avoid');
});

test('rules: when severities are equal the rule listed first wins', () => {
  const rules = [rule('first', 'retinoid', 'aha'), rule('second', 'retinol', 'glycolic-acid')];
  const warnings = check(['retinol', 'glycolic-acid'], rules);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].ruleId, 'first');
});

test('rules: warnings come out avoid first, then in rule order', () => {
  const rules = [
    rule('c1', 'retinol', 'benzoyl-peroxide', 'caution'),
    rule('a1', 'aha', 'bha', 'avoid'),
    rule('c2', 'retinol', 'glycolic-acid', 'caution'),
    rule('a2', 'l-ascorbic-acid', 'benzoyl-peroxide', 'avoid'),
  ];
  const ids = ['retinol', 'benzoyl-peroxide', 'glycolic-acid', 'salicylic-acid', 'l-ascorbic-acid'];
  assert.deepEqual(check(ids, rules).map((warning) => warning.ruleId), ['a1', 'a2', 'c1', 'c2']);
});

// ---------------------------------------------------------------- unsupported rules and robustness

test('rules: rules with another scope or an unknown severity are ignored', () => {
  const rules = [
    rule('wrong-scope', 'retinol', 'benzoyl-peroxide', 'caution', { scope: 'different-days' }),
    rule('wrong-severity', 'retinol', 'benzoyl-peroxide', 'panic'),
    rule('no-severity', 'retinol', 'benzoyl-peroxide', undefined, { severity: undefined }),
  ];
  assert.deepEqual(check(['retinol', 'benzoyl-peroxide'], rules), []);
});

test('rules: malformed entries in the rules list are skipped', () => {
  const rules = [null, 'retinol', 5, [], {}, rule('ok', 'retinol', 'benzoyl-peroxide')];
  assert.deepEqual(check(['retinol', 'benzoyl-peroxide'], rules).map((warning) => warning.ruleId), ['ok']);
});

test('rules: actives without a category can still be matched by id', () => {
  const sparse = [{ id: 'x' }, { id: 'y' }, null, 'junk'];
  const warnings = checkRoutine(['x', 'y'], sparse, [rule('r1', 'x', 'y')]);
  assert.equal(warnings.length, 1);
});

test('rules: does not change its inputs', () => {
  const ids = ['retinol', 'glycolic-acid', 'benzoyl-peroxide'];
  const rules = [rule('r1', 'retinoid', 'aha'), rule('r2', 'retinol', 'benzoyl-peroxide', 'avoid')];
  const copies = JSON.parse(JSON.stringify({ ids, actives, rules }));
  check(ids, rules);
  assert.deepEqual({ ids, actives, rules }, copies);
});
