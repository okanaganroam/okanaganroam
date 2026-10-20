// Round 12 (2026-10-20): phone and accessibility fixes from site review pass 11 (items 2 and 7).
// - Venue Visit Website / Get Directions / Call buttons are 44px again on phones (the #419 line height made them 39px).
// - In-page links honour a target's scroll-margin-top (planner day tabs landed under the sticky bars).
// - Planner: badge row next to "+N", 44px breadcrumb and stop titles, French card buttons (CSS in trip-planner-v3-page.js).
// - Event pages: French Google Agenda button on one line, focusable date list, phone-sized hero.
// - /my-trip popups clear of the zoom buttons; golf "At a glance" labels at AA and in French; What's On current chip AA;
//   no-JS owner photo strip; /map tile preconnect.
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
const golfFr = require('../golf-glance-fr.js');

const venueId = db.prepare(`INSERT INTO venues (name, region, type, description, description_fr, address, latitude, longitude, slug, website, phone)
  VALUES ('Fixture Bench Winery', 'naramata', 'winery', 'A fixture winery used only by the test suite.', 'Un vignoble fictif pour les tests.',
  '1 Test Rd', 49.59, -119.59, 'fixture-bench-winery', 'https://example.com/winery', '250-555-0100')`).run().lastInsertRowid;
db.prepare(`INSERT INTO venues (name, region, type, description, description_fr, address, latitude, longitude, slug, website, phone)
  VALUES ('Kelowna Golf & Country Club', 'kelowna', 'golf', 'A fixture golf club.', 'Un club de golf fictif.',
  '1 Golf Rd', 49.9, -119.45, 'kelowna-golf-country-club', 'https://example.com/golf', '250-555-0101')`).run();
const eventId = db.prepare(`INSERT INTO events (name, slug, region, description, start_datetime, end_datetime, venue_id, website)
  VALUES ('Fixture Harvest Concert', 'fixture-harvest-concert', 'naramata', 'A fixture concert.', '2099-06-01 19:00:00', '2099-06-01 22:00:00', ?, 'https://example.com/tickets')`).run(venueId).lastInsertRowid;
for (const d of ['2099-06-01', '2099-06-08']) db.prepare(`INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, '19:00', '22:00')`).run(eventId, d, d);

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

// WCAG contrast; an rgba() colour is first laid over its background.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const over = ([r, g, b, a], bg) => [r, g, b].map((c, i) => c * a + bg[i] * (1 - a));
const lum = (c) => {
  const l = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('venue page: Website / Directions / Call buttons keep a 44px floor on phones (#419 regression)', async () => {
  const html = await get('/naramata/wineries/fixture-bench-winery');
  assert.match(html, /<a class="cta" href="https:\/\/example\.com\/winery"/);
  const phone = html.indexOf('body.golf-page .venue-cta-row .card-action, body.golf-page .venue-cta-row .cta { line-height: 1.25; }');
  const floor = html.indexOf('body.golf-page .venue-cta-row .card-action, body.golf-page .venue-cta-row .cta { min-height: 44px; box-sizing: border-box; padding: 6px 12px; }');
  assert.ok(phone > -1 && floor > phone, 'the 44px floor follows (and so wins over) the tight line height');
  // The floor sits inside the same phone media block as the line height.
  const block = html.slice(html.lastIndexOf('@media (max-width: 640px)', phone), floor);
  assert.doesNotMatch(block.slice(block.indexOf('{') + 1), /^\s*\}\s*$/m, 'no media block closes between them');
  // French pages share the rule (same renderer).
  const fr = await get('/fr/naramata/wineries/fixture-bench-winery');
  assert.ok(fr.includes('.venue-cta-row .cta { min-height: 44px; box-sizing: border-box; padding: 6px 12px; }'));
});

// The in-page link handler from public/scripts/app.js, run on a stub page.
function hashHandler() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  const start = src.indexOf("document.addEventListener('click', function(e){\n  var link = e.target.closest('a[href^=\"#\"]');");
  assert.ok(start > -1, 'the handler is still there');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = src.indexOf(';', i) + 1; break; } }
  return src.slice(start, end);
}
function runHash({ headerH, margin, targetTop, scrollY = 0 }) {
  let handler = null; let scrolled = null;
  const target = { getBoundingClientRect: () => ({ top: targetTop }) };
  const ctx = {
    document: {
      addEventListener: (type, fn) => { if (type === 'click') handler = fn; },
      querySelector: (s) => (s === 'header' ? { offsetHeight: headerH } : null),
      getElementById: (id) => (id === 't3-day-2' ? target : null),
    },
    window: { scrollY, scrollTo: (o) => { scrolled = o; }, getComputedStyle: () => ({ scrollMarginTop: margin }) },
    history: { pushState() {} },
    setInterval, clearInterval,
  };
  vm.runInNewContext(hashHandler(), ctx);
  const link = { getAttribute: () => '#t3-day-2' };
  handler({ target: { closest: () => link }, preventDefault() {} });
  return scrolled;
}

test('in-page links: a target\'s scroll-margin-top wins over header + 12 when larger (planner day tabs)', () => {
  // The planner day: 140px scroll margin under a 53px header (it used to land at 65px, under the sticky day tabs).
  assert.equal(runHash({ headerH: 53, margin: '140px', targetTop: 900, scrollY: 100 }).top, 900 + 100 - 140);
  // An ordinary target keeps header + 12.
  assert.equal(runHash({ headerH: 53, margin: '0px', targetTop: 900 }).top, 900 - 65);
  // A small scroll margin never brings it closer than header + 12.
  assert.equal(runHash({ headerH: 80, margin: '20px', targetTop: 500 }).top, 500 - 92);
});

test('planner (trip-planner-v3-page.js): badges centred, 44px crumb and stop titles, French card buttons', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes('.t3-card h4 a { display: inline-block; padding: 10px 0; margin: -10px 0; }'), '24px title + 20px = 44px');
  assert.ok(src.includes('.t3-crumb a { display: inline-block; padding: 13px 5px; margin: -13px -5px; }'), '35x18 Home -> 45x44');
  assert.ok(src.includes('.t3-badges { align-items: center; }'));
  assert.ok(src.includes('html[lang="fr"] .t3-plan .t3-actions > .trip-btn { flex-basis: 100%; }'));
});

test('event page: date list focusable, Google Agenda gets its own row, hero asks for a phone-sized copy', async () => {
  const html = await get('/naramata/events/fixture-harvest-concert');
  assert.match(html, /<section class="event-dates" aria-labelledby="eventDatesHeading" tabindex="0">/);
  assert.ok(html.includes('.event-aside .event-dates:focus-visible {'));
  assert.ok(html.includes('.event-cta-row > .event-cta-primary ~ .cta:last-child:nth-child(even),'));
  // Tickets + Directions + Add to calendar + Google: the Google button is child 4 (even), alone on the last row.
  const row = html.slice(html.indexOf('<div class="event-cta-row">'), html.indexOf('</div>', html.indexOf('<div class="event-cta-row">')));
  const ctas = row.match(/<a class="cta[^"]*"/g);
  assert.equal(ctas.length, 4);
  assert.match(ctas[0], /event-cta-primary/);
  const fr = await get('/fr/naramata/events/fixture-harvest-concert');
  assert.match(fr, /Ajouter à Google Agenda/);
  assert.match(fr, /tabindex="0"/);
  const sizes = '(max-width: 640px) and (min-resolution: 2dppx) 260px, (max-width: 640px) calc(100vw - 32px), (max-width: 860px) 100vw, 1200px';
  const heroImg = /<div class="event-hero"><img [^>]*>/.exec(html)[0];
  if (/srcset=/.test(heroImg)) assert.ok(heroImg.includes(`sizes="${sizes}"`), heroImg);
  else assert.ok(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').includes(`const EVENT_HERO_SIZES = '${sizes}';`));
  // 260px x 3 = 780 <= 800w: a 3x phone takes the 800px copy.
  assert.ok(260 * 3 <= 800);
});

test('/my-trip: popups pan clear of the zoom buttons and fit a 320px phone', async () => {
  const html = await get('/my-trip');
  assert.ok(html.includes("{ autoPanPaddingTopLeft: [66, 12], maxWidth: Math.max(120, Math.min(300, (box.clientWidth || 400) - 140)) }"));
  assert.ok(html.includes('body.my-trip-page .leaflet-popup-content { min-width: 0; }'));
  const fr = await get('/fr/my-trip');
  assert.ok(fr.includes('autoPanPaddingTopLeft: [66, 12]'));
});

test('golf "At a glance": labels at AA contrast, and the card on French pages in French', async () => {
  const theme = app.renderGolfVenuePolishStyles();
  const m = /body\.golf-page \.golf-glance dt \{[^}]*color: rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(theme);
  assert.ok(m, 'dt colour found');
  const card = rgb('#fffcf6');
  assert.ok(contrast(over([+m[1], +m[2], +m[3], +m[4]], card), card) >= 4.5, 'dt label passes AA on the card');

  const en = await get('/kelowna/golf/kelowna-golf-country-club');
  assert.match(en, /<h2>At a glance<\/h2>[\s\S]*<dt>Course<\/dt><dd>18 holes · par 72 · parkland<\/dd>/);
  const fr = await get('/fr/kelowna/golf/kelowna-golf-country-club');
  assert.match(fr, /<div class="venue-section golf-glance">\s*<h2>En bref<\/h2>/);
  assert.match(fr, /<dt>Parcours<\/dt><dd>18 trous · par 72 · parcours de type parc<\/dd>/);
  assert.match(fr, /<dt>Accès<\/dt><dd>Privé, membres seulement<\/dd>/);
  assert.match(fr, /<dt>Fondé en<\/dt><dd>1920 \(A\.V\. Macan\)<\/dd>/);
  assert.doesNotMatch(fr.slice(fr.indexOf('golf-glance'), fr.indexOf('</dl>', fr.indexOf('golf-glance'))), /At a glance|<dt>Course<|Private, members/);

  // Every curated fact has French; a missing one would stay English with lang="en".
  for (const [key, facts] of Object.entries(app.GOLF_AT_A_GLANCE_FACTS)) {
    for (const [lbl, val] of facts) {
      const [l, v, english] = golfFr.frGlanceFact(lbl, val);
      assert.equal(english, false, `${key}: "${val}" has no French`);
      assert.ok(golfFr.GOLF_GLANCE_FR_LABELS[lbl], `${key}: label "${lbl}" has no French`);
      assert.ok(l && v);
    }
  }
  const [, v, english] = golfFr.frGlanceFact('Course', 'A brand-new fact');
  assert.equal(v, 'A brand-new fact');
  assert.equal(english, true);
  const html = app.golfAtAGlanceHtml({ type: 'golf', region: 'kelowna', slug: 'kelowna-golf-country-club' }, true);
  assert.match(html, /<h2>En bref<\/h2>/);
  assert.doesNotMatch(html, /lang="en"/);
});

test('What\'s On: the current place chip is AA (no faded opacity)', () => {
  const css = app.renderWhatsOnStyles();
  assert.doesNotMatch(css, /\.whatson-browse-list span \{ opacity: \.6; \}/);
  const m = /body\.whatson-page \.whatson-browse-list span \{ background: transparent; border: [^;]+; color: rgba\((\d+),(\d+),(\d+),([\d.]+)\); \}/.exec(css);
  assert.ok(m, 'the chip has its own colour');
  for (const bg of ['#fbf8f2', '#f5f3ed']) {
    const b = rgb(bg);
    assert.ok(contrast(over([+m[1], +m[2], +m[3], +m[4]], b), b) >= 4.5, `current chip on ${bg}`);
  }
});

test('owner photo strip without JavaScript: the waiting image is hidden, the loader can still find it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('.vg-thumb img[data-src]:not([src]) { position: absolute; inset: 0; visibility: hidden; }'));
  // The loader skips images without a layout box, so the rule must not use display:none.
  assert.doesNotMatch(src, /\.vg-thumb img\[data-src\]:not\(\[src\]\) \{[^}]*display: none/);
});

test('/map: tile hosts preconnected, first tiles fetched at high priority', async () => {
  const html = await get('/map');
  const head = html.slice(0, html.indexOf('</head>'));
  for (const s of ['a', 'b', 'c']) assert.ok(head.includes(`<link rel="preconnect" href="https://${s}.tile.openstreetmap.org">`), s);
  assert.ok(html.includes(".on('tileloadstart', function(e){ if (firstTiles && e.tile && e.tile.setAttribute) e.tile.setAttribute('fetchpriority', 'high'); })"));
  assert.ok(html.includes(".once('load', function(){ firstTiles = false; })"));
});
