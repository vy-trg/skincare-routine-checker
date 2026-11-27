// Everything the routine page shows, worked out in one pure function (no database, no Express), so the
// wording and the edge cases can be tested. routes/routines.js fetches the rows; the view only prints.
const defaultActives = require('../data/actives.json');
const defaultRules = require('../data/rules.json');
const { summarizeRoutine } = require('./routine-summary');

const PERIODS = ['am', 'pm'];
const LABELS = { am: 'Morning Routine', pm: 'Evening Routine' };
const SHORT_LABELS = { am: 'AM', pm: 'PM' };

// General advice, not a rule from a source: it is worded as a common precaution on purpose.
const PRECAUTION_LINE = 'A common precaution: patch test changes and introduce one product at a time.';
const SEVERITY_LABELS = { avoid: 'Avoid Together', caution: 'Use With Care' };

const plural = (n, one, many) => (n === 1 ? one : many);

// What the conflict area of one routine shows.
//   'conflicts'          -> warnings are listed
//   'clear'              -> the calm "no conflicts" card (only when there were pairs to compare)
//   'nothing-to-compare' -> no claim is made: the routine is empty, or has fewer than two known actives
function conflictArea({ productCount, activeCount, warnings, knownCount, ruleCount }) {
  if (warnings.length > 0) return { status: 'conflicts' };
  if (productCount === 0) {
    return { status: 'nothing-to-compare', message: 'Add products to this routine to check them for conflicts.' };
  }
  if (activeCount < 2) {
    const message = activeCount === 0
      ? 'No known actives were found in these products, so there is nothing to compare yet.'
      : 'Only one known active was found in this routine, so there is nothing to compare yet.';
    return { status: 'nothing-to-compare', message };
  }
  return {
    status: 'clear',
    heading: `No conflicts found among the ${knownCount} actives we know`,
    checks: [
      `${activeCount} known actives in this routine were checked`,
      `Every pair was compared with our ${ruleCount} sourced conflict ${plural(ruleCount, 'rule', 'rules')}`,
      'Morning and evening routines are checked separately',
    ],
    reminder: 'No warning does not mean this routine suits you. We only know a limited set of actives and rules.',
  };
}

// rowsByPeriod: { am: [rows], pm: [rows] } as returned by the routine store (id, name, ingredients_raw).
// allProducts: every product of the user ({ id, name }). period: 'am' or 'pm', the one in the URL.
function buildRoutinePage({ period, rowsByPeriod, allProducts, actives = defaultActives, rules = defaultRules }) {
  const knownCount = actives.length;
  const ruleCount = rules.filter((rule) => rule && rule.scope === 'same-routine').length;
  const everyProduct = Array.isArray(allProducts) ? allProducts : [];

  const panels = PERIODS.map((p) => {
    const rows = Array.isArray(rowsByPeriod && rowsByPeriod[p]) ? rowsByPeriod[p] : [];
    const summary = summarizeRoutine(rows, actives, rules);
    const used = new Set(rows.map((row) => row.id));

    const warnings = summary.warnings.map((warning) => ({
      severity: warning.severity,
      level: SEVERITY_LABELS[warning.severity] || SEVERITY_LABELS.caution,
      title: `${warning.details[0].name} with ${warning.details[1].name}`,
      reason: warning.reason,
      sourceUrl: warning.sourceUrl,
      inSameProduct: warning.inSameProduct,
    }));

    return {
      period: p,
      label: LABELS[p],
      shortLabel: SHORT_LABELS[p],
      isCurrent: p === period,
      items: summary.products.map((item, index) => ({ ...item, step: index + 1 })),
      available: everyProduct.filter((row) => !used.has(row.id)).map((row) => ({ id: row.id, name: row.name })),
      hasAnyProduct: everyProduct.length > 0,
      warnings,
      precaution: warnings.length > 0 ? PRECAUTION_LINE : null,
      conflicts: conflictArea({
        productCount: summary.products.length,
        activeCount: summary.actives.length,
        warnings,
        knownCount,
        ruleCount,
      }),
    };
  });

  return { period, panels, knownCount, ruleCount };
}

module.exports = { PERIODS, LABELS, SHORT_LABELS, PRECAUTION_LINE, SEVERITY_LABELS, conflictArea, buildRoutinePage };
