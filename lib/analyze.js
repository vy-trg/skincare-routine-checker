// Logic behind POST /api/analyze, kept free of Express so it can be unit tested.
const defaultActives = require('../data/actives.json');
const { MAX_INPUT_LENGTH, findActives, findActiveSpans } = require('./ingredients');
const { sourceName } = require('./sources');

// The fields of an active that the API shows. inciAliases stays internal.
// sourceName is the publisher to show next to the link (null when there is no source).
function publicActive({ id, name, category, summary, sourceUrl }) {
  return { id, name, category, summary, sourceUrl, sourceName: sourceName(sourceUrl) };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// body: the parsed JSON request body, expected to look like { "text": "Aqua, Niacinamide" }.
// Returns { status, body } for the route to send as JSON.
function analyzeRequest(body, actives = defaultActives) {
  if (!isPlainObject(body) || typeof body.text !== 'string') {
    return { status: 400, body: { error: 'Send JSON like {"text": "Aqua, Niacinamide, Glycerin"}.' } };
  }

  // spans: where each recognised item sits in body.text (UTF-16 indexes), so the page can mark them.
  const response = {
    actives: findActives(body.text, actives).map(publicActive),
    spans: findActiveSpans(body.text, actives).map(({ start, end, id }) => ({ start, end, id })),
  };

  // Only the first MAX_INPUT_LENGTH characters are read. Say so, so a caller
  // never mistakes "nothing found" for "nothing in the cut-off part".
  if (body.text.length > MAX_INPUT_LENGTH) response.truncated = true;

  return { status: 200, body: response };
}

module.exports = { analyzeRequest };
