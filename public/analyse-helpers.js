// Pure helpers for the home page. No DOM, no network, no database.
// This one file runs in the browser (it sets window.AnalyseHelpers) and in Node (module.exports),
// so the tests in lib/analyse-helpers.test.js exercise the very code the page uses.
// Everything in public/ is served to anyone, so keep tests and secrets out of this folder.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AnalyseHelpers = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var OPEN_MS = 200; // accordion opens with ease-out
  var CLOSE_MS = 160; // closing is 20% faster than opening
  var STAGGER_MS = 30; // delay between result rows
  var STAGGER_MAX_ROWS = 12; // later rows appear together so a long list never makes people wait

  var CATEGORY_LABELS = {
    aha: 'AHA',
    bha: 'BHA',
    pha: 'PHA',
    'vitamin-c': 'Vitamin C',
    'benzoyl-peroxide': 'Benzoyl Peroxide',
    'hydration-and-barrier': 'Hydration and Barrier',
  };

  // "vitamin-c" -> "Vitamin C", "aha" -> "AHA", unknown "some-new-one" -> "Some New One".
  function categoryLabel(id) {
    if (typeof id !== 'string' || id === '') return '';
    if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, id)) return CATEGORY_LABELS[id];
    return id
      .split('-')
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  // Lowercase, and treat hyphens (including Unicode dashes) and runs of spaces as one space,
  // like the server does when it matches ingredient names.
  function normalize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[\s\-‐-―−]+/g, ' ')
      .trim();
  }

  // Which known actives match what the person typed? Every word typed must appear somewhere in
  // the active's name, INCI aliases, id or category label, in any order. An empty query keeps
  // everything. Returns a new array of the same objects, in the original order; never changes input.
  function filterActives(actives, query) {
    if (!Array.isArray(actives)) return [];
    var words = normalize(typeof query === 'string' ? query : '')
      .split(' ')
      .filter(Boolean);
    if (words.length === 0) return actives.slice();

    return actives.filter(function (active) {
      if (typeof active !== 'object' || active === null) return false;
      var aliases = Array.isArray(active.inciAliases) ? active.inciAliases : [];
      var haystack = normalize(
        [active.name, active.id, categoryLabel(active.category), active.category]
          .concat(aliases)
          .filter(function (part) {
            return typeof part === 'string';
          })
          .join(' '),
      );
      return words.every(function (word) {
        return haystack.indexOf(word) !== -1;
      });
    });
  }

  // "Showing 3 of 28 known actives" / "No known actives match "xyz"." (the page shows it under the search box)
  function filterStatus(shown, total, query) {
    var typed = typeof query === 'string' ? query.trim() : '';
    if (shown === 0 && typed !== '') {
      return 'No known actives match "' + typed + '". Try a shorter name, such as "retin" or "acid".';
    }
    if (typed === '' || shown === total) {
      return total + ' known actives';
    }
    return 'Showing ' + shown + ' of ' + total + ' known actives';
  }

  function resultsSummary(count) {
    return count === 1 ? 'Found 1 known active.' : 'Found ' + count + ' known actives.';
  }

  function emptyMessage(totalKnown) {
    return (
      'No known actives found. We currently recognise ' +
      totalKnown +
      " actives, so this doesn't mean the product has none. " +
      'Check that you pasted the full ingredient list, separated by commas.'
    );
  }

  var TRUNCATED_MESSAGE =
    'Only the first 5,000 characters were checked. Paste the rest in a second pass to check it too.';

  // Messages for everything that can go wrong. Each one says what happened without blaming the
  // person, how to fix it, and that the pasted text is still there.
  // kind: 'empty' | 'network' | 'http' (with status) | 'parse'
  function errorMessage(kind, status) {
    if (kind === 'empty') {
      return 'Paste an ingredient list first, then press Analyse Ingredients.';
    }
    if (kind === 'network') {
      return "We couldn't reach the server. Check your connection and try again. Your list is still here.";
    }
    if (kind === 'http' && status === 413) {
      return 'That list is too large to send. Paste just the ingredient list from the label and try again. Your text is still here.';
    }
    if (kind === 'http' && status === 400) {
      return "We couldn't read that list. Paste it as plain text and try again. Your text is still here.";
    }
    return 'Something went wrong on our side. Please try again in a moment. Your list is still here.';
  }

  // Only https links are put on the page (the Source links).
  function safeHref(url) {
    if (typeof url !== 'string' || url.indexOf('https://') !== 0) return null;
    try {
      return new URL(url).href;
    } catch (e) {
      return null;
    }
  }

  function accordionDuration(opening) {
    return opening ? OPEN_MS : CLOSE_MS;
  }

  // Delay in ms before result row `index` (0-based) appears.
  function staggerDelay(index) {
    if (typeof index !== 'number' || !(index >= 0)) return 0;
    return Math.min(Math.floor(index), STAGGER_MAX_ROWS) * STAGGER_MS;
  }

  return {
    OPEN_MS: OPEN_MS,
    CLOSE_MS: CLOSE_MS,
    STAGGER_MS: STAGGER_MS,
    STAGGER_MAX_ROWS: STAGGER_MAX_ROWS,
    TRUNCATED_MESSAGE: TRUNCATED_MESSAGE,
    categoryLabel: categoryLabel,
    filterActives: filterActives,
    filterStatus: filterStatus,
    resultsSummary: resultsSummary,
    emptyMessage: emptyMessage,
    errorMessage: errorMessage,
    safeHref: safeHref,
    accordionDuration: accordionDuration,
    staggerDelay: staggerDelay,
  };
});
