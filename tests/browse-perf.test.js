// /browse interaction performance (2026-10-03): behaviour-identical changes to
// public/scripts/app.js, each checked against the code it replaced.
//
// PURE tests: the real functions are sliced out of app.js and run in a vm
// context next to a verbatim copy of the previous implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const slice = (start, end) => {
  const a = APP_JS.indexOf(start), b = APP_JS.indexOf(end, a);
  assert.ok(a !== -1 && b !== -1, `app.js still contains ${start} ... ${end}`);
  return APP_JS.slice(a, b);
};

// ---- F4a: one Intl.DateTimeFormat for computeOpenStatus ----------------------
// computeOpenStatus() ran once per card and built a new formatter each time
// (about a quarter of the /browse initial render). The formatter's options
// never change, so it is now created once; every result must be unchanged.

const OPEN_STATUS_JS = slice('var DAY_ORDER = ', 'var CARD_REGION_LABEL = ');

// The previous computeOpenStatus, verbatim (it shares DAY_ORDER and
// checkHoursWindow with the new one).
const PREVIOUS_COMPUTE_OPEN_STATUS = `function previousComputeOpenStatus(hoursJson, testDate){
  if (!hoursJson) return null;
  var hours;
  try { hours = JSON.parse(hoursJson); } catch (e) { return null; }

  var now = testDate || new Date();
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);

  var map = {};
  parts.forEach(function(p){ map[p.type] = p.value; });

  var dayMap = { 'Mon':'mon','Tue':'tue','Wed':'wed','Thu':'thu','Fri':'fri','Sat':'sat','Sun':'sun' };
  var dayKey = dayMap[map.weekday];
  var yesterdayKey = DAY_ORDER[(DAY_ORDER.indexOf(dayKey) + 6) % 7];
  var hourNum = parseInt(map.hour) === 24 ? 0 : parseInt(map.hour);
  var currentMinutes = hourNum * 60 + parseInt(map.minute);

  var yesterdayWindows = hours[yesterdayKey];
  if (yesterdayWindows) {
    for (var j = 0; j < yesterdayWindows.length; j++) {
      var resultY = checkHoursWindow(yesterdayWindows[j][0], yesterdayWindows[j][1], currentMinutes, true);
      if (resultY) return resultY;
    }
  }

  var todayWindows = hours[dayKey];
  if (todayWindows) {
    for (var i = 0; i < todayWindows.length; i++) {
      var result = checkHoursWindow(todayWindows[i][0], todayWindows[i][1], currentMinutes, false);
      if (result) return result;
    }
  }
  return 'closed';
}`;

function openStatusContext() {
  const counter = { constructed: 0 };
  // Intl with a counting DateTimeFormat; everything else is the real Intl.
  const CountingDTF = function (...args) { counter.constructed++; return new Intl.DateTimeFormat(...args); };
  const ctx = vm.createContext({ Intl: Object.assign(Object.create(Intl), { DateTimeFormat: CountingDTF }), Date, JSON, parseInt });
  vm.runInContext(`${OPEN_STATUS_JS}\n${PREVIOUS_COMPUTE_OPEN_STATUS}`, ctx);
  return { ctx, counter };
}

const week = (spec) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, spec(d)])));
const HOURS = [
  week(() => [['08:00', '21:00']]),
  week(() => [['9:00', '17:00']]),
  week((d) => (d === 'mon' ? [] : [['11:30', '14:00'], ['17:00', '22:00']])),
  week(() => [['18:00', '02:00']]),
  week((d) => (d === 'fri' || d === 'sat' ? [['20:00', '00:00']] : [['11:00', '23:00']])),
  week(() => [['00:00', '24:00']]),
  week((d) => (d === 'sun' ? [['10:00', '01:30']] : [['06:00', '10:00'], ['16:00', '03:00']])),
  JSON.stringify({ tue: [['12:00', '13:00']] }),
  JSON.stringify({}),
  week(() => []),
];
// Every 7 minutes over three windows: both 2026 daylight-saving changes in
// Vancouver (Mar 8 and Nov 1) and an ordinary week.
const DATES = [];
for (const [from, days] of [['2026-03-06T00:00:00Z', 4], ['2026-10-30T00:00:00Z', 4], ['2026-06-15T00:00:00Z', 7]]) {
  for (let t = Date.parse(from), end = t + days * 864e5; t < end; t += 7 * 6e4) DATES.push(new Date(t));
}

test('F4a: computeOpenStatus gives exactly the previous result for every hours shape and time (incl. both 2026 DST changes)', () => {
  const { ctx } = openStatusContext();
  let compared = 0;
  const seen = new Set();
  for (const hours of HOURS) {
    for (const date of DATES) {
      const now = ctx.computeOpenStatus(hours, date);
      const before = ctx.previousComputeOpenStatus(hours, date);
      assert.equal(now, before, `${hours} @ ${date.toISOString()}`);
      seen.add(now);
      compared++;
    }
  }
  assert.ok(compared > 30000, `compared ${compared}`);
  assert.deepEqual([...seen].sort(), ['closed', 'closing-soon', 'open'], 'every status is exercised');
});

test('F4a: no hours, invalid hours and "now" behave as before', () => {
  const { ctx } = openStatusContext();
  for (const bad of [null, undefined, '', 'not json', '{"mon":']) {
    assert.equal(ctx.computeOpenStatus(bad), ctx.previousComputeOpenStatus(bad), String(bad));
  }
  // Without a test date both read the clock; same minute, same answer.
  for (const hours of HOURS) assert.equal(ctx.computeOpenStatus(hours), ctx.previousComputeOpenStatus(hours));
});

test('F4a: the formatter is created once, on first use, and reused for every card', () => {
  const { ctx, counter } = openStatusContext();
  assert.equal(counter.constructed, 0, 'nothing is created when app.js loads');
  assert.equal(ctx.computeOpenStatus(null), null);
  assert.equal(counter.constructed, 0, 'no formatter for a card without hours');
  for (let i = 0; i < 1411; i++) ctx.computeOpenStatus(HOURS[i % HOURS.length], DATES[i]);
  assert.equal(counter.constructed, 1, 'one formatter for 1,411 cards');
  ctx.previousComputeOpenStatus(HOURS[0], DATES[0]);
  assert.equal(counter.constructed, 2, '(the previous code built one per call)');
});

// ---- F5: /browse sort reads each card's rating once --------------------------
// "Highest rated" re-read both cards' ratings from the DOM on every comparison
// (thousands of querySelectorAll calls for 1,411 cards). Ratings are now read
// once per sort; the comparator and the (stable) sort are unchanged.

const SORT_JS = slice('/* ---------- Sort ---------- */', '/* ---------- List Your Venue form');

// The previous initBlock4, verbatim apart from its name.
const PREVIOUS_SORT = `function previousInitBlock4(){
  var sortSelect = document.getElementById('sortSelect');
  var grid = document.getElementById('venueGrid');
  if (!sortSelect || !grid) return;

  // Preserve the original DOM order so "Featured order" can restore it exactly.
  var originalOrder = Array.prototype.slice.call(grid.children);

  function getRating(card){
    var spans = card.querySelectorAll('.venue-region .mono');
    for (var i = 0; i < spans.length; i++){
      var text = spans[i].textContent || '';
      if (text.indexOf('★') !== -1){
        var match = text.match(/([\\d.]+)/);
        if (match) return parseFloat(match[1]);
      }
    }
    return -1; // unrated cards sort last
  }

  function applySort(){
    var value = sortSelect.value;
    var cards = Array.prototype.slice.call(grid.children);

    if (value === 'default'){
      originalOrder.forEach(function(card){ grid.appendChild(card); });
      return;
    }

    if (value === 'rating-desc'){
      cards.sort(function(a, b){ return getRating(b) - getRating(a); });
    } else if (value === 'name-asc'){
      cards.sort(function(a, b){
        return (a.dataset.name || '').localeCompare(b.dataset.name || '');
      });
    }

    cards.forEach(function(card){ grid.appendChild(card); });
  }

  sortSelect.addEventListener('change', applySort);
}`;

// Cards: rated (with ties), unrated, a cuisine span before the star, a star
// with no number, a malformed number, duplicate names and missing names.
function makeCards(n, seed, { unreadable = true } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const names = ['Ailm Estate', 'BNA Brewing', 'Rotary Beach Park', 'Sandhill Wines', 'Antico Pizza', 'Waterfront Wines', 'Micro Bar', ''];
  return Array.from({ length: n }, (_, i) => {
    let kind = Math.floor(rnd() * 10);
    if (!unreadable && kind === 3) kind = 5;
    const rating = (Math.round((3 + rnd() * 2) * 10) / 10).toFixed(1);
    const spans = kind === 0 ? [] // unrated
      : kind === 1 ? [{ textContent: 'Italian' }, { textContent: `★ ${rating}` }] // cuisine first
      : kind === 2 ? [{ textContent: '★ ' }] // star, no number
      : kind === 3 ? [{ textContent: '★ .' }] // parses to NaN
      : [{ textContent: `★ ${kind === 4 ? '4.5' : rating}` }]; // many ties at 4.5
    return { id: i, spans, dataset: { name: names[Math.floor(rnd() * names.length)] + (rnd() < 0.5 ? '' : ' ' + i) } };
  });
}
function sortHarness(fnName, cards) {
  let queries = 0, handler = null;
  const grid = { children: [] };
  grid.appendChild = (c) => { const i = grid.children.indexOf(c); if (i !== -1) grid.children.splice(i, 1); grid.children.push(c); };
  const select = { value: 'default', addEventListener: (type, fn) => { if (type === 'change') handler = fn; } };
  for (const c of cards) grid.appendChild({ id: c.id, dataset: c.dataset, querySelectorAll: (sel) => { assert.equal(sel, '.venue-region .mono'); queries++; return c.spans; } });
  const ctx = vm.createContext({ document: { getElementById: (id) => ({ sortSelect: select, venueGrid: grid })[id] || null }, Map, parseFloat });
  vm.runInContext(`${SORT_JS}\n${PREVIOUS_SORT}\n${fnName}();`, ctx);
  return { order: () => grid.children.map((c) => c.id), choose: (v) => { select.value = v; handler(); }, queries: () => queries, reset: () => { queries = 0; } };
}

test('F5: every sort option, in any sequence, gives exactly the previous order', () => {
  for (const [n, seed] of [[1411, 7], [200, 42], [37, 3], [2, 1], [1, 9], [0, 5]]) {
    const now = sortHarness('initBlock4', makeCards(n, seed));
    const before = sortHarness('previousInitBlock4', makeCards(n, seed));
    assert.deepEqual(now.order(), before.order(), `${n}: same starting order`);
    for (const v of ['rating-desc', 'name-asc', 'rating-desc', 'default', 'rating-desc', 'rating-desc', 'name-asc', 'default', 'unknown-value', 'default']) {
      now.choose(v); before.choose(v);
      assert.deepEqual(now.order(), before.order(), `${n} cards, seed ${seed}, after "${v}"`);
    }
  }
});

// (A star with an unreadable number parses to NaN, which the comparator
// treats as equal to everything -- so, as before, such a card makes the order
// only partly sorted. The equivalence test above covers that case; this one
// uses readable ratings.)
test('F5: highest rated -- best first, unrated last, Featured restores the original order', () => {
  const h = sortHarness('initBlock4', makeCards(300, 11, { unreadable: false }));
  const cards = makeCards(300, 11, { unreadable: false });
  h.choose('rating-desc');
  const rating = (c) => { for (const sp of c.spans) if (sp.textContent.includes('★')) { const m = sp.textContent.match(/([\d.]+)/); if (m) return parseFloat(m[1]); } return -1; };
  const sorted = h.order().map((id) => cards[id]);
  const numbers = sorted.map(rating);
  assert.ok(numbers.every((r) => !Number.isNaN(r)));
  for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i - 1] >= numbers[i], `position ${i}: ${numbers[i - 1]} then ${numbers[i]}`);
  assert.equal(numbers[numbers.length - 1], -1, 'unrated cards are last');
  h.choose('default');
  assert.deepEqual(h.order(), cards.map((c) => c.id), '"Featured order" restores the original order exactly');
});

test('F5: ratings are read once per card per sort (previously twice per comparison)', () => {
  const now = sortHarness('initBlock4', makeCards(1411, 7));
  const before = sortHarness('previousInitBlock4', makeCards(1411, 7));
  now.reset(); before.reset();
  now.choose('rating-desc'); before.choose('rating-desc');
  assert.equal(now.queries(), 1411, 'one rating read per card');
  assert.ok(before.queries() > 5 * 1411, `the previous code read ${before.queries()} times`);
  now.reset(); now.choose('name-asc'); now.choose('default');
  assert.equal(now.queries(), 0, 'A-Z and Featured order read no ratings');
});

// ---- F6: a Favorite tap rewrites only the buttons that change -----------------
// syncButtons() rewrote the markup of every .fav-btn on the page (1,411 on
// /browse) on every Favorite tap -- most of the tap's cost. A button now
// remembers the markup it was last given and is rewritten only when that
// would change (state, or the language label). The end state must be exactly
// what the previous code produced.

const FAV_START = '/* ---------- Favorites: heart a venue, filter to just your favorites ---------- */';
const FAV_JS = slice(FAV_START, '/* ---------- Weather-aware suggestions');
const NEW_SYNC_START = FAV_JS.indexOf('  // Every button is checked on each sync,');
const NEW_SYNC_END = FAV_JS.indexOf('  function toggleFavorite(');
// The previous syncButtons, verbatim.
const PREVIOUS_SYNC = `  function syncButtons(){
    document.querySelectorAll('.fav-btn').forEach(function(btn){
      var isFav = isFavorite(btn.dataset.favName, favItemOf(btn));
      btn.classList.toggle('is-fav', isFav);
      btn.innerHTML = (isFav ? HEART_FILLED : HEART_OUTLINE) + ' ' + (isFav ? t('card.favorited') : t('card.favorite'));

      var card = btn.closest('.venue-card, .featured-card');
      if (card) card.dataset.favorite = isFav ? '1' : '0';
    });
    if (countEl) countEl.textContent = favoriteCount();
  }

`;
const PREVIOUS_FAV_JS = FAV_JS.slice(0, NEW_SYNC_START) + PREVIOUS_SYNC + FAV_JS.slice(NEW_SYNC_END);

// Minimal element tree with counters for markup and data-favorite writes.
class FavEl {
  constructor(className = '', attrs = {}, dataset = {}) {
    this.className = className; this.attrs = attrs; this.children = []; this.parentNode = null; this.htmlWrites = 0; this.favWrites = 0; this._html = '';
    const self = this;
    this.dataset = new Proxy(dataset, { set(o, k, v) { if (k === 'favorite') self.favWrites++; o[k] = v; return true; } });
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this.htmlWrites++; this._html = String(v); }
  add(child) { child.parentNode = this; this.children.push(child); return child; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  get classList() {
    const self = this, set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    return { contains: (c) => set().has(c), toggle: (c, on) => { const s = set(); if (on) s.add(c); else s.delete(c); self.className = [...s].join(' '); } };
  }
  matches(sel) {
    return sel.split(',').map((x) => x.trim()).some((one) => {
      const m = /^(\.[\w-]+)?(\[[\w-]+\])?$/.exec(one);
      if (!m) throw new Error('unsupported selector ' + one);
      return (!m[1] || this.classList.contains(m[1].slice(1))) && (!m[2] || m[2].slice(1, -1) in this.attrs);
    });
  }
  closest(sel) { for (let e = this; e; e = e.parentNode) if (e.matches(sel)) return e; return null; }
  querySelector(sel) { for (const c of this.children) { if (c.matches(sel)) return c; const d = c.querySelector(sel); if (d) return d; } return null; }
}
const LABELS = { en: { 'card.favorite': 'Favorite', 'card.favorited': 'Favorited' }, fr: { 'card.favorite': 'Favori', 'card.favorited': 'En favori' } };
// The card shapes the site renders, with same-name twins, an event, a card
// with no id, a featured card and a lone button outside any card.
function favPage() {
  const btns = [], cards = [];
  const appCard = (name, ref) => { const c = new FavEl('venue-card', { 'data-trip-ref': ref }); const row = c.add(new FavEl('trip-fav-row')); const b = row.add(new FavEl('fav-btn', {}, { favName: name })); row.add(new FavEl('trip-btn', { 'data-trip-ref': ref })); cards.push(c); btns.push(b); return b; };
  const holder = (name, attrs, cls = 'venue-card') => { const c = new FavEl(cls, Object.assign({ 'data-venue-id': '' }, attrs)); const b = c.add(new FavEl('card-action fav-btn', {}, { favName: name })); cards.push(c); btns.push(b); return b; };
  for (let i = 1; i <= 60; i++) appCard(`Venue ${i}`, `venue:${i}`);
  appCard('Rotary Beach Park', 'venue:1181'); appCard('Rotary Beach Park', 'venue:2215'); // same-name twins
  holder('Drop Zone Kelowna', { 'data-venue-id': 'event-256', 'data-occurrence-id': '466' });
  holder('No Id Cafe', {});
  holder('Featured Winery', { 'data-venue-id': '1420' }, 'featured-card');
  const lone = new FavEl('fav-btn', {}, { favName: 'Lone Button' }); btns.push(lone);
  return { btns, cards };
}
function bootFav(src, { legacy, saved } = {}) {
  const { btns, cards } = favPage();
  const store = new Map();
  if (legacy) store.set('okanaganFavorites', JSON.stringify(legacy));
  if (saved) store.set('okanaganSaved', JSON.stringify(saved));
  const events = []; let docClick = null, filters = 0, lang = 'en';
  const count = new FavEl();
  const window = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    trackEvent: (name, params) => events.push([name, params]),
    __applyFilters: () => { filters++; },
  };
  const document = {
    getElementById: (id) => (id === 'favoritesCount' ? count : null),
    querySelectorAll: (sel) => (sel === '.fav-btn' ? btns : []),
    addEventListener: (type, fn) => { if (type === 'click') docClick = fn; },
  };
  const ctx = vm.createContext({ window, document, t: (k) => LABELS[lang][k] || k, Set, JSON, Array, Number, Date: class extends Date { toISOString() { return '2026-10-03T00:00:00.000Z'; } }, String });
  vm.runInContext(src, ctx);
  const writes = () => btns.reduce((n, b) => n + b.htmlWrites, 0);
  return {
    btns, store, events, count,
    click: (i) => docClick({ target: btns[i] }),
    setLang: (l) => { lang = l; window.__syncFavButtons(); },
    sync: () => window.__syncFavButtons(),
    addButton: (name) => { const c = new FavEl('venue-card', { 'data-venue-id': '9999' }); const b = c.add(new FavEl('fav-btn', {}, { favName: name })); cards.push(c); btns.push(b); return b; },
    otherTab: (names) => store.set('okanaganFavorites', JSON.stringify(names)),
    writes, resetWrites: () => { btns.forEach((b) => { b.htmlWrites = 0; }); cards.forEach((c) => { c.favWrites = 0; }); },
    favWrites: () => cards.reduce((n, c) => n + c.favWrites, 0),
    filters: () => filters,
    state: () => ({
      buttons: btns.map((b) => [b.className, b.innerHTML]),
      cards: cards.map((c) => c.dataset.favorite),
      count: count.textContent, names: store.get('okanaganFavorites') || null, saved: store.get('okanaganSaved') || null,
      events: JSON.parse(JSON.stringify(events)), filters, // (event params come from the vm realm)
    }),
  };
}

test('F6: the module slice is the real one and the comparison copy differs only in syncButtons', () => {
  assert.ok(NEW_SYNC_START > 0 && NEW_SYNC_END > NEW_SYNC_START, 'syncButtons found in the Favorites module');
  assert.ok(FAV_JS.includes('btn.__favHtml !== html'), 'the new syncButtons skips unchanged buttons');
  assert.equal(PREVIOUS_FAV_JS.split('function syncButtons()').length, 2);
  assert.ok(!PREVIOUS_FAV_JS.includes('__favHtml'));
});

test('F6: after every step (taps, twins, events, language switch, new buttons, another tab) the page is exactly as before', () => {
  for (const initial of [{}, { legacy: ['Venue 3', 'Rotary Beach Park', 'Lone Button'] }, { legacy: ['Venue 5'], saved: { v: 1, items: [{ k: 'venue', id: 5, name: 'Venue 5' }, { k: 'venue', id: 1181, name: 'Rotary Beach Park' }] } }]) {
    const now = bootFav(FAV_JS, initial), before = bootFav(PREVIOUS_FAV_JS, initial);
    const steps = [
      ['load', () => {}],
      ['tap Venue 1', (p) => p.click(0)], ['tap Venue 1 again', (p) => p.click(0)],
      ['tap twin 1181', (p) => p.click(60)], ['tap twin 2215', (p) => p.click(61)], ['untap twin 1181', (p) => p.click(60)],
      ['tap event', (p) => p.click(62)], ['tap card with no id', (p) => p.click(63)], ['tap featured card', (p) => p.click(64)], ['tap lone button', (p) => p.click(65)],
      ['switch to French', (p) => p.setLang('fr')], ['tap Venue 7 in French', (p) => p.click(6)], ['back to English', (p) => p.setLang('en')],
      ['new button, then sync', (p) => { p.addButton('Venue 7'); p.sync(); }], ['tap the new button', (p) => p.click(66)],
      ['another tab rewrites the names', (p) => p.otherTab(['Venue 40'])], ['tap Venue 2', (p) => p.click(1)], ['plain re-sync', (p) => p.sync()],
    ];
    for (const [label, step] of steps) {
      step(now); step(before);
      assert.deepEqual(now.state(), before.state(), `${JSON.stringify(initial)}: after "${label}"`);
    }
  }
});

test('F6: a tap rewrites only the changed button(s); a language switch still rewrites every label', () => {
  const now = bootFav(FAV_JS), before = bootFav(PREVIOUS_FAV_JS);
  const n = now.btns.length;
  assert.equal(now.writes(), n, 'first sync writes every button (as before)');
  now.resetWrites(); before.resetWrites();
  now.click(0); before.click(0);
  assert.equal(now.writes(), 1, 'one Favorite tap: one button rewritten');
  assert.equal(before.writes(), n, `(the previous code rewrote all ${n})`);
  assert.equal(now.favWrites(), 1, 'only the changed card gets data-favorite written');
  now.resetWrites(); now.click(60);
  assert.equal(now.writes(), 1, 'a same-name twin with its own id: only that place becomes a Favorite (Stage 5E), one rewrite');
  assert.ok(now.btns[60].classList.contains('is-fav') && !now.btns[61].classList.contains('is-fav'));
  now.resetWrites(); now.sync();
  assert.equal(now.writes(), 0, 'a re-sync with nothing changed rewrites nothing');
  now.setLang('fr');
  assert.equal(now.writes(), n, 'a language switch relabels every button');
  assert.ok(now.btns.every((b) => /Favori|En favori/.test(b.innerHTML)));
  now.resetWrites(); const added = now.addButton('Venue 1'); now.sync();
  assert.equal(now.writes(), 1, 'a newly added button is always written');
  assert.ok(/ Favori$/.test(added.innerHTML), 'written with the current (French) label; a different id is not a Favorite (Stage 5E) -- its state is covered by the equivalence test');
});
