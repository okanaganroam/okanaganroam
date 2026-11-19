// Indoor test 8 (2026-11-19; Gary runs a 5-pin bowling centre in Kelowna: $6.50 a game, $45 a lane an hour, shoes extra,
// cosmic bowling Friday and Saturday nights, leagues fill the lanes on weeknights, a licensed lounge and an arcade corner).
// Each fix from his report, checked with the real setup page script and real taps (tests/setup-sim.js), Build My Trip,
// search and the public page. His Help questions, and every indoor kind's, are in tests/indoor-help-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test8-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Mon–Thu 10–11 PM, Fri–Sat 10 AM–1 AM, Sun 10–10 (his open-door hours; leagues are a Good to know line).
const HOURS = JSON.stringify({ mon: [['10:00', '23:00']], tue: [['10:00', '23:00']], wed: [['10:00', '23:00']], thu: [['10:00', '23:00']], fri: [['10:00', '01:00']], sat: [['10:00', '01:00']], sun: [['10:00', '22:00']] });
const STORY = 'Kelowna’s home of 5-pin bowling since 1962: 24 lanes, an arcade corner and a licensed lounge.';
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T8 Fixture ${++n}`, slug: `indoor-t8-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.49,
  address: `${100 + n} Harvey Ave, Kelowna, BC`, phone: '250-555-0188', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 8 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.81.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);

// Gary's place, his own answers; research text where a test needs it.
const gary = async (o = {}, research = null) => {
  const v = mk('indoor', { name: `Okanagan Lanes T8 ${n + 1}`, cuisine: 'Bowling alley', description: STORY, ...o });
  if (research) db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(research));
  const t = tokenFor(v.id);
  return { v, t };
};

test('2. Groups: research text plus two chips over 180 trims research, never his taps, keeps ";", says so in one line; clearing the box resets the sizes', async () => {
  const research = { rows: [{ label: 'Groups', text: 'Party room for up to 30 guests; private bookings and banquets on request. Lane rentals for 12 to 60 people, with pizza and pitchers; call the front desk for packages.' }], source_url: 'https://example.com/', checked_at: '2026-10-31' };
  const { v, t } = await gary({}, research);
  await ok(change(t, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h', book: 'busy', age: 'all' } }));
  const g = await openSetup(base, t, { hash: 'groups' });
  const box = () => g.doc.getElementById('suGroupsLine');
  assert.match(box().value, /^Party room for up to 30 guests; private bookings/);
  const chips = IK.indoorKindText(['bowling'], 'en').groups.chips;
  await g.click(`[data-quick="${chips[0]}"]`);
  // The first chip keeps research's own punctuation (";" stays ";").
  assert.match(box().value, /^Party room for up to 30 guests; private bookings/);
  assert.ok(box().value.includes(chips[0]));
  await g.click(`[data-quick="${chips[1]}"]`);
  const val = box().value.trim();
  assert.ok(val.length <= 180, `${val.length}: ${val}`);
  assert.ok(val.includes(chips[0]) && val.includes(chips[1]), `both taps kept: ${val}`);
  // One line says what came out.
  const note = g.doc.getElementById('suGroupsLineTrim');
  assert.ok(note && !note.hidden, 'the note shows');
  assert.match(note.textContent, /we took out part of the line we found online/);
  // A size: punctuation kept, the size pressed; then clearing the box un-presses it.
  await g.click('[data-bgroup="10"]');
  assert.match(box().value, /Groups of 10 or more/);
  assert.equal(g.doc.querySelector('[data-bgroup="10"]').getAttribute('aria-pressed'), 'true');
  await g.type('suGroupsLine', '');
  assert.equal(g.doc.querySelector('[data-bgroup="10"]').getAttribute('aria-pressed'), 'false');
  for (const c of chips) assert.equal(g.doc.querySelector(`[data-quick="${c}"]`).getAttribute('aria-pressed'), 'false', c);
  // His taps again, then Save: what is saved has both chips.
  await g.click(`[data-quick="${chips[0]}"]`);
  await g.click('[data-bgroup="10"]');
  await g.click('brewGroupsSave').catch(() => null);
  await g.settle();
  const saved = (JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id) || {}).info || '{}').rows || []).find((r) => r.label === 'Groups');
  assert.ok(saved && saved.text.includes(chips[0]) && /Groups of 10 or more/.test(saved.text), JSON.stringify(saved));
});

test('2b. Good to know: research text plus chips over the limit trims research, never the taps', async () => {
  const long = 'Bowling shoes are required on the lanes and are available to rent at the front counter; socks recommended. Outside food and drink are not permitted anywhere in the building.';
  const research = { rows: [{ label: 'Good to know', text: long }], source_url: 'https://example.com/', checked_at: '2026-10-31' };
  const { t } = await gary({}, research);
  await ok(change(t, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all' } }));
  const g = await openSetup(base, t, { hash: 'bring' });
  const chipEls = g.doc.querySelectorAll('[data-quick][data-box="suBring"]');
  assert.ok(chipEls.length >= 3, 'bowling has Good to know chips');
  const max = g.cfg.bringMax || 180;
  for (const c of chipEls.slice(0, 3)) await g.click(`[data-quick="${c.getAttribute('data-quick')}"]`);
  const val = g.doc.getElementById('suBring').value.trim();
  for (const c of chipEls.slice(0, 3)) assert.ok(val.includes(c.getAttribute('data-quick')), `${c.getAttribute('data-quick')} kept: ${val}`);
  assert.ok(val.length <= max, `${val.length} > ${max}: ${val}`);
});
