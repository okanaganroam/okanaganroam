'use strict';

// Stage 5C (2026-10-01): My Trip identifies a stop by its ref ("venue:<id>" /
// "event:<id>") instead of its name -- the Trip half of W07.
//
// PURE test: the real tray module from public/scripts/app.js (sliced between
// its own section markers) runs in a vm against a small mock DOM. No server,
// no database, no network (the resolver is a stub).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const START = '/* ---------- Trip planner: build a multi-stop route across saved venues ---------- */';
const END = '/* ---------- Build My Trip, Stage 2: /trip planner page';
const TRAY_JS = APP_JS.slice(APP_JS.indexOf(START), APP_JS.indexOf(END));
const STRINGS = { 'trip.addToTrip': '\u{1F9F3} Add to trip', 'trip.inTrip': '✓ In trip', 'trip.emptyState': 'No venues added yet.', 'trip.sameArea': 'Same area', 'trip.kmToNextStop': 'km to next stop', 'trip.removed': 'Removed {name}.', 'trip.undo': 'Undo', 'trip.undoLabel': 'Undo: put {name} back in your trip', 'trip.restored': 'Restored {name}.' };
const REGION_LABELS = { kelowna: 'Kelowna', penticton: 'Penticton', 'west-kelowna': 'West Kelowna', oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon' };

// A minimal element: dataset, class list, text, innerHTML, closest() by class.
// W14 additions: attributes, focus(), textContent/innerHTML kept in step, and
// querySelector() for the two things the tray looks up in its own markup (the
// Undo button and a row's remove button).
class El {
  constructor(id, className = '') { this.id = id; this.className = className; this.dataset = {}; this.textContent = ''; this.disabled = false; this.style = {}; this.listeners = {}; this.attrs = {}; }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); this._text = this._html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); this._kids = {}; }
  get textContent() { return this._text; }
  set textContent(v) { this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); this._text = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  focus() { El.focused = this; }
  querySelector(sel) {
    if (sel in this._kids) return this._kids[sel];
    let kid = null, m;
    if (sel === '[data-trip-undo]' && (m = this._html.match(/<button[^>]*data-trip-undo[^>]*aria-label="([^"]*)"[^>]*>([^<]*)<\/button>/))) {
      kid = new El('', ''); kid.dataset.tripUndo = ''; kid.setAttribute('aria-label', m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')); kid.textContent = m[2]; kid.setAttribute('style', (this._html.match(/style="([^"]*)"/) || [])[1]);
    } else if ((m = sel.match(/^\[data-remove-index="(\d+)"\]$/)) && this._html.includes(`data-remove-index="${m[1]}"`)) {
      kid = new El('', 'trip-remove'); kid.dataset.removeIndex = m[1];
    }
    return (this._kids[sel] = kid);
  }
  get classList() {
    const self = this;
    const set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    return {
      contains: (c) => set().has(c),
      add: (c) => { const s = set(); s.add(c); self.className = [...s].join(' '); },
      remove: (c) => { const s = set(); s.delete(c); self.className = [...s].join(' '); },
      toggle: (c, force) => { const s = set(); const on = force === undefined ? !s.has(c) : !!force; if (on) s.add(c); else s.delete(c); self.className = [...s].join(' '); return on; },
    };
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  contains(other) { return other === this; }
  closest(sel) {
    if (sel === '[data-trip-undo]') return 'tripUndo' in this.dataset ? this : null;
    return this.classList.contains(sel.replace(/^\./, '').split(',')[0].trim()) ? this : null;
  }
}

// Boot the tray with a given saved trip and the given page buttons.
function boot({ saved, buttons = [], resolve = null, timers = null } = {}) {
  El.focused = null;
  const els = { tripTrayToggle: new El('tripTrayToggle'), tripTrayPanel: new El('tripTrayPanel'), tripTrayList: new El('tripTrayList'), tripTrayCount: new El('tripTrayCount'), tripRouteBtn: new El('tripRouteBtn'), tripClearBtn: new El('tripClearBtn'), tripTrayMessage: new El('tripTrayMessage') };
  const store = new Map(saved === undefined ? [] : [['okanaganTrip', typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  const events = [], requests = [];
  let docClick = null;
  const window = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    trackEvent: (name, params) => events.push([name, params]),
    CARD_REGION_LABEL: REGION_LABELS,
    open: () => {},
    fetch: resolve ? (url) => { requests.push(url); return Promise.resolve(resolve(url)); } : undefined,
  };
  const document = {
    getElementById: (id) => els[id] || null,
    querySelectorAll: (sel) => (sel === '.trip-btn' ? buttons : []),
    addEventListener: (type, fn) => { if (type === 'click') docClick = fn; },
  };
  const ctx = { window, document, t: (k) => STRINGS[k] || k, setTimeout: timers ? timers.setTimeout : setTimeout, clearTimeout: timers ? timers.clearTimeout : clearTimeout, parseInt, JSON, String, Array, Object, Math };
  vm.createContext(ctx);
  vm.runInContext(TRAY_JS, ctx);
  const click = (target) => docClick({ target });
  return {
    els, events, requests, buttons,
    stored: () => JSON.parse(store.get('okanaganTrip') || 'null'),
    rawStored: () => store.get('okanaganTrip'),
    click,
    removeAt: (i) => { const b = new El('', 'trip-remove'); b.dataset.removeIndex = String(i); click(b); },
    msg: els.tripTrayMessage,
    undoBtn: () => els.tripTrayMessage.querySelector('[data-trip-undo]'),
    focused: () => El.focused,
    items: () => (els.tripTrayList.innerHTML.match(/<div class="trip-item">[\s\S]*?<\/div>/g) || []),
    settle: () => new Promise((r) => setTimeout(r, 0)),
  };
}
function tripBtn(name, region, ref, query) {
  const b = new El('', 'trip-btn');
  b.dataset.tripName = name; b.dataset.tripRegion = region; b.dataset.tripQuery = query || `${name}, ${REGION_LABELS[region] || region}, Okanagan Valley, BC`;
  if (ref) b.dataset.tripRef = ref;
  return b;
}
const OVG_K = () => tripBtn('Okanagan Virtual Golf', 'kelowna', 'venue:1126');
const OVG_P = () => tripBtn('Okanagan Virtual Golf', 'penticton', 'venue:1132');
const pressed = (b) => b.classList.contains('in-trip');

test('Stage 5C: the tray module slice is the real app.js tray (both markers found once)', () => {
  assert.equal(APP_JS.split(START).length, 2);
  assert.equal(APP_JS.split(END).length, 2);
  assert.ok(TRAY_JS.includes('var MAX_STOPS = 10;') && TRAY_JS.includes('function sameStop(x, s)'));
});

test('Stage 5C tray: unique venues add and remove; each button shows its own state', () => {
  const a = tripBtn('Tower Ranch Golf & Country Club', 'kelowna', 'venue:1087'), b = tripBtn('Michaelbrook Golf Course', 'kelowna', 'venue:1090');
  const t = boot({ buttons: [a, b] });
  t.click(a); t.click(b);
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1087', 'venue:1090']);
  assert.ok(pressed(a) && pressed(b));
  assert.equal(t.els.tripTrayCount.textContent, 2);
  t.click(a);
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1090']);
  assert.ok(!pressed(a) && pressed(b));
  // The stored entry keeps every field older code reads.
  assert.deepEqual(t.stored()[0], { name: 'Michaelbrook Golf Course', query: 'Michaelbrook Golf Course, Kelowna, Okanagan Valley, BC', region: 'kelowna', ref: 'venue:1090' });
});

test('Stage 5C tray: two same-name venues coexist, are pressed independently, and removing one leaves the other', () => {
  const k = OVG_K(), p = OVG_P();
  const t = boot({ buttons: [k, p] });
  t.click(k);
  assert.ok(pressed(k) && !pressed(p), 'only the Kelowna button is pressed');
  t.click(p);
  assert.deepEqual(t.stored().map((x) => [x.ref, x.region]), [['venue:1126', 'kelowna'], ['venue:1132', 'penticton']], 'both are in the trip');
  assert.ok(pressed(k) && pressed(p));
  t.click(k);                                                    // remove A: B stays
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1132']);
  assert.ok(!pressed(k) && pressed(p));
  t.click(k); t.click(p);                                        // add A back, remove B: A stays
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1126']);
  assert.ok(pressed(k) && !pressed(p));
});

test('Stage 5C tray: the same ref is never added twice; the cap of 10 still holds', () => {
  const k = OVG_K(), k2 = OVG_K();
  const t = boot({ buttons: [k, k2] });
  t.click(k); t.click(k2);                                       // a second button for the same venue toggles it off
  assert.deepEqual(t.stored(), []);
  const many = Array.from({ length: 11 }, (_, i) => tripBtn(`Place ${i}`, 'kelowna', `venue:${100 + i}`));
  const c = boot({ buttons: many });
  many.forEach((b) => c.click(b));
  assert.equal(c.stored().length, 10);
  assert.ok(!pressed(many[10]));
  assert.match(c.els.tripTrayMessage.textContent, /capped at 10 stops/);
});

test('Stage 5C tray: duplicate names get their region in the existing small type; unique names render exactly as before', () => {
  const k = OVG_K(), p = OVG_P(), u = tripBtn('Tower Ranch Golf & Country Club', 'kelowna', 'venue:1087');
  const t = boot({ buttons: [k, p, u] });
  t.click(u);
  assert.equal(t.items()[0], '<div class="trip-item"><span>1. Tower Ranch Golf & Country Club</span><button class="trip-remove" data-remove-index="0" aria-label="Remove Tower Ranch Golf & Country Club">✕</button></div>', 'unchanged markup for a unique name');
  t.click(k); t.click(p);
  const [, a, b] = t.items();
  assert.equal(a, '<div class="trip-item"><span>2. Okanagan Virtual Golf<br><small class="trip-distance">Kelowna</small></span><button class="trip-remove" data-remove-index="1" aria-label="Remove Okanagan Virtual Golf (Kelowna)">✕</button></div>');
  assert.equal(b, '<div class="trip-item"><span>3. Okanagan Virtual Golf<br><small class="trip-distance">Penticton</small></span><button class="trip-remove" data-remove-index="2" aria-label="Remove Okanagan Virtual Golf (Penticton)">✕</button></div>');
  assert.ok(!t.items()[0].includes('<small'), 'the unique name still has no qualifier');
  // The tray's remove button removes exactly that duplicate-name stop.
  t.removeAt(2);
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1087', 'venue:1126']);
  assert.ok(pressed(k) && !pressed(p));
  assert.ok(!t.items().some((x) => x.includes('<small')), 'back to one: the qualifier goes');
  // Same name AND same region (two events): both shown, honestly, with the same region.
  const e1 = tripBtn('Oktoberfest', 'osoyoos', 'event:583'), e2 = tripBtn('Oktoberfest', 'osoyoos', 'event:598');
  const ev = boot({ buttons: [e1, e2] });
  ev.click(e1); ev.click(e2);
  assert.equal(ev.stored().length, 2, 'two different events with the same name and region are two stops');
  assert.ok(ev.items().every((x) => x.includes('<small class="trip-distance">Osoyoos</small>')));
});

test('Stage 5C tray: analytics are unchanged -- same events, same parameters', () => {
  const k = OVG_K();
  const t = boot({ buttons: [k] });
  t.click(k); t.click(k); t.click(k); t.removeAt(0);
  // (events come from inside the vm, so compare plain copies)
  assert.deepEqual(JSON.parse(JSON.stringify(t.events)), [
    ['add_to_trip', { venue_name: 'Okanagan Virtual Golf', region: 'kelowna', trip_size: 1 }],
    ['remove_from_trip', { venue_name: 'Okanagan Virtual Golf' }],
    ['add_to_trip', { venue_name: 'Okanagan Virtual Golf', region: 'kelowna', trip_size: 1 }],
    ['remove_from_trip', { venue_name: 'Okanagan Virtual Golf' }],
  ]);
});

// ---- saved trips from before refs ----
const resolver = (table) => (url) => {
  const names = [...new URL(url, 'http://x').searchParams.getAll('name')];
  return { ok: true, json: () => Promise.resolve({ ok: true, items: [], names: names.map((n) => table[n] || { name: n, status: 'missing', candidates: [] }) }) };
};
const TABLE = {
  'Okanagan Virtual Golf': { name: 'Okanagan Virtual Golf', status: 'ambiguous', candidates: [{ kind: 'venue', ref: 'venue:1126', region: 'kelowna' }, { kind: 'venue', ref: 'venue:1132', region: 'penticton' }] },
  'Tower Ranch Golf & Country Club': { name: 'Tower Ranch Golf & Country Club', status: 'resolved', candidates: [{ kind: 'venue', ref: 'venue:1087', region: 'kelowna' }] },
  Oktoberfest: { name: 'Oktoberfest', status: 'ambiguous', candidates: [{ kind: 'event', ref: 'event:583', region: 'osoyoos' }, { kind: 'event', ref: 'event:598', region: 'osoyoos' }] },
};

test('Stage 5C legacy: a unique old entry gains its ref; a same-name one resolves by its own region; an ambiguous or missing one is kept, never guessed or deleted', async () => {
  const saved = [
    { name: 'Tower Ranch Golf & Country Club', query: 'Tower Ranch Golf & Country Club, Kelowna, Okanagan Valley, BC', region: 'kelowna' },
    { name: 'Okanagan Virtual Golf', query: 'Okanagan Virtual Golf, Penticton, Okanagan Valley, BC', region: 'penticton' },
    { name: 'Oktoberfest', query: 'Oktoberfest, Osoyoos, Okanagan Valley, BC', region: 'osoyoos' },
    { name: 'Closed Cafe', query: 'Closed Cafe, Vernon, Okanagan Valley, BC', region: 'vernon' },
  ];
  const t = boot({ saved, resolve: resolver(TABLE), buttons: [OVG_K(), OVG_P()] });
  await t.settle(); await t.settle();
  assert.equal(t.requests.length, 1, 'one request for the whole trip');
  assert.deepEqual(t.stored(), [
    { name: 'Tower Ranch Golf & Country Club', query: 'Tower Ranch Golf & Country Club, Kelowna, Okanagan Valley, BC', region: 'kelowna', ref: 'venue:1087' },
    { name: 'Okanagan Virtual Golf', query: 'Okanagan Virtual Golf, Penticton, Okanagan Valley, BC', region: 'penticton', ref: 'venue:1132' },
    { name: 'Oktoberfest', query: 'Oktoberfest, Osoyoos, Okanagan Valley, BC', region: 'osoyoos', unresolved: 1 },
    { name: 'Closed Cafe', query: 'Closed Cafe, Vernon, Okanagan Valley, BC', region: 'vernon', unresolved: 1 },
  ]);
  assert.ok(!pressed(t.buttons[0]) && pressed(t.buttons[1]), 'the converted Penticton stop presses only the Penticton button');
});

test('Stage 5C legacy: an old entry without a region converts only when the name is unique; otherwise it stays name-matched', async () => {
  const saved = [{ name: 'Tower Ranch Golf & Country Club', query: 'Tower Ranch Golf & Country Club, Kelowna, Okanagan Valley, BC' }, { name: 'Okanagan Virtual Golf', query: 'Okanagan Virtual Golf, Kelowna, Okanagan Valley, BC' }];
  const k = OVG_K(), p = OVG_P();
  const t = boot({ saved, resolve: resolver(TABLE), buttons: [k, p] });
  await t.settle(); await t.settle();
  assert.equal(t.stored()[0].ref, 'venue:1087');
  assert.deepEqual(t.stored()[1], { name: 'Okanagan Virtual Golf', query: 'Okanagan Virtual Golf, Kelowna, Okanagan Valley, BC', unresolved: 1 });
  assert.ok(pressed(k) && pressed(p), 'an unresolved name-only stop still matches by name, as before');
  t.click(p);
  assert.deepEqual(t.stored().map((x) => x.name), ['Tower Ranch Golf & Country Club'], 'and can still be removed');
});

test('Stage 5C legacy: malformed data never breaks the tray; valid entries survive; a bad ref is dropped, the stop kept', async () => {
  const saved = [null, 7, 'x', { query: 'no name' }, { name: '' }, { name: 'Okanagan Virtual Golf', query: 'q', region: 'kelowna', ref: 'venue:0' }, { name: 'Tower Ranch Golf & Country Club', query: 'q2', region: 'kelowna', ref: 'venue:1087' }];
  const t = boot({ saved, resolve: resolver(TABLE) });
  assert.equal(t.els.tripTrayCount.textContent, 2);
  await t.settle(); await t.settle();
  assert.deepEqual(t.stored().map((x) => [x.name, x.ref || null]), [['Okanagan Virtual Golf', 'venue:1126'], ['Tower Ranch Golf & Country Club', 'venue:1087']]);
  for (const bad of ['{not json', '{"a":1}', '"str"', 'null']) {
    const b = boot({ saved: bad });
    assert.equal(b.els.tripTrayCount.textContent, 0, bad);
    assert.match(b.els.tripTrayList.innerHTML, /trip-empty/);
  }
});

test('Stage 5C legacy: stops that already have a ref are used directly; nothing is re-asked after a refresh; a failed request changes nothing', async () => {
  const withRef = [{ name: 'Okanagan Virtual Golf', query: 'q', region: 'penticton', ref: 'venue:1132' }];
  const a = boot({ saved: withRef, resolve: resolver(TABLE) });
  await a.settle();
  assert.equal(a.requests.length, 0, 'no request when every stop has a ref');
  const saved = [{ name: 'Oktoberfest', query: 'q', region: 'osoyoos' }];
  const b = boot({ saved, resolve: resolver(TABLE) });
  await b.settle(); await b.settle();
  const after = b.rawStored();
  const c = boot({ saved: after, resolve: resolver(TABLE) });   // "refresh"
  await c.settle();
  assert.equal(c.requests.length, 0, 'an unresolved stop is not asked about again');
  const d = boot({ saved, resolve: () => ({ ok: false, json: () => Promise.resolve(null) }) });
  await d.settle(); await d.settle();
  assert.deepEqual(d.stored(), saved, 'a failed request writes nothing (retried on a later load)');
  const e = boot({ saved, resolve: () => Promise.reject(new Error('offline')) });
  await e.settle(); await e.settle();
  assert.equal(e.rawStored(), JSON.stringify(saved), 'a network error writes nothing either');
});

test('Stage 5C compatibility: stored stops keep name / query / region, so older cached pages still list, route and remove them', () => {
  const k = OVG_K(), p = OVG_P();
  const t = boot({ buttons: [k, p] });
  t.click(k); t.click(p);
  for (const x of t.stored()) {
    assert.equal(typeof x.name, 'string');
    assert.equal(typeof x.query, 'string');
    assert.ok('region' in x);
  }
  // The pre-5C tray matched stops by name only: it still finds both (and removes both together).
  const legacyMatch = (name) => t.stored().filter((x) => x.name === name).length;
  assert.equal(legacyMatch('Okanagan Virtual Golf'), 2);
});

// ---- W14 (2026-10-01): Undo for the tray's ✕ ----
// Only the most recent ✕ removal, for about 10 seconds (paused on hover / focus),
// while My Trip is otherwise unchanged. The exact stored object goes back at its
// original index -- never a stop looked up by name.
function fakeTimers() {
  let now = 0, id = 0; const q = new Map();
  return {
    setTimeout: (fn, ms) => { const i = ++id; q.set(i, { fn, at: now + ms }); return i; },
    clearTimeout: (i) => { q.delete(i); },
    advance(ms) { now += ms; for (const [i, x] of [...q].sort((a, b) => a[1].at - b[1].at)) if (x.at <= now && q.has(i)) { q.delete(i); x.fn(); } },
  };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const TRIP3 = [
  { name: 'Tower Ranch Golf & Country Club', query: 'q1', region: 'kelowna', ref: 'venue:1087' },
  { name: 'Okanagan Virtual Golf', query: 'q2', region: 'kelowna', ref: 'venue:1126' },
  { name: 'Okanagan Virtual Golf', query: 'q3', region: 'penticton', ref: 'venue:1132' },
];

test('W14: ✕ offers Undo (role="status", focus on Undo); Undo puts the exact stop back at its place; analytics: remove_from_trip unchanged + undo_remove_from_trip { trip_size } only', () => {
  const t = boot({ saved: TRIP3 });
  assert.equal(t.msg.getAttribute('role'), 'status');
  const before = t.rawStored();
  t.removeAt(0);
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1126', 'venue:1132']);
  assert.equal(t.msg.style.display, 'block');
  assert.match(t.msg.textContent, /^Removed Tower Ranch Golf & Country Club\. Undo$/);
  const undo = t.undoBtn();
  assert.ok(undo && t.focused() === undo, 'focus moves to Undo');
  assert.equal(undo.getAttribute('aria-label'), 'Undo: put Tower Ranch Golf & Country Club back in your trip');
  assert.match(undo.getAttribute('style'), /min-height:44px/);
  t.click(undo);
  assert.equal(t.rawStored(), before, 'storage byte-identical to before the removal');
  assert.equal(t.msg.textContent, 'Restored Tower Ranch Golf & Country Club.');
  assert.equal(t.focused().dataset.removeIndex, '0', 'focus moves to the restored row');
  assert.deepEqual(plain(t.events), [
    ['remove_from_trip', { venue_name: 'Tower Ranch Golf & Country Club' }],
    ['undo_remove_from_trip', { trip_size: 3 }],
  ]);
  assert.ok(!t.events.some((e) => e[0] === 'add_to_trip'), 'Undo is not an add_to_trip');
});

test('W14: middle and last positions; an event; same-name A and B are each restored exactly, the other untouched', () => {
  for (const i of [1, 2]) {
    const t = boot({ saved: TRIP3 });
    const before = t.rawStored();
    t.removeAt(i);
    t.click(t.undoBtn());
    assert.equal(t.rawStored(), before, `position ${i}`);
  }
  // Same-name: the message names the region; B is untouched while A goes and comes back.
  const a = boot({ saved: TRIP3 });
  a.removeAt(1);
  assert.match(a.msg.textContent, /^Removed Okanagan Virtual Golf \(Kelowna\)\./);
  assert.deepEqual(a.stored()[1], TRIP3[2], 'B untouched');
  a.click(a.undoBtn());
  assert.deepEqual(a.stored(), TRIP3);
  const b = boot({ saved: TRIP3 });
  b.removeAt(2);
  assert.match(b.msg.textContent, /^Removed Okanagan Virtual Golf \(Penticton\)\./);
  b.click(b.undoBtn());
  assert.deepEqual(b.stored(), TRIP3);
  // Events: same name AND region, told apart by ref.
  const evs = [{ name: 'Oktoberfest', query: 'q', region: 'osoyoos', ref: 'event:583' }, { name: 'Oktoberfest', query: 'q', region: 'osoyoos', ref: 'event:598' }, { name: 'Shannon Lake Restaurant', query: 'q', region: 'west-kelowna', ref: 'venue:583' }];
  const e = boot({ saved: evs });
  e.removeAt(0);
  e.click(e.undoBtn());
  assert.deepEqual(e.stored(), evs);
});

test('W14: legacy entries -- a converted one and an unresolved one come back byte-identical, with no resolver request', async () => {
  const saved = [
    { name: 'Tower Ranch Golf & Country Club', query: 'Tower Ranch, Kelowna', region: 'kelowna', ref: 'venue:1087' },
    { name: 'Oktoberfest', query: 'Oktoberfest, Osoyoos', region: 'osoyoos', unresolved: 1 },
    { name: 'Old Name Only', query: 'Old Name Only' , unresolved: 1 },
  ];
  const t = boot({ saved, resolve: resolver(TABLE) });
  await t.settle();
  assert.equal(t.requests.length, 0);
  for (const i of [1, 2, 0]) {
    const before = t.rawStored();
    t.removeAt(i);
    t.click(t.undoBtn());
    assert.equal(t.rawStored(), before, `entry ${i}`);
  }
  assert.equal(t.requests.length, 0, 'Undo never re-resolves');
});

test('W14: only the latest removal is undoable; any other change or closing the tray withdraws Undo -- never a duplicate', () => {
  const t = boot({ saved: TRIP3 });
  t.removeAt(0); t.removeAt(0);                                   // remove A, then B
  t.click(t.undoBtn());
  assert.deepEqual(t.stored().map((x) => x.ref), ['venue:1126', 'venue:1132'], 'only B came back');
  // Remove, then re-add the same stop from its card: Undo is withdrawn, no duplicate.
  const k = OVG_K();
  const r = boot({ saved: TRIP3, buttons: [k] });
  r.removeAt(1);
  const stale = r.undoBtn();
  r.click(k);
  assert.equal(r.msg.style.display, 'none');
  assert.equal(r.undoBtn(), null, 'no Undo button any more');
  r.click(stale);                                                 // a stale Undo does nothing
  assert.deepEqual(r.stored().map((x) => x.ref), ['venue:1087', 'venue:1132', 'venue:1126']);
  // Card removal, Clear trip and closing the tray: no Undo offered / Undo withdrawn.
  const c = boot({ saved: TRIP3, buttons: [k] });
  c.click(k);
  assert.equal(c.undoBtn(), null, 'card-button removal offers no Undo');
  c.removeAt(0);
  c.els.tripTrayPanel.classList.add('open');
  c.click(c.els.tripTrayToggle);                                  // closes the tray
  assert.equal(c.undoBtn(), null);
  assert.equal(c.msg.style.display, 'none');
  assert.equal(c.stored().length, 1);
});

test('W14: the 10-stop cap -- Undo never exceeds 10 and never drops another stop', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ name: `Place ${i}`, query: 'q', region: 'kelowna', ref: `venue:${100 + i}` }));
  const t = boot({ saved: ten });
  t.removeAt(4);
  t.click(t.undoBtn());
  assert.deepEqual(t.stored(), ten, 'back to exactly the same 10');
  const n = tripBtn('Newcomer', 'kelowna', 'venue:999');
  const u = boot({ saved: ten, buttons: [n] });
  u.removeAt(4);
  const stale = u.undoBtn();
  u.click(n);                                                     // fills the freed place
  u.click(stale);
  assert.equal(u.stored().length, 10);
  assert.ok(u.stored().some((x) => x.ref === 'venue:999') && !u.stored().some((x) => x.ref === 'venue:104'), 'the newcomer stays; nothing is dropped');
});

test('W14: Undo expires after about 10 seconds; hover and keyboard focus pause it', () => {
  const tm = fakeTimers();
  const t = boot({ saved: TRIP3, timers: tm });
  t.removeAt(0);
  tm.advance(9999);
  assert.ok(t.undoBtn(), 'still there just before 10 s');
  tm.advance(1);
  assert.equal(t.undoBtn(), null, 'withdrawn at 10 s');
  assert.equal(t.msg.style.display, 'none');
  assert.equal(t.stored().length, 2, 'the removal stands');
  // Paused while hovered or focused.
  const h = boot({ saved: TRIP3, timers: tm });
  h.removeAt(0);
  h.msg.listeners.mouseenter();
  tm.advance(60000);
  assert.ok(h.undoBtn(), 'hover pauses expiry');
  h.msg.listeners.mouseleave();
  h.msg.listeners.focusin();
  tm.advance(60000);
  assert.ok(h.undoBtn(), 'focus pauses expiry');
  h.msg.listeners.focusout();
  tm.advance(10000);
  assert.equal(h.undoBtn(), null);
});
