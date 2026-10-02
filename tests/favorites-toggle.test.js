'use strict';

// Stage 5E (2026-10-01): a Favorite belongs to one place or event (the
// Favorites half of W07). app.js writes okanaganFavorites (names) and the
// Stage 4.3 okanaganSaved list (ids) together on every click.
//
// PURE test: the real Favorites module from public/scripts/app.js (sliced
// between its own section markers) runs in a vm against a small mock DOM.
// No server, no database, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const START = '/* ---------- Favorites: heart a venue, filter to just your favorites ---------- */';
const END = '/* ---------- Weather-aware suggestions';
const FAV_JS = APP_JS.slice(APP_JS.indexOf(START), APP_JS.indexOf(END));

// A minimal element tree: attributes, dataset, classes, parent / children,
// closest() and querySelector() for the selectors the module uses.
class El {
  constructor(className = '', attrs = {}, dataset = {}) { this.className = className; this.attrs = attrs; this.dataset = dataset; this.children = []; this.parentNode = null; this.innerHTML = ''; this.textContent = ''; }
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

function boot({ legacy, saved, buttons = [] } = {}) {
  const store = new Map();
  if (legacy !== undefined) store.set('okanaganFavorites', typeof legacy === 'string' ? legacy : JSON.stringify(legacy));
  if (saved !== undefined) store.set('okanaganSaved', typeof saved === 'string' ? saved : JSON.stringify(saved));
  const events = [], writes = [];
  let docClick = null;
  const count = new El();
  const window = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { writes.push(k); store.set(k, String(v)); } },
    trackEvent: (name, params) => events.push([name, params]),
  };
  const document = {
    getElementById: (id) => (id === 'favoritesCount' ? count : null),
    querySelectorAll: (sel) => (sel === '.fav-btn' ? buttons : []),
    addEventListener: (type, fn) => { if (type === 'click') docClick = fn; },
  };
  const ctx = { window, document, t: (k) => ({ 'card.favorite': 'Favorite', 'card.favorited': 'Favorited' }[k] || k), Set, JSON, Array, Number, Date, String };
  vm.createContext(ctx);
  vm.runInContext(FAV_JS, ctx);
  return {
    window, events, writes, count,
    click: (btn) => docClick({ target: btn }),
    names: () => JSON.parse(store.get('okanaganFavorites') || 'null'),
    saved: () => JSON.parse(store.get('okanaganSaved') || 'null'),
    raw: (k) => store.get(k),
    sync: () => window.__syncFavButtons(),
  };
}
const on = (b) => b.classList.contains('is-fav');
// The card shapes the site renders:
const appCard = (name, ref) => { const card = new El('venue-card', { 'data-trip-ref': ref }); const row = card.add(new El('trip-fav-row')); const fav = row.add(new El('fav-btn', {}, { favName: name })); row.add(new El('trip-btn', { 'data-trip-ref': ref })); return { card, fav }; };
const holderCard = (name, attrs) => { const card = new El('venue-card', Object.assign({ 'data-venue-id': '' }, attrs)); const fav = card.add(new El('card-action fav-btn', {}, { favName: name })); return { card, fav }; };
const slotRow = (name, ref) => { const row = new El('trip-slot-actions'); const fav = row.add(new El('fav-btn', {}, { favName: name })); row.add(new El('trip-btn', { 'data-trip-ref': ref })); return { row, fav }; };
const OVG = 'Okanagan Virtual Golf';

test('Stage 5E: the Favorites module slice is the real app.js module; it exposes the existing Favorite sync hook the capture script stands aside for', () => {
  assert.equal(APP_JS.split(START).length, 2);
  assert.equal(APP_JS.split(END).length, 2);
  const t = boot();
  assert.equal(typeof t.window.__syncFavButtons, 'function');
});

test('Stage 5E: two same-name places (app.js cards on /browse, the homepage) are two Favorites; removing one keeps the other and the shared name', () => {
  const k = appCard(OVG, 'venue:1126'), p = appCard(OVG, 'venue:1132');
  const t = boot({ buttons: [k.fav, p.fav] });
  t.click(k.fav);
  assert.ok(on(k.fav) && !on(p.fav), 'only Kelowna is pressed');
  assert.equal(k.card.dataset.favorite, '1'); assert.equal(p.card.dataset.favorite, '0');
  assert.deepEqual(t.names(), [OVG]);
  assert.deepEqual(t.saved().items.map(({ k: kind, id, name }) => [kind, id, name]), [['venue', 1126, OVG]]);
  t.click(p.fav);
  assert.ok(on(k.fav) && on(p.fav));
  assert.equal(t.count.textContent, 2, 'two favourites, one name');
  t.click(k.fav);
  assert.ok(!on(k.fav) && on(p.fav), 'Penticton stays');
  assert.deepEqual(t.saved().items.map((x) => x.id), [1132]);
  assert.deepEqual(t.names(), [OVG], 'the name stays while Penticton is saved');
  t.click(p.fav);
  assert.deepEqual(t.saved().items, []); assert.deepEqual(t.names(), []);
  assert.equal(t.count.textContent, 0);
  // Re-add
  t.click(p.fav);
  assert.ok(on(p.fav) && !on(k.fav));
});

test('Stage 5E: the id comes from the existing markup -- [data-venue-id] holder first, then the card data-trip-ref, then the neighbouring trip button', () => {
  // Holder wins over an inner trip ref.
  const h = new El('venue-card', { 'data-venue-id': '5', 'data-trip-ref': 'venue:9' });
  const hf = h.add(new El('fav-btn', {}, { favName: 'Holder Place' }));
  // V2 / V3 plan stop: only the neighbouring trip button has the ref.
  const v2 = slotRow('Plan Stop', 'venue:77');
  const t = boot({ buttons: [hf, v2.fav] });
  t.click(hf); t.click(v2.fav);
  assert.deepEqual(t.saved().items.map((x) => [x.k, x.id]), [['venue', 5], ['venue', 77]]);
  // An event's trip ref becomes an undated event Favorite.
  const ev = slotRow('Jazz Night', 'event:41');
  const u = boot({ buttons: [ev.fav] });
  u.click(ev.fav);
  assert.deepEqual(u.saved().items.map(({ k, id, occ, date }) => ({ k, id, occ, date })), [{ k: 'event', id: 41, occ: null, date: null }]);
});

test('Stage 5E: events -- one Favorite per event whichever date is clicked; same-name events are independent; venue:583 and event:583 never collide', () => {
  const d1 = holderCard('Oktoberfest', { 'data-venue-id': 'event-583', 'data-occurrence-id': '901', 'data-occurrence-date': '2026-10-03', 'data-occurrence-time': '18:00' });
  const d2 = holderCard('Oktoberfest', { 'data-venue-id': 'event-583', 'data-occurrence-id': '902', 'data-occurrence-date': '2026-10-10' });
  const other = holderCard('Oktoberfest', { 'data-venue-id': 'event-598', 'data-occurrence-id': '950', 'data-occurrence-date': '2026-10-04' });
  const venue583 = appCard('Shannon Lake Restaurant', 'venue:583');
  const t = boot({ buttons: [d1.fav, d2.fav, other.fav, venue583.fav] });
  t.click(d1.fav);
  assert.deepEqual(t.saved().items.map(({ k, id, occ, date, time }) => ({ k, id, occ, date, time })), [{ k: 'event', id: 583, occ: 901, date: '2026-10-03', time: '18:00' }], 'saved with the date it was saved from');
  assert.ok(on(d1.fav) && on(d2.fav), 'every date of event 583 shows as a Favorite');
  assert.ok(!on(other.fav), 'the other Oktoberfest (event 598) does not');
  assert.ok(!on(venue583.fav), 'nor venue 583');
  t.click(other.fav); t.click(venue583.fav);
  t.click(d2.fav);                                                 // remove 583 from its other date
  assert.deepEqual(t.saved().items.map((x) => x.k + ':' + x.id), ['event:598', 'venue:583']);
  assert.ok(!on(d1.fav) && !on(d2.fav) && on(other.fav) && on(venue583.fav));
  assert.deepEqual(t.names().sort(), ['Oktoberfest', 'Shannon Lake Restaurant'], 'Oktoberfest stays as a name: event 598 is still saved');
});

test('Stage 5E: favourites saved by name before ids stay name-matched -- never converted, guessed or rewritten', () => {
  const k = appCard(OVG, 'venue:1126'), p = appCard(OVG, 'venue:1132');
  const t = boot({ legacy: [OVG, 'Some Old Place'], buttons: [k.fav, p.fav] });
  assert.ok(on(k.fav) && on(p.fav), 'shown on both, as before 5E');
  assert.deepEqual(t.writes, [], 'loading writes nothing');
  assert.equal(t.count.textContent, 2);
  t.click(p.fav);
  assert.ok(!on(k.fav) && !on(p.fav), 'un-favouriting it removes the name, as before');
  assert.deepEqual(t.names(), ['Some Old Place']);
  assert.equal(t.saved(), null, 'no saved item is invented');
  // A name already carried by a saved item belongs to that item only.
  const u = boot({ legacy: [OVG], saved: { v: 1, items: [{ k: 'venue', id: 1132, name: OVG, savedAt: 'x' }] }, buttons: [k.fav, p.fav] });
  assert.ok(!on(k.fav) && on(p.fav));
});

test('Stage 5E: storage -- both lists are re-read on every click; unrelated saved items are kept untouched; a corrupt list is never fatal', () => {
  const k = appCard(OVG, 'venue:1126');
  const foreign = { k: 'event', id: 7, occ: 3, date: '2026-12-01', time: null, name: 'Market', savedAt: 'y', chosen: true };
  const t = boot({ legacy: ['Market'], saved: { v: 1, items: [foreign] }, buttons: [k.fav] });
  t.click(k.fav);
  assert.deepEqual(t.saved().items[0], foreign, 'other items are kept exactly');
  const u = boot({ legacy: '{bad', saved: '{bad', buttons: [k.fav] });
  assert.ok(!on(k.fav));
  u.click(k.fav);
  assert.deepEqual(u.names(), [OVG]);
  assert.deepEqual(u.saved().items.map((x) => x.id), [1126]);
});

test('Stage 5E: a Favorite button with no id anywhere behaves exactly as before (name only; okanaganSaved untouched)', () => {
  const lone = new El('fav-btn', {}, { favName: 'Nameless' });
  const t = boot({ buttons: [lone] });
  t.click(lone);
  assert.ok(on(lone)); assert.deepEqual(t.names(), ['Nameless']); assert.equal(t.raw('okanaganSaved'), undefined);
  t.click(lone);
  assert.deepEqual(t.names(), []); assert.equal(t.raw('okanaganSaved'), undefined);
});

test('Stage 5E: analytics unchanged -- add_to_favorites / remove_from_favorites with { venue_name } only', () => {
  const k = appCard(OVG, 'venue:1126'), p = appCard(OVG, 'venue:1132');
  const t = boot({ buttons: [k.fav, p.fav] });
  t.click(k.fav); t.click(p.fav); t.click(k.fav); t.click(p.fav);
  assert.deepEqual(JSON.parse(JSON.stringify(t.events)), [
    ['add_to_favorites', { venue_name: OVG }], ['add_to_favorites', { venue_name: OVG }],
    ['remove_from_favorites', { venue_name: OVG }], ['remove_from_favorites', { venue_name: OVG }],
  ]);
});
