// P-001 (2026-09-26): the full venue list (/api/venues?limit=5000, ~2 MB) is
// fetched only by pages that render it -- the /browse results grid
// (#venueGrid). Every other page that loads app.js (the homepage, the hubs,
// themed venue pages, /trip, the 404) skips the download, while the init
// blocks (header menu, Trip tray, Favorite / Add to Trip wiring, ...) still
// run on every page, after the document is parsed.
//
// PURE test: the real public/scripts/app.js runs in a vm against a small,
// permissive mock DOM; fetch, timers, scrolling and element lookups are
// recorded. No server, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const VENUES_URL = /\/api\/venues\?limit=5000$/;

// A value that tolerates any property access or call (inert DOM nodes).
function inert() {
  const fn = function () { return inert(); };
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;
      if (prop === 'length') return 0;
      if (prop === 'forEach' || prop === 'map' || prop === 'filter') return () => [];
      if (prop === 'textContent' || prop === 'innerHTML' || prop === 'value' || prop === 'className' || prop === 'id') return '';
      if (prop === 'dataset' || prop === 'style') return {};
      if (prop === 'classList') return { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } };
      if (prop === 'getAttribute') return () => null;
      if (prop === 'getBoundingClientRect') return () => ({ top: 0, left: 0, width: 0, height: 0 });
      return inert();
    },
    set() { return true; },
    apply() { return inert(); },
  });
}

// Load app.js on a page described by `ids` (element ids present on it).
function loadPage({ ids = [], readyState = 'loading' } = {}) {
  const present = new Set(ids);
  const lookups = [];
  const fetches = [];
  const docListeners = {};
  const intervals = [];
  const scrolls = [];
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const el = inert();
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const document = {
    readyState,
    getElementById(id) { lookups.push(id); return present.has(id) ? element(id) : null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
    createElement() { return inert(); },
    documentElement: inert(),
    body: inert(),
    head: inert(),
    title: '',
    cookie: '',
  };
  const storage = new Map();
  const context = {
    document,
    console: { log() {}, warn() {}, error() {} },
    fetch(url) { fetches.push(String(url)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ venues: [] }) }); },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: 'en', userAgent: 'test' },
    location: { search: '', pathname: '/', hash: '', href: 'http://localhost/' },
    history: { pushState() {}, replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn) => { return 0; },
    clearTimeout() {},
    setInterval: (fn, ms) => { intervals.push(ms); return intervals.length; },
    clearInterval() {},
    requestAnimationFrame: () => 0,
    scrollTo: (opts) => { scrolls.push(opts); },
    scrollY: 0,
    innerWidth: 1280,
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type) { this.type = type; } },
    URLSearchParams,
    Promise, JSON, Math, Date, Array, Object, String, Number, Set, Map, RegExp, Error, encodeURIComponent, parseInt, parseFloat, isNaN,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(APP_JS, context, { filename: 'app.js' });
  const settle = () => new Promise((r) => setImmediate(r));
  return {
    context, lookups, fetches, intervals, scrolls, docListeners,
    async domReady() { (docListeners.DOMContentLoaded || []).forEach((fn) => fn()); await settle(); await settle(); },
    settle,
  };
}
const venueFetches = (page) => page.fetches.filter((u) => VENUES_URL.test(u)).length;
// initBlock3 (the mobile header menu) runs on every page and looks up #navHamburger.
const initBlocksRan = (page) => page.lookups.includes('navHamburger');

test('/browse (#venueGrid present): the full venue list is fetched exactly once, then the init blocks run', async () => {
  const page = loadPage({ ids: ['venueGrid'] });
  await page.settle(); await page.settle();
  assert.equal(venueFetches(page), 1);
  assert.ok(initBlocksRan(page), 'init blocks run after the fetch');
  assert.ok(Array.isArray(page.context.__allVenues), 'window.__allVenues is populated for /browse search, map and language switching');
});

test('pages without #venueGrid (homepage, hubs, venue pages, /trip, 404): no venue-list download', async () => {
  const page = loadPage({ ids: ['navHamburger', 'navLinks'] });
  await page.settle();
  assert.equal(page.fetches.length, 0, 'nothing is fetched while the document is still loading');
  await page.domReady();
  assert.equal(venueFetches(page), 0, 'the ~2 MB venue list is never requested');
  assert.equal(page.context.__allVenues, undefined);
});

test('pages without #venueGrid: the init blocks still run, after the document is parsed (same script order as before)', async () => {
  const page = loadPage({ ids: ['navHamburger', 'navLinks'] });
  await page.settle();
  assert.ok(!initBlocksRan(page), 'not before DOMContentLoaded -- later inline page scripts run first, as they did while the fetch was in flight');
  await page.domReady();
  assert.ok(initBlocksRan(page), 'the header menu, Trip tray, Favorite / Add to Trip wiring etc. are initialised');
});

test('pages without #venueGrid, script run after parsing: the init blocks still run (asynchronously)', async () => {
  const page = loadPage({ ids: ['navHamburger'], readyState: 'complete' });
  assert.ok(!initBlocksRan(page), 'deferred to a microtask, never synchronously inside the script');
  await page.settle();
  assert.ok(initBlocksRan(page));
  assert.equal(venueFetches(page), 0);
});

test('in-page anchor links: scroll at once where there is no venue grid; /browse still waits for its grid to load', async () => {
  const click = (page, id) => {
    const link = { getAttribute: () => `#${id}` };
    const evt = { target: { closest: (sel) => (sel === 'a[href^="#"]' ? link : null) }, preventDefault() {} };
    (page.docListeners.click || []).forEach((fn) => fn(evt));
  };
  const home = loadPage({ ids: ['moodCards'] });
  await home.domReady();
  click(home, 'moodCards');
  assert.equal(home.scrolls.length, 1, 'scrolls immediately -- no 4 s wait for a download that no longer happens');
  assert.ok(!home.intervals.includes(100), 'no polling for venue data');

  const browse = loadPage({ ids: ['venueGrid', 'list-venue'] });
  click(browse, 'list-venue'); // before the grid has loaded
  assert.equal(browse.scrolls.length, 0, '/browse keeps waiting while its grid loads (unchanged)');
  assert.ok(browse.intervals.includes(100));
});

test('the spotlight banner fetch stays gated on #spotlightBanner (present on no page)', async () => {
  const page = loadPage({ ids: [] });
  await page.domReady();
  assert.equal(venueFetches(page), 0);
});
