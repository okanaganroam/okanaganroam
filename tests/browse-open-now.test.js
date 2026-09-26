// /browse filters vs the Open Now script (2026-09-26).
//
// Regression for the P0 where /browse search and filters updated the count
// but never hid a card: app.js's applyFilters() hides non-matching cards and
// then writes #resultsCount; that write fired the Open Now script's
// MutationObserver, whose apply() set display = '' on every card while Open
// Now was off -- so all 1,411 cards came back.
//
// PURE test: renderOpenNowScript() is read out of server.js's source and
// evaluated (no require of server.js, so no database), then its browser
// script runs in a small mock DOM that reproduces the real sequence:
// applyFilters() writes inline display, writes the count (a DOM mutation),
// the observer schedules apply() on the next animation frame.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const renderOpenNowScript = (() => {
  const start = SRC.indexOf('function renderOpenNowScript(opts)');
  const end = SRC.indexOf('\nfunction renderHiddenElementsScript');
  assert.ok(start !== -1 && end > start, 'renderOpenNowScript must exist in server.js');
  return new Function(`${SRC.slice(start, end)}; return renderOpenNowScript;`)();
})();

// The homepage's copy of the script, byte-for-byte as it was before this fix
// (the homepage is frozen; it has no venue cards, so the fix is /browse-only).
const HOMEPAGE_SCRIPT_SHA256 = 'fa4111d71249c56e59a26760dd32305c74bc10a1f0299aed4f7302170ec87136';

// ---- a mock /browse page ------------------------------------------------------
// venues: [{ name, region, type, open }]. filter: the app.js applyFilters()
// stand-in -- same contract as the real one: owns each card's inline
// display, then writes the count (which mutates the DOM).
function mockBrowse(venues) {
  const observers = [];
  let frames = [];
  const mutate = () => observers.forEach((cb) => cb([]));
  const cards = venues.map((v) => ({
    dataset: { name: v.name, region: v.region, type: v.type },
    style: { display: '' },
    querySelector: (sel) => (sel === '.open-status-open' && v.open ? {} : null),
  }));
  let button = null;
  const countEl = { text: '' };
  const document = {
    querySelectorAll: (sel) => (sel === '.venue-card' ? cards : []),
    querySelector: (sel) => (sel === '.og-open-now-btn' ? button : null),
    createElement: () => {
      const listeners = {};
      const el = {
        style: {}, attrs: {},
        setAttribute(k, val) { this.attrs[k] = val; },
        addEventListener(t, fn) { listeners[t] = fn; },
        click() { listeners.click(); },
      };
      return el;
    },
    body: {
      appendChild(el) { button = el; mutate(); },
      classList: { add() {}, remove() {} },
    },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    scrollY: 0,
  };
  const context = {
    document, window,
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe() { observers.push(this.cb); } },
    requestAnimationFrame: (fn) => { frames.push(fn); },
  };
  const page = {
    cards, countEl,
    predicate: () => true,
    // app.js applyFilters(): inline display on every card, then the count.
    applyFilters() {
      let visible = 0;
      cards.forEach((c, i) => {
        const show = page.predicate(venues[i]);
        c.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      countEl.text = `${visible} places to explore`;
      mutate(); // writing #resultsCount is a DOM mutation
    },
    flush() { // run queued animation frames until the page settles
      for (let n = 0; n < 10 && frames.length; n++) { const f = frames; frames = []; f.forEach((fn) => fn()); }
    },
    visibleNames: () => venues.filter((v, i) => cards[i].style.display !== 'none').map((v) => v.name),
    countNumber: () => Number(countEl.text.split(' ')[0]),
    toggleOpenNow() { button.click(); page.flush(); },
    setFilter(pred) { page.predicate = pred; page.applyFilters(); page.flush(); },
  };
  window.__applyFilters = () => page.applyFilters();
  return { page, context };
}

function runScript(script, context) {
  const js = script.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
  vm.runInNewContext(`var window = this.window; ${js}`, context);
}

const VENUES = [
  { name: 'Kelowna Sushi', region: 'kelowna', type: 'restaurant', open: true },
  { name: 'Kelowna Cafe', region: 'kelowna', type: 'cafe', open: false },
  { name: 'Penticton Sushi', region: 'penticton', type: 'restaurant', open: false },
  { name: 'Penticton Cafe', region: 'penticton', type: 'cafe', open: true },
  { name: 'Vernon Winery', region: 'vernon', type: 'winery', open: true },
];
function browse() {
  const { page, context } = mockBrowse(VENUES);
  runScript(renderOpenNowScript(), context);
  page.flush();
  page.applyFilters();
  page.flush();
  return page;
}

test('/browse: an active filter really hides non-matching cards (the count write no longer brings them back)', () => {
  const page = browse();
  assert.equal(page.visibleNames().length, 5, 'no filter: every card visible');
  page.setFilter((v) => v.region === 'kelowna');
  assert.deepEqual(page.visibleNames(), ['Kelowna Sushi', 'Kelowna Cafe']);
  assert.equal(page.countNumber(), page.visibleNames().length, 'count matches the visible cards');
});

test('/browse: multiple filters combine, and search narrows further', () => {
  const page = browse();
  page.setFilter((v) => ['kelowna', 'penticton'].includes(v.region)); // two regions
  assert.deepEqual(page.visibleNames(), ['Kelowna Sushi', 'Kelowna Cafe', 'Penticton Sushi', 'Penticton Cafe']);
  page.setFilter((v) => ['kelowna', 'penticton'].includes(v.region) && v.type === 'restaurant'); // + a type
  assert.deepEqual(page.visibleNames(), ['Kelowna Sushi', 'Penticton Sushi']);
  page.setFilter((v) => v.type === 'restaurant' && /sushi/i.test(v.name) && v.region === 'penticton'); // + search
  assert.deepEqual(page.visibleNames(), ['Penticton Sushi']);
  assert.equal(page.countNumber(), 1);
  page.setFilter(() => false); // zero results
  assert.deepEqual(page.visibleNames(), []);
  assert.equal(page.countNumber(), 0, '"0 places" is shown above an empty grid, not a full one');
});

test('/browse: clearing filters restores every card', () => {
  const page = browse();
  page.setFilter((v) => v.type === 'cafe');
  assert.equal(page.visibleNames().length, 2);
  page.setFilter(() => true);
  assert.equal(page.visibleNames().length, 5);
  assert.equal(page.countNumber(), 5);
});

test('/browse: Open Now hides closed cards only among the filtered ones, and never un-hides a filtered-out card', () => {
  const page = browse();
  page.setFilter((v) => v.region === 'kelowna');
  page.toggleOpenNow(); // on
  assert.deepEqual(page.visibleNames(), ['Kelowna Sushi'], 'the closed Kelowna cafe is hidden; nothing outside Kelowna appears');
  // A filter change while Open Now is on: the filter re-applies, then Open Now re-hides closed cards.
  page.setFilter((v) => v.region === 'penticton');
  assert.deepEqual(page.visibleNames(), ['Penticton Cafe']);
  page.toggleOpenNow(); // off: the filter's own result comes back, not every card
  assert.deepEqual(page.visibleNames(), ['Penticton Sushi', 'Penticton Cafe']);
  assert.equal(page.countNumber(), page.visibleNames().length);
});

test('/browse: repeated DOM mutations (count rewrites, "Read more" buttons) leave the filtered result alone', () => {
  const page = browse();
  page.setFilter((v) => v.type === 'winery');
  for (let i = 0; i < 5; i++) { page.countEl.text = '1 places to explore'; page.flush(); }
  assert.deepEqual(page.visibleNames(), ['Vernon Winery']);
});

test('/browse: the pre-fix script reproduces the bug (guards the test itself)', () => {
  // The homepage copy is the untouched pre-fix apply(); on a page with cards
  // it shows exactly the reported symptom.
  const { page, context } = mockBrowse(VENUES);
  runScript(renderOpenNowScript({ showButton: false }), context);
  page.flush();
  page.setFilter((v) => v.region === 'kelowna');
  assert.equal(page.countNumber(), 2, 'the count says 2');
  assert.equal(page.visibleNames().length, 5, 'but all 5 cards are visible again');
});

test('homepage: its Open Now script is byte-identical to before the /browse fix', () => {
  const homepage = renderOpenNowScript({ showButton: false });
  assert.equal(crypto.createHash('sha256').update(homepage).digest('hex'), HOMEPAGE_SCRIPT_SHA256);
  assert.match(homepage, /var SHOW_OPEN_NOW_BUTTON = false;/);
  assert.doesNotMatch(homepage, /refilter/);
  const browseScript = renderOpenNowScript();
  assert.match(browseScript, /var SHOW_OPEN_NOW_BUTTON = true;/);
  assert.match(browseScript, /function refilter\(\)/);
  assert.match(browseScript, /window\.__applyFilters/);
});
