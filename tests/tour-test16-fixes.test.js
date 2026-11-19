// Whistler tour test 16 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour16-2026-11-18/REPORT.md: Tom,
// Coast Mountain Bear Tours: bear viewing by 4x4 May to October, a kids' price, a private vehicle, hotel pickup; a Galaxy A
// phone). The pickup button had been dead since test 11 (its only check read the source), Help missed his questions, "bear"
// search ranked him 10th, Build My Trip ignored "without a car", and a few setup screens said too much.
// The setup checks here run the real setup page script (tests/setup-sim.js): they press the buttons the screen drew.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) {} }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t16-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T16 ${++n}`, slug: `tour-t16-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 16 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.76.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const plan = (q, lang, now = NOW) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, now);

// Tom's typed tours (his final-state.json).
const TOURS = [{ name: 'Tours', items: [
  { name: 'Bear viewing tour, morning or evening', description: 'By 4x4. Leaves 7 AM and 5:30 PM daily. Pickup from village hotels. Sells out, book early.', price: '$149 adult, $99 kids 5 to 12', duration: '3 hours' },
  { name: 'Private vehicle, up to 6 people', description: '', price: '$895', duration: '3 hours' }] }];
const STORY = 'Family run since 2004. We take small groups out by 4x4 to see black bears in the Whistler valley, May to October. Morning and evening tours, with hotel pickup. Kids 5 and up welcome.';
async function tom(o = {}, info = {}, { tours = true, months = '5-10' } = {}) {
  const v = mk('tour', { name: `Coast Mountain Bear Tours ${n + 1}`, cuisine: 'Wildlife and bear viewing', rating: 4.8, reviews: 211, address: '4314 Main St, Whistler', latitude: 50.1172, longitude: -122.9543,
    description: STORY, description_fr: 'Visites guidées d’observation de l’ours noir dans la vallée de Whistler.', hours: JSON.stringify(WK('07:00', '20:30')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['wildlife'], length: '2-3h', book: 'week', age: '5', private: 895, year: 'seasonal', ...info } }));
  if (months) ok(await change(t, { open_months: months }));
  ok(await change(t, { tour_price: 149 }));
  if (tours) db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}

test('1. BLOCKER: "We pick you up" on Basics really saves (the button the screen drew, pressed), the page shows Pickup, and "No pickup" takes it off', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'basics' });
  assert.ok(sim.acts().includes('pickupOn:basics'), sim.acts().join(' | '));
  await sim.click('pickupOn:basics');
  assert.equal(app.venueTourInfo(v.id).pickup, true, 'tour_info.pickup saved');
  approveAll(v.id);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Pickup:? hotels in Whistler/, 'the page shows the Pickup row');
  assert.match(fr, /Prise en charge/);
  // Back on Basics, the button now offers to take it off, and that works too.
  const sim2 = await openSetup(base, t, { hash: 'basics' });
  assert.ok(sim2.acts().includes('pickupOff:basics'), sim2.acts().join(' | '));
  assert.match(sim2.text(), /pick/i);
  await sim2.click('pickupOff:basics');
  assert.notEqual(app.venueTourInfo(v.id).pickup, true, 'pickup taken off');
  approveAll(v.id);
  assert.doesNotMatch(plain(page(v)), /Pickup:? hotels in Whistler/);
});
