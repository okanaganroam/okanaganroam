// Indoor test 11 (2026-11-19; Kim, staff at a non-profit science centre in Vernon: hands-on exhibits, a planetarium, live
// animals, Science Saturdays demos at 11 and 2; adult $12, child $9, family $38; open Tuesday to Saturday, daily in July and
// August and on long-weekend Mondays). Each fix from her report, checked with the real setup page script and real taps
// (tests/setup-sim.js), Build My Trip, search and the public pages. Her Help questions are in the Help matrix
// (tests/indoor-help-matrix.test.js); the name-word requests of every kind in tests/indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test11-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const HOURS = JSON.stringify({ mon: null, tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: null });
const STORY = 'The Okanagan Science Centre is a hands-on science centre in Polson Park with rotating interactive exhibits, planetarium shows and live animals.';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T11 Fixture ${++n}`, slug: `indoor-t11-${n}`, region: 'vernon', type: 'indoor', latitude: 50.2608 + n / 3000, longitude: -119.2702,
  address: `${2700 + n} Hwy 6, Vernon, BC`, phone: '250-555-0136', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 11 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.84.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en', now = NOW) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const holidaysOf = (id) => { const r = db.prepare('SELECT holidays FROM venue_hours_extra WHERE venue_id = ?').get(id); return !!(r && r.holidays); };

// Kim's place: her story, her answers.
const kim = async (o = {}, info = {}) => {
  const v = mk({ name: `Okanagan Science Centre T11 ${n + 1}`, cuisine: 'Museum', description: STORY, kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all', ...info }, indoor_price: 12 }));
  return { v, t };
};
const FAMILY_DAY = new Date('2027-02-15T12:00:00-08:00');

test('1. Long-weekend Mondays: "Open on holidays" on the usual hours screen (a day is closed), saved as hours_holidays; Family Day shows open on the page and in Build My Trip', async () => {
  const { v, t } = await kim();
  // Before: closed on Family Day.
  assert.match(plain(pageHtml(v, 'en', FAMILY_DAY)), /Closed/);
  const g = await openSetup(base, t, { hash: 'hours:edit' });
  assert.ok(g.has('#suMainHol'), g.text().slice(0, 400));
  assert.match(g.text(), /Open on a holiday that falls on a closed day\? Open on holidays \(stat holidays and Christmas week\)/);
  await g.click('mainHolidays');
  assert.equal(g.doc.getElementById('suMainHol').getAttribute('aria-pressed'), 'true');
  await g.click('hoursNext');
  await g.click('yearAll');
  assert.equal(holidaysOf(v.id), true);
  // The status line on Family Day (a Monday): open, with her Saturday hours. A usual Monday stays closed.
  const fam = plain(pageHtml(v, 'en', FAMILY_DAY));
  assert.match(fam, /Open now|Open ·|Open until|Closes 5/i);
  assert.doesNotMatch(fam.slice(0, fam.indexOf('Hours') > 0 ? fam.indexOf('Hours') : 400), /Closed today/);
  const usual = app.venueOpenOn ? null : null; void usual;
  const wk = JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-02-15'));
  assert.deepEqual(wk.mon, [['10:00', '17:00']]);
  assert.equal(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-02-22')).mon, null);
  // Build My Trip on Family Day plans her.
  const p = app.runTripPlan({ text: 'science centre in Vernon on Family Day' }, NOW);
  assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  // Turning it off again.
  const g2 = await openSetup(base, t, { hash: 'hours:edit' });
  assert.equal(g2.doc.getElementById('suMainHol').getAttribute('aria-pressed'), 'true');
  await ok(change(t, { hours_holidays: false }));
  assert.equal(holidaysOf(v.id), false);
  // Open every day: no choice to make.
  const { t: t2 } = await kim();
  await ok(change(t2, { hours: { mon: [['10:00', '17:00']], tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: [['10:00', '17:00']] } }));
  const g3 = await openSetup(base, t2, { hash: 'hours:edit' });
  assert.ok(!g3.has('#suMainHol'));
});

test('1b. Closures: a holiday on a closed Monday is tappable as "Open this holiday" (turns on Open on holidays for all, saved straight away), EN + FR', async () => {
  const { v, t } = await kim();
  const g = await openSetup(base, t, { hash: 'closures' });
  if (g.has('[data-act="holAll"]')) await g.click('holAll');
  assert.ok(g.has('[data-holopen="family"]'), g.text().slice(0, 600));
  assert.match(g.text(), /You’re closed Mondays · Open this holiday/);
  await g.click('[data-holopen="family"]');
  assert.equal(holidaysOf(v.id), true);
  assert.match(g.text(), /Open \(Open on holidays is on\)/);
  assert.match(g.text(), /Open on holidays is on: stat holidays and Christmas week days you’re usually closed show open/);
  // Christmas Day stays a closure tile: a closure always wins.
  assert.ok(g.has('[data-hol="xmas"]'));
  await g.click('[data-hol="xmas"]');
  await g.click('closuresSave');
  assert.equal(app.weekJsonOn(app.getVenue(v.id), '2026-12-25') !== null, true);
  const f = await openSetup(base, t, { hash: 'closures', lang: 'fr' });
  if (f.has('[data-act="holAll"]')) await f.click('holAll');
  assert.match(f.text(), /Ouvert \(Ouvert les jours fériés est activé\)/);
  // Tapping an open one turns it off.
  await f.click('[data-holopen="family"]');
  assert.equal(holidaysOf(v.id), false);
  assert.match(f.text(), /Ouvrir ce jour férié/);
});

test('3. "Vernon on a Monday in July" is planned on the next Monday in July (day plan and list, EN + FR)', async () => {
  const { v, t } = await kim({ name: 'Okanagan Science Centre T11 July' });
  // Open daily in July and August.
  const daily = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]]));
  await ok(change(t, { hours_seasons: [{ from: '07-01', to: '08-31', label: '', hours: daily }] }));
  for (const q of ['Vernon on a Monday in July', 'Vernon un lundi en juillet']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok((p.notes || []).includes('Trip starts on 2027-07-05 (Okanagan calendar date).'), `${q}: ${JSON.stringify(p.notes)}`);
    assert.ok((p.days || []).length === 1 && p.days[0].date === '2027-07-05', q);
  }
  for (const q of ['science centre in Vernon on a Monday in July', 'centre des sciences à Vernon un lundi en juillet']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), `${q}: ${itemsOf(p).map((x) => x.venue.name).join(' | ')} ${JSON.stringify(p.warnings)}`);
  }
  // A plain Monday is still the coming one.
  const mon = app.runTripPlan({ text: 'Vernon on Monday' }, NOW);
  assert.ok((mon.notes || []).includes('Trip starts on 2026-11-23 (Okanagan calendar date).'), JSON.stringify(mon.notes));
});

test('4. Her own words rank her first: "science centre Vernon" and "hands-on science for kids Vernon" (list and itinerary) ahead of a better-rated weekends-only museum; one open that day beats one closed', async () => {
  const weekendsOnly = JSON.stringify({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: [['10:00', '16:00']], sun: [['10:00', '16:00']] });
  const other = mk({ name: 'Canadian Wildlife Museum T11', cuisine: 'Museum', description: 'Wildlife mounts and dioramas.', hours: weekendsOnly, rating: 4.9, reviews: 800, kid_friendly: 1 });
  await ok(change(tokenFor(other.id), { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 10 }));
  const { v } = await kim({ name: 'Okanagan Science Centre T11 Words', rating: 4.2, reviews: 60 });
  for (const q of ['science centre Vernon', 'hands-on science for kids Vernon', 'hands on science Vernon', 'planetarium in Vernon', 'centre des sciences à Vernon']) {
    const items = itemsOf(app.runTripPlan({ text: q }, NOW)).filter((x) => x.venue.type === 'indoor');
    assert.equal(items[0] && items[0].venue.id, v.id, `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
  }
  for (const q of ['Vernon science centre early morning', 'science centre in Vernon on Thursday morning', 'a museum in Vernon on Thursday morning']) {
    const items = itemsOf(app.runTripPlan({ text: q }, NOW)).filter((x) => x.venue.type === 'indoor');
    assert.ok(items.length && items[0].venue.id !== other.id, `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
  }
});

const RESEARCH = (id) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(id, JSON.stringify({ rows: [
  { label: 'Known for', text: 'Hands-on science museum: Vern the animatronic ankylosaurus, dino dig pit, axolotls and a planetarium.' },
  { label: 'Prices', text: 'Adults $12; seniors, students and youth 3 to 18 $7; under 3 free; family (2 adults, 2 kids) $35. Plus GST.' },
  { label: 'Booking', text: 'Buy tickets in person at the front desk. Planetarium shows need pre-registration. Groups of 10+ book 7 days ahead.' },
  { label: 'Ages', text: 'Kids under 16 must be with an adult. Rocks to Roots dig and garden area is for ages 5 and under.' },
  { label: 'Groups', text: 'Birthday parties from $250 for up to 12 kids, 2 hours with a party room; exclusive after-hours party $500.' },
  { label: 'Good to know', text: 'Wear socks for the dino dig pit. No elevator to level 2 or the planetarium. Sensory backpacks and earmuffs to borrow.' }],
  source_url: 'https://okscience.ca/', checked_at: '2026-10-31' }));
const rowsOf = (id) => JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id).info);

test('5. Good to know and Groups pre-fill research as found online; her walk-in answer keeps "Planetarium shows need pre-registration" as a Good to know suggestion; a clashing sentence is flagged, the rest pre-filled', async () => {
  const v = mk({ name: 'Okanagan Science Centre T11 Research', cuisine: 'Museum', description: STORY });
  RESEARCH(v.id);
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 12 }));
  // Her walk-in answer replaced research's Booking line; research's Good to know was set aside (the box was full).
  assert.ok(!rowsOf(v.id).rows.some((r) => r.label === 'Good to know'));
  const g = await openSetup(base, t, { hash: 'bring' });
  assert.match(g.text(), /We found this online\. Check it\./);
  assert.equal(g.doc.getElementById('suBring').value, 'Wear socks for the dino dig pit. No elevator to level 2 or the planetarium. Sensory backpacks and earmuffs to borrow. Planetarium shows need pre-registration.');
  // She checks it and saves: hers now (owner's taps are never trimmed; the research note goes).
  await g.click('bringSave');
  const gtk = rowsOf(v.id).rows.find((r) => r.label === 'Good to know');
  assert.match(gtk.text, /Planetarium shows need pre-registration\./);
  assert.ok(rowsOf(v.id).owner_labels.includes('Good to know'));
  const g2 = await openSetup(base, t, { hash: 'bring' });
  assert.doesNotMatch(g2.text(), /We found this online/);
  // Groups: research's line, said to be found online.
  const gr = await openSetup(base, t, { hash: 'groups' });
  assert.match(gr.text(), /We found this online\. Check it, and change any words that aren’t right\. /);
  assert.match(gr.text(), /Birthday parties from \$250/);
  const grFr = await openSetup(base, t, { hash: 'groups', lang: 'fr' });
  assert.match(grFr.text(), /Nous avons trouvé ceci en ligne/);
  // Round 6's flag: a research sentence that contradicts her answers (by appointment, while she said walk-ins) is shown as
  // found online and kept out of her box; the other sentences are pre-filled.
  const w = mk({ name: 'Okanagan Science Centre T11 Clash', cuisine: 'Museum', description: STORY });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(w.id, JSON.stringify({ rows: [{ label: 'Good to know', text: 'Gallery is by appointment only. Free parking out back.' }], source_url: 'https://example.com', checked_at: '2026-10-31' }));
  const tw = tokenFor(w.id);
  await ok(change(tw, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 12 }));
  const c = await openSetup(base, tw, { hash: 'bring' });
  assert.equal(c.doc.getElementById('suBring').value, 'Free parking out back.');
  assert.match(c.text(), /“Gallery is by appointment only\.”/);
});
