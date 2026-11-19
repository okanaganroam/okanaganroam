// Whistler tour test 15 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour15-2026-11-18/REPORT.md:
// Dave, Alta Lake Paddle & Snowshoe: summer canoe, kayak and SUP rentals and a sunset guided paddle; winter snowshoe tours
// and a fondue snowshoe night; an iPad held portrait). Build My Trip missed his headline tours and ignored which kind runs
// in which season, the price screen sent a per-boat rental to Private tours, French "location de canot" and "SUP" searches
// missed him, Help got 2 of 13. Dayton approved one new input: the season each kind runs (tour_info.kind_seasons).
// Dayton (2026-11-18): tours have no meeting-spot step ("most tour operators have where their meeting spots are when people
// make their bookings"); the page shows the business address.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t15-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T15 ${++n}`, slug: `tour-t15-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 15 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
const start = async () => { if (srv) return; srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; };
const stop = () => srv && srv.close();
if (!process.env.T15_DEBUG) { test.before(start); test.after(stop); }
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.75.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const textOf = (p) => JSON.stringify(p);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Dave's typed tours (his final-state.json).
const TOURS = [
  { name: 'Summer rentals and tours (mid-June to early Sept)', items: [
    { name: 'Canoe rental', description: 'Fits 2 adults and a small child. Life jackets included.', price: '$45 per boat per hour', duration: '1 hour' },
    { name: 'Kayak rental', description: '', price: '$30 per boat per hour', duration: '1 hour' },
    { name: 'SUP rental', description: '', price: '$30 per board per hour', duration: '1 hour' },
    { name: 'Sunset guided paddle', description: 'Kids 6+. Leaves from the dock about 2 hours before sunset.', price: '$89 per person', duration: '2 hours' }] },
  { name: 'Winter snowshoe tours (mid-Dec to March)', items: [
    { name: 'Guided snowshoe tour', description: 'Snowshoes and poles included. Kids 6+. Meet at the Olympic Plaza ticket booth.', price: '$99 per person', duration: '2 hours' },
    { name: 'Fondue snowshoe evening', description: 'Evening snowshoe by headlamp, then a cheese and chocolate fondue dinner in a heated yurt. Dinner included. Kids 6+.', price: '$179 per person', duration: '3 hours' }] },
];
const STORY = 'Summer on Alta Lake: rent a canoe, kayak or SUP by the hour from our dock at Lakeside Park, or join our 2-hour guided sunset paddle. Winter: guided snowshoe tours from Whistler Village, and our fondue snowshoe evening with dinner in a heated yurt. Closed spring and fall.';
async function dave(o = {}, info = {}) {
  const v = mk('tour', { name: `Alta Lake Paddle & Snowshoe ${n + 1}`, cuisine: 'Canoe & kayak rentals', rating: 4.7, reviews: 211, address: 'Lakeside Park, 4320 Alta Lake Rd, Whistler', latitude: 50.1103, longitude: -122.9719,
    description: STORY, description_fr: 'Location de canots et de kayaks sur le lac Alta au parc Lakeside.', hours: JSON.stringify(WK('09:00', '21:00')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['paddle', 'rentals', 'snowshoe'], length: '1-2h', book: 'same_day', age: 'all', year: 'seasonal', snow_open: true, ...info } }));
  ok(await change(t, { open_months: '12-15:09-05' }));
  ok(await change(t, { tour_price: 89 }));
  db.prepare('INSERT OR REPLACE INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id,
    JSON.stringify([{ from: '06-15', to: '09-05', label: '', hours: WK('08:00', '21:00') }]),
    JSON.stringify([{ from: '04-01', to: '06-14', note: 'Closed between seasons. Paddling back mid-June.', yearly: true }]));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}
let world0 = null;
function world() {
  if (world0) return world0;
  world0 = {
    eco: mk('tour', { name: 'Whistler Eco Tours T15', cuisine: 'Canoe, kayak, SUP & hiking tours', rating: 4.8, reviews: 600, description: 'Guided canoe and kayak tours on the River of Golden Dreams, SUP lessons and guided hikes.' }),
    snow: mk('tour', { name: 'Blackcomb Snowmobile T15', cuisine: 'Snowmobile & dog sled tours', rating: 4.7, reviews: 900, description: 'Snowmobile and dog sled tours in winter.' }),
    lake: mk('beach', { name: 'Lakeside Park T15', cuisine: 'Beach', rating: 4.6, reviews: 500, description: 'A lakeside park with a swimming dock and a canoe launch.' }),
  };
  for (const [nm, cu] of [['Village Bistro T15', 'Bistro'], ['Village Grill T15', 'Grill'], ['Fondue House T15', 'Fondue']]) mk('restaurant', { name: nm, cuisine: cu, hours: JSON.stringify(WK('08:00', '22:00')) });
  return world0;
}
const plan = (q, lang) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, NOW);

module.exports = { getText, start, stop, app, db, dave, world, plan, namesOf, itemsOf, textOf, page, plain, change, ok, approveAll, tokenFor, mk, postJson, WK, TOURS, STORY, text, CLIENT, sent, NOW };
if (process.env.T15_DEBUG) return;
