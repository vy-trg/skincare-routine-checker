// Home page: sends the pasted list to POST /api/analyze and shows the known actives it finds,
// and filters the "Known Actives" panel. Plain JavaScript, no libraries. The pure parts (messages,
// filtering, link checks, timings) live in analyse-helpers.js and are tested in Node.
(function () {
  var H = window.AnalyseHelpers;
  var form = document.getElementById('analyse-form');
  if (!H || !form) return;

  var textarea = document.getElementById('ingredients');
  var button = document.getElementById('analyse-button');
  var errorBox = document.getElementById('analyse-error');
  var results = document.getElementById('results');
  var summary = document.getElementById('results-summary');
  var truncatedBox = document.getElementById('results-truncated');
  var emptyBox = document.getElementById('results-empty');
  var skeleton = document.getElementById('results-skeleton');
  var list = document.getElementById('results-list');
  var chips = document.getElementById('results-chips');
  var next = document.getElementById('results-next'); // only on the page for logged-in people
  var live = document.getElementById('status-live');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var knownActives = [];
  try {
    knownActives = JSON.parse(document.getElementById('actives-data').textContent);
  } catch (e) {
    knownActives = [];
  }
  var knownCategories = H.knownCategories(knownActives); // the categories that have a colour

  var BUTTON_LABEL = button.textContent;
  var busy = false;
  var controller = null;

  // ------------------------------------------------------------ analysing

  function setBusy(isBusy) {
    busy = isBusy;
    // aria-busy and a text change instead of disabling: a disabled button would drop keyboard focus.
    button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    button.classList.toggle('is-busy', isBusy);
    button.textContent = isBusy ? 'Analysing…' : BUTTON_LABEL;
  }

  function showError(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    textarea.setAttribute('aria-invalid', field ? 'true' : 'false');
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    textarea.removeAttribute('aria-invalid');
  }

  function resetResults() {
    list.textContent = '';
    chips.textContent = '';
    chips.hidden = true;
    summary.hidden = true;
    truncatedBox.hidden = true;
    emptyBox.hidden = true;
    skeleton.hidden = true;
    if (next) next.hidden = true;
  }

  function showSkeleton() {
    resetResults();
    results.hidden = false;
    skeleton.hidden = false;
  }

  function fail(message) {
    resetResults();
    results.hidden = true;
    showError(message);
  }

  function showResults(data) {
    resetResults();
    results.hidden = false;
    var actives = data.actives;

    if (actives.length === 0) {
      emptyBox.textContent = H.emptyMessage(knownActives.length);
      emptyBox.hidden = false;
      live.textContent = 'No known actives found.';
    } else {
      summary.textContent = H.resultsSummary(actives.length);
      summary.hidden = false;
      live.textContent = summary.textContent;
      actives.forEach(function (active, index) {
        var item = el('li');
        item.appendChild(chip(active.name, active.category));
        chips.appendChild(item);
        list.appendChild(buildRow(active, index));
      });
      chips.hidden = false;
      if (next) next.hidden = false;
    }

    if (data.truncated === true) {
      truncatedBox.textContent = H.TRUNCATED_MESSAGE;
      truncatedBox.hidden = false;
    }

    // On a narrow screen the results can start below the fold: bring them into view.
    if (results.getBoundingClientRect().top > window.innerHeight * 0.6) {
      results.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  async function analyse(text) {
    if (controller) controller.abort();
    var mine = new AbortController();
    controller = mine;

    clearError();
    setBusy(true);
    showSkeleton();

    try {
      var response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text }),
        signal: mine.signal,
      });

      var data = null;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }

      if (!response.ok) return fail(H.errorMessage('http', response.status));
      if (!data || !Array.isArray(data.actives)) return fail(H.errorMessage('parse'));
      showResults(data);
    } catch (err) {
      if (err && err.name === 'AbortError') return; // replaced by a newer request
      fail(H.errorMessage('network'));
    } finally {
      if (controller === mine) {
        controller = null;
        setBusy(false);
      }
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;
    if (textarea.value.trim() === '') {
      resetResults();
      results.hidden = true;
      showError(H.errorMessage('empty'), true);
      textarea.focus();
      return;
    }
    analyse(textarea.value); // the text stays in the box whatever happens
  });

  textarea.addEventListener('input', function () {
    if (!errorBox.hidden) clearError();
  });

  // ------------------------------------------------------------ result rows

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A category chip, coloured through data-category (the colour map is in style.css). Text only.
  function chip(text, category) {
    var node = el('span', 'chip', text);
    var key = H.categoryKey(category, knownCategories);
    if (key) node.dataset.category = key;
    return node;
  }

  // One <details> per active. Everything is added with textContent, never as HTML.
  function buildRow(active, index) {
    var row = el('li', 'active');
    row.style.setProperty('--delay', H.staggerDelay(index) + 'ms');

    var details = el('details', 'active__details');
    details.dataset.open = 'false';

    var head = el('summary', 'active__head');
    head.appendChild(el('span', 'active__name', active.name));
    head.appendChild(chip(H.categoryLabel(active.category), active.category));
    head.appendChild(el('span', 'active__chevron'));
    details.appendChild(head);

    var body = el('div', 'active__body');
    body.appendChild(el('p', 'active__summary', active.summary));
    var href = H.safeHref(active.sourceUrl);
    if (href) {
      var link = el('a', 'active__source', 'Source');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Source for ' + active.name + ' (opens in a new tab)');
      body.appendChild(link);
    }
    details.appendChild(body);

    row.appendChild(details);
    enhanceAccordion(details, head);
    return row;
  }

  // ------------------------------------------------------------ accordion motion
  // Without JavaScript, or with reduced motion, <details> simply opens and closes instantly.
  // Otherwise the height is animated: ease-out, 200ms to open, 160ms (20% faster) to close, no bounce.
  // Enter and Space on the summary fire a click, so the keyboard goes through here too.

  function enhanceAccordion(details, head) {
    var animation = null;
    var opening = false;
    var closing = false;

    function finish(open) {
      details.open = open;
      details.dataset.open = open ? 'true' : 'false';
      details.style.height = '';
      details.style.overflow = '';
      animation = null;
      opening = false;
      closing = false;
    }

    function run(open) {
      // Start from the height it has right now, so a click in the middle of an animation reverses smoothly.
      var start = details.getBoundingClientRect().height;
      if (animation) animation.cancel();

      details.style.overflow = 'hidden';
      details.style.height = start + 'px';
      details.dataset.open = open ? 'true' : 'false';
      if (open) details.open = true;
      var end = open ? details.scrollHeight : head.offsetHeight;

      opening = open;
      closing = !open;
      animation = details.animate(
        { height: [start + 'px', end + 'px'] },
        { duration: H.accordionDuration(open), easing: 'ease-out' },
      );
      var mine = animation;
      mine.onfinish = function () {
        if (animation === mine) finish(open);
      };
    }

    head.addEventListener('click', function (event) {
      if (reduceMotion.matches || typeof details.animate !== 'function') return; // native, instant
      event.preventDefault();
      run(closing || !details.open);
    });

    // Keeps the chevron right when the browser toggles it by itself (reduced motion, find in page).
    details.addEventListener('toggle', function () {
      if (!animation) details.dataset.open = details.open ? 'true' : 'false';
    });
  }

  // ------------------------------------------------------------ Known Actives panel

  var search = document.getElementById('known-search');
  var knownList = document.getElementById('known-list');
  var knownStatus = document.getElementById('known-status');

  if (search && knownList && knownStatus) {
    var rows = {};
    Array.prototype.forEach.call(knownList.children, function (item) {
      rows[item.getAttribute('data-id')] = item;
    });

    search.addEventListener('input', function () {
      var matches = H.filterActives(knownActives, search.value);
      var shown = {};
      matches.forEach(function (active) {
        shown[active.id] = true;
      });
      Object.keys(rows).forEach(function (id) {
        rows[id].hidden = !shown[id];
      });
      knownStatus.textContent = H.filterStatus(matches.length, knownActives.length, search.value);
      knownList.scrollTop = 0;
    });
  }
})();
