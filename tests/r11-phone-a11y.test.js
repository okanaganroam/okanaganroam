// Round 11 (2026-10-20): phone and accessibility fixes from site review pass 10, item 5.
// - Event page "Tickets & info" is paper on plum again (it was navy on plum, 1.42:1).
// - Add to trip buttons carry aria-pressed and hide their emoji from screen readers (app.js syncButtons).
// - Build My Trip cards: venue-specific Add to trip labels and a named "+N" button, in English and French.
// - 44px tap targets on phones (What's On, event pages, /guides, /map, /my-trip, homepage stats, breadcrumbs, owner footer).
// - /fr homepage headline and near-me button keep a 16px gutter on narrow phones; even venue action rows.
// - The phone menu's EN / FR row on every page with a twin, not only the homepage and /browse.
// Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.OKR_TODAY_OVERRIDE = '2026-07-15';

const app = require('../server.js');
const db = require('../db.js');

const venueId = db.prepare(`INSERT INTO venues (name, region, type, description, description_fr, address, latitude, longitude, slug, website, phone)
  VALUES ('Fixture Bench Winery', 'naramata', 'winery', 'A fixture winery used only by the test suite.', 'Un vignoble fictif pour les tests.',
  '1 Test Rd', 49.59, -119.59, 'fixture-bench-winery', 'https://example.com/winery', '250-555-0100')`).run().lastInsertRowid;
const eventId = db.prepare(`INSERT INTO events (name, slug, region, description, start_datetime, end_datetime, venue_id, website)
  VALUES ('Fixture Harvest Concert', 'fixture-harvest-concert', 'naramata', 'A fixture concert.', '2099-06-01 19:00:00', '2099-06-01 22:00:00', ?, 'https://example.com/tickets')`).run(venueId).lastInsertRowid;
db.prepare(`INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, '2099-06-01', '2099-06-01', '19:00', '22:00')`).run(eventId);

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => {
  const res = await fetch(base + p);
  assert.equal(res.status, 200, `${p} -> ${res.status}`);
  return res.text();
};
// A page's CSS: its inline <style> blocks plus the shared stylesheets it links (/styles/shared/<name>.css).
const pageCss = async (html) => {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const linked = await Promise.all([...html.matchAll(/<link rel="stylesheet" href="(\/styles\/shared\/[^"]+)"/g)].map(async (m) => (await fetch(base + m[1].replace(/&amp;/g, '&'))).text()));
  return inline.concat(linked).join('\n');
};

// WCAG contrast from the site's own tokens.
const TOKENS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles', 'tokens.css'), 'utf8');
const token = (name) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)[1];
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('event page: "Tickets & info" is paper on plum (4.5:1+), not navy on plum', async () => {
  assert.ok(contrast(token('ref-navy'), token('plum')) < 2, 'navy on plum is the 1.42:1 the review found');
  assert.ok(contrast(token('paper'), token('plum')) >= 4.5, 'paper on plum passes AA');
  const theme = app.renderGolfThemeStyles();
  const navy = theme.indexOf('body.golf-page a { color: var(--ref-navy); }');
  const hover = theme.indexOf('body.golf-page a:hover { color: var(--ref-gold); }');
  const cta = theme.indexOf('body.golf-page a.cta, body.golf-page a.cta:where(:hover, :focus-visible) { color: var(--paper); }');
  const secondary = theme.indexOf('body.golf-page a.cta:where(.secondary), body.golf-page a.cta:where(.secondary:hover, .secondary:focus-visible) { color: var(--plum); }');
  assert.ok(navy > -1 && hover > navy, 'the themed link colours are still there');
  // Same specificity as "body.golf-page a" / "a:hover" (0,2,2), so the later rule wins; the venue CTA row's own
  // "body.golf-page .venue-cta-row .cta" (0,3,1) still out-ranks it.
  assert.ok(cta > hover && secondary > cta, 'the .cta colours come after, so they win the tie');
  for (const p of ['/naramata/events/fixture-harvest-concert', '/fr/naramata/events/fixture-harvest-concert']) {
    const html = await get(p);
    assert.match(html, /<a class="cta event-cta-primary" href="https:\/\/example\.com\/tickets"[^>]*>(Tickets &amp; info|Billets et infos) (&#8599;|\u2197)<\/a>/, p);
    const css = await pageCss(html);
    assert.ok(css.includes('body.golf-page a.cta, body.golf-page a.cta:where(:hover, :focus-visible) { color: var(--paper); }'), `${p}: the fix reaches the page`);
    assert.match(css, /\.event-cta-row \.cta \{ display: flex; align-items: center; justify-content: center; min-height: 44px;/, `${p}: 44px buttons`);
    assert.match(css, /body\.golf-page\.event-page \.event-aside \.detail-row a \{ display: inline-block; padding: 12px 0; margin: -12px 0; \}/, `${p}: 44px detail links`);
    assert.match(css, /\.event-related-list li > a, \.event-related-all a \{ display: inline-block; padding: 11px 0; \}/, `${p}: 44px related links`);
  }
});

// ---- app.js: the real trip-tray module in a vm --------------------------------------------------------------------
const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const START = '/* ---------- Trip planner: build a multi-stop route across saved venues ---------- */';
const END = '/* ---------- Build My Trip, Stage 2: /trip planner page';
const TRAY_JS = APP_JS.slice(APP_JS.indexOf(START), APP_JS.indexOf(END));
class El {
  constructor(className = '') { this.className = className; this.dataset = {}; this.attrs = {}; this._html = ''; this.style = {}; this.disabled = false; }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); }
  get textContent() { return this._html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
  set textContent(v) { this._html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener() {}
  querySelector() { return null; }
  contains() { return false; }
  closest(sel) { return this.className.split(' ').includes(sel.replace(/^\./, '').split(',')[0].trim()) ? this : null; }
  get classList() {
    const self = this; const set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    return {
      contains: (c) => set().has(c),
      add: (c) => { const s = set(); s.add(c); self.className = [...s].join(' '); },
      remove: (c) => { const s = set(); s.delete(c); self.className = [...s].join(' '); },
      toggle: (c, f) => { const s = set(); const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); self.className = [...s].join(' '); return on; },
    };
  }
}
function bootTray(strings, saved, buttons) {
  const els = {}; for (const id of ['tripTrayToggle', 'tripTrayPanel', 'tripTrayList', 'tripTrayCount', 'tripRouteBtn', 'tripClearBtn', 'tripTrayMessage']) els[id] = new El();
  const store = new Map([['okanaganTrip', JSON.stringify(saved)]]);
  let docClick = null;
  const ctx = {
    window: { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, CARD_REGION_LABEL: {} },
    document: { getElementById: (id) => els[id] || null, querySelectorAll: (sel) => (sel === '.trip-btn' ? buttons : []), addEventListener: (type, fn) => { if (type === 'click') docClick = fn; } },
    t: (k) => strings[k] || k, setTimeout, clearTimeout, parseInt, JSON, String, Array, Object, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(TRAY_JS, ctx);
  return { click: (target) => docClick({ target }) };
}
const tripButton = (name, ref) => { const b = new El('trip-btn'); b.dataset.tripName = name; b.dataset.tripRegion = 'kelowna'; b.dataset.tripQuery = name; b.dataset.tripRef = ref; return b; };

test('app.js: Add to trip buttons say whether the stop is in the trip (aria-pressed), and the emoji is aria-hidden', () => {
  const en = { 'trip.addToTrip': '\u{1F9F3} Add to trip', 'trip.inTrip': '✓ In trip', 'trip.emptyState': 'No venues added yet.' };
  const a = tripButton('Fixture Concert', 'event:1'), b = tripButton('Fixture Market', 'event:2');
  const t = bootTray(en, [{ name: 'Fixture Market', query: 'Fixture Market', region: 'kelowna', ref: 'event:2' }], [a, b]);
  assert.equal(a.getAttribute('aria-pressed'), 'false');
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  assert.equal(a.innerHTML, '<span aria-hidden="true">\u{1F9F3}</span> Add to trip');
  assert.equal(b.innerHTML, '<span aria-hidden="true">✓</span> In trip');
  t.click(a);
  assert.equal(a.getAttribute('aria-pressed'), 'true', 'adding presses it');
  assert.equal(a.textContent, '✓ In trip');
  t.click(b);
  assert.equal(b.getAttribute('aria-pressed'), 'false', 'removing releases it');
});

test('app.js: the French labels too', () => {
  const fr = { 'trip.addToTrip': '\u{1F9F3} Ajouter au voyage', 'trip.inTrip': '✓ Dans le voyage', 'trip.emptyState': 'Vide.' };
  const a = tripButton('Fixture Concert', 'event:1');
  bootTray(fr, [{ name: 'Fixture Concert', query: 'x', region: 'kelowna', ref: 'event:1' }], [a]);
  assert.equal(a.getAttribute('aria-pressed'), 'true');
  assert.equal(a.innerHTML, '<span aria-hidden="true">✓</span> Dans le voyage');
});

test('Build My Trip cards: Add to trip names the place, starts unpressed, and "+N" says what it shows (EN and FR)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes(`' aria-pressed="false" aria-label="' + esc(lang() === 'fr' ? 'Ajouter ' + v.name + ' au voyage' : 'Add ' + v.name + ' to trip') + '">'`), 'place cards');
  assert.ok(src.includes(`' aria-pressed="false" aria-label="' + esc(lang() === 'fr' ? 'Ajouter ' + e.name + ' au voyage' : 'Add ' + e.name + ' to trip') + '">'`), 'event cards');
  assert.ok(src.includes(`aria-label="' + esc(lang() === 'fr' ? 'Afficher ' + extra + ' autres caract\\u00e9ristiques' : 'Show ' + extra + ' more features') + '"`), '+N button');
  assert.match(src, /\.t3-details summary \{ cursor: pointer; font-weight: 700; padding: 11px 0; \}/, '"How this plan was made" is 44px');
});

test('Build My Trip page ships the labelled buttons', () => {
  const html = require('../trip-planner-v3-page.js').renderTripPlannerV3Page({ esc: (x) => String(x), regions: [], regionImages: {}, preview: false });
  assert.ok(html.includes('autres caract') && html.includes('more features'), 'the +N label');
  assert.ok(html.includes("'Ajouter ' + v.name + ' au voyage'") && html.includes("'Add ' + e.name + ' to trip'"), 'card labels');
});

test('/fr homepage: the headline wraps inside a 16px gutter on phones, and so does the near-me button', async () => {
  const html = await get('/fr');
  const css = await pageCss(html);
  assert.match(css, /@media \(max-width: 640px\) \{\n  \.hero-scenic-home \.hero-title \{ white-space: normal; text-wrap: balance; max-width: calc\(100% - 32px\);/);
  assert.match(css, /\.hero-scenic-home \.hero-near-me \{ max-width: calc\(100% - 32px\); box-sizing: border-box;/);
  assert.match(css, /\.home-stats a \{ display: inline-block; padding: 13px 0; margin: -13px 0; \}/, 'homepage stat links are 44px');
});

test('tap targets: /guides, guide chips, /map handle, /my-trip names and popup, breadcrumbs, owner footer', async () => {
  const guides = await pageCss(await get('/guides'));
  assert.match(guides, /\.guides-town summary \{[^}]*padding: 8px 0; min-height: 44px;/);
  assert.match(guides, /\.guides-town-links a \{ display: inline-flex; align-items: center; gap: 4px; min-height: 44px;/);
  assert.match(guides, /body\.golf-page nav\.breadcrumb a \{ display: inline-block; padding: 13px 5px; margin: -13px -5px; \}/, 'breadcrumbs on every themed page');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal((server.match(/body\.guide-page \.guide-more-chip \{ display: inline-flex; align-items: center; min-height: 44px;/g) || []).length, 2, 'both guide-chip rules');
  const map = await pageCss(await get('/map'));
  assert.match(map, /body\.map-page \.pm-handle \{[^}]*height: 44px;/);
  assert.match(map, /--pm-sheet-h: 168px;/);
  const trip = await pageCss(await get('/my-trip'));
  assert.match(trip, /body\.my-trip-page a\.mt-name \{ display: inline-block; padding: 10px 0; margin: -10px 0; \}/);
  assert.match(trip, /body\.my-trip-page \.leaflet-container a\.leaflet-popup-close-button \{ width: 44px; height: 44px;/);
  assert.match(trip, /body\.my-trip-page \.leaflet-popup-content a \{ display: inline-flex; align-items: center; min-height: 44px; \}/);
  const owner = await get('/owner/login');
  assert.match(owner, /body\.owner-page \.op-footer a \{[^}]*padding: 11px 4px; min-height: 44px;/);
});

test("What's On: the Further ahead names are 44px links on phones", async () => {
  const html = await get('/whats-on');
  const css = await pageCss(html);
  assert.match(css, /@media \(max-width: 640px\) \{\n    body\.whatson-page \.whatson-further-list li \{ margin: 0; \}\n    body\.whatson-page \.whatson-further-list a \{ display: inline-block; padding: 11px 0; \}/);
  assert.doesNotMatch(html, /<li style="margin:0 0 8px;break-inside:avoid">/, 'the row spacing moved to the stylesheet');
});

test('venue page: the phone action row buttons share a row height', async () => {
  const css = await pageCss(await get('/fr/naramata/wineries/fixture-bench-winery'));
  assert.match(css, /body\.golf-page \.venue-cta-row \{ display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px; flex-direction: initial; align-items: stretch; \}/);
  assert.match(css, /body\.golf-page \.venue-cta-row \.card-action, body\.golf-page \.venue-cta-row \.cta \{ line-height: 1\.25; \}/);
});

test('phone menu: the EN / FR row is on every page with a French twin, not only the homepage', async () => {
  const count = (s, x) => s.split(x).length - 1;
  for (const [p, href] of [
    ['/whats-on', '/fr/whats-on'], ['/fr/whats-on', '/whats-on'], ['/guides', '/fr/guides'], ['/map', '/fr/map'],
    ['/naramata/events/fixture-harvest-concert', '/fr/naramata/events/fixture-harvest-concert'],
    ['/naramata/wineries/fixture-bench-winery', '/fr/naramata/wineries/fixture-bench-winery'],
    ['/fr/naramata/wineries/fixture-bench-winery', '/naramata/wineries/fixture-bench-winery'],
  ]) {
    const html = await get(p);
    assert.equal(count(html, '<li class="nav-links-lang">'), 1, `${p}: one language row in the menu`);
    assert.ok(html.indexOf('class="nav-links-trip"') < html.indexOf('<li class="nav-links-lang">'), `${p}: right after Build My Trip`);
    assert.match(html, new RegExp(`id="langToggle" href="${href}"`), `${p}: the buttons press the switch to its twin`);
  }
  // A place without a French page keeps its header as before.
  db.prepare("INSERT INTO venues (name, region, type, description, slug) VALUES ('Fixture English Only', 'naramata', 'winery', 'English only.', 'fixture-english-only')").run();
  const en = await get('/naramata/wineries/fixture-english-only');
  assert.ok(!en.includes('<li class="nav-links-lang">') && !en.includes('id="langToggle"'));
});
