// Checks one routine (all AM products, or all PM products) against the conflict rules.
// Pure function: no database, no Express, never changes its inputs.

const SUPPORTED_SCOPE = 'same-routine';
const SEVERITY_RANK = { avoid: 0, caution: 1 }; // lower number = more severe

function isUsableRule(rule) {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    rule.scope === SUPPORTED_SCOPE &&
    Object.hasOwn(SEVERITY_RANK, rule.severity) &&
    typeof rule.a === 'string' &&
    typeof rule.b === 'string'
  );
}

// activeIds: the active ids found in ONE routine. Unknown ids are ignored.
// actives:   the list from data/actives.json (needs id and category).
// rules:     the list from data/rules.json.
//
// A rule side is either an active id or a category. If it matches a known active id it means
// that active; otherwise it means every active of that category that is in the routine.
//
// Returns one warning per unordered pair of actives (a+b is the same as b+a), never a warning
// for an active paired with itself. If several rules match a pair, the most severe one wins
// (ties go to the rule listed first). The result order does not depend on the order of activeIds:
// "avoid" first, then rule order, then the pair.
function checkRoutine(activeIds, actives, rules) {
  if (!Array.isArray(activeIds) || !Array.isArray(actives) || !Array.isArray(rules)) return [];

  const byId = new Map();
  for (const active of actives) {
    if (active && typeof active.id === 'string' && !byId.has(active.id)) byId.set(active.id, active);
  }

  const present = [...new Set(activeIds.filter((id) => typeof id === 'string' && byId.has(id)))];
  if (present.length < 2) return [];

  const expand = (side) =>
    byId.has(side) ? present.filter((id) => id === side) : present.filter((id) => byId.get(id).category === side);

  const best = new Map(); // "idX|idY" -> { rank, index, warning }
  rules.forEach((rule, index) => {
    if (!isUsableRule(rule)) return;
    const rank = SEVERITY_RANK[rule.severity];
    const sideA = expand(rule.a);
    const sideB = expand(rule.b);

    for (const x of sideA) {
      for (const y of sideB) {
        if (x === y) continue;
        const pair = [x, y].sort();
        const key = pair.join('|');
        const current = best.get(key);
        if (current && (current.rank < rank || (current.rank === rank && current.index <= index))) continue;
        best.set(key, {
          rank,
          index,
          key,
          warning: {
            ruleId: rule.id,
            severity: rule.severity,
            scope: rule.scope,
            reason: rule.reason,
            sourceUrl: rule.sourceUrl,
            actives: pair,
          },
        });
      }
    }
  });

  return [...best.values()]
    .sort((p, q) => p.rank - q.rank || p.index - q.index || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))
    .map((entry) => entry.warning);
}

module.exports = { checkRoutine };
