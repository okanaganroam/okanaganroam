// Whistler tour test 13 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour13-2026-11-18/REPORT.md:
// Matthias, tandem paragliding in Pemberton, on a Windows laptop with a mouse and keyboard. "$189 per flight" / "189.-",
// no paragliding kind, a meeting-spot photo with no GPS, every trip weather permitting, winter trips by request only, a
// long Good to know).
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t13-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T13 ${++n}`, slug: `tour-t13-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 13 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.73.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const boxOf = (id) => JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id) || { info: '{}' }).info);
const rowOf = (id, label) => ([...(boxOf(id).rows || []), ...(boxOf(id).owner_dropped || [])].find((r) => r.label === label) || {}).text;
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Matthias's typed tours: two flights, then "Options and vouchers" (a GoPro add-on and a gift voucher).
const TOURS = [
  { name: 'Tours', items: [{ name: 'Classic tandem flight', price: '$189 per flight', description: '20–30 minutes in the air · The flights are taking place from the launch on Mount Mackenzie.' },
    { name: 'Thermal tandem flight', price: '$289 per flight', description: '45–60 minutes in the air · Longer flight in the afternoon thermals.' }] },
  { name: 'Options and vouchers', items: [{ name: 'GoPro photo and video', price: '+ $49 per flight', description: 'Your flight filmed with a GoPro on the wing.' },
    { name: 'Gift voucher', price: 'From $189', description: 'Valid two years.' }] },
];
async function matthias(o = {}, info = {}) {
  const v = mk('tour', { name: `Pemberton Tandem Paragliding ${n + 1}`, region: 'pemberton', cuisine: 'Paragliding', rating: 4.9, reviews: 211, address: '7400 Frontier St, Pemberton', latitude: 50.3192, longitude: -122.8028,
    description: 'Tandem paragliding flights over the Pemberton Valley with views of Mount Currie. Meet at our office on Frontier Street.',
    description_fr: 'Vols en parapente biplace au-dessus de la vallée de Pemberton avec vue sur le mont Currie.', ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['paraglide'], length: '1h', book: 'day', age: '6', adult: true, adult_age: '19', adult_waiver: true, year: 'all', ...info } }));
  ok(await change(t, { tour_price: 189 }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}
const plan = (q) => app.runTripPlan({ text: q }, NOW);

test('1. Build My Trip: paragliding is its own kind; "paraglide", « parapente » and kids plan the paragliding operator; a plain "scenic flight" ranks him after heli and floatplane, labelled paragliding', async () => {
  const { v, t } = await matthias();
  ok(await change(t, { visit_rows: { good_to_know: 'Passengers 25–110 kg, able to run a few steps. Closed-toe shoes.' } })); approveAll(v.id);
  const heli = mk('tour', { name: 'Pemberton Helicopters T13', region: 'pemberton', cuisine: 'Helicopter tours & scenic flights', rating: 4.6, reviews: 90, description: 'Scenic helicopter flights and glacier landings.' });
  const fly = mk('tour', { name: 'Pemberton Floatplanes T13', region: 'pemberton', cuisine: 'Floatplane scenic flights', rating: 4.7, reviews: 300, description: 'Floatplane flights over the lakes and peaks.' });
  const atv = mk('tour', { name: 'Pemberton ATV T13', region: 'pemberton', cuisine: 'ATV tours', rating: 4.9, reviews: 800, description: 'Guided ATV tours.' });
  const bungee = mk('tour', { name: 'Pemberton Bungee T13', region: 'pemberton', cuisine: 'Bungee jumping', rating: 4.9, reviews: 800, description: 'Bungee jumps.' });
  for (const q of ['paragliding', 'paragliding in August', 'tandem paraglide for my 7 year old in August', 'paragliding for my 8 year old in Pemberton', 'parapente à Pemberton en juillet', 'paraglide', 'skydiving in Pemberton', 'hang gliding in Pemberton']) {
    const p = q.includes('parapente') ? app.runTripPlan({ text: q, lang: 'fr' }, NOW) : plan(q);
    assert.ok(namesOf(p).includes(v.name), `${q}: ${JSON.stringify([p.kind, namesOf(p).slice(0, 6)])}`);
    for (const x of [atv, bungee, heli, fly]) assert.ok(!namesOf(p).includes(x.name), `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.doesNotMatch(String(p.summary), /“(?:paragliding|paraglide|tandem)”/, q);
    const stop = itemsOf(p).find((x) => x.venue.name === v.name);
    assert.ok((stop.caveats || []).includes('Good to know (the operator’s own words): Passengers 25–110 kg, able to run a few steps.'), JSON.stringify(stop.caveats));
  }
  const r = require('../trip-requirements.js');
  for (const q of ['paraglide', 'paragliding', 'parapente', 'skydiving', 'hang gliding', 'speed flying', 'tandem paraglide']) assert.ok(r.KINDS.paragliding.test(q), q);
  const fr = require('../trip-planner-fr.js');
  assert.match(SERVER + fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['parapente', 'paragliding'\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['parachutisme', 'skydiving'\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['deltaplane', 'hang gliding'\]/);
  assert.ok(fr);
  // A plain "scenic flight": the helicopter and floatplane first; he comes after them, labelled paragliding.
  const sf = plan('scenic flights in Pemberton in July');
  const names = namesOf(sf);
  const fp = plan('floatplane in Pemberton'); console.log('FP', fp.kind, JSON.stringify(namesOf(fp)), JSON.stringify(fp.notes||'').slice(0,300), fp.totalMatches);
  console.log('SF', sf.totalMatches,  sf.kind, JSON.stringify(itemsOf(sf).map((x) => [x.venue.name, x.score, x.why])).slice(0, 1500));
  assert.ok(names.includes(heli.name) && names.includes(fly.name), JSON.stringify(names));
  if (names.includes(v.name)) {
    assert.ok(names.indexOf(v.name) > names.indexOf(heli.name) && names.indexOf(v.name) > names.indexOf(fly.name), JSON.stringify(names));
    const stop = itemsOf(sf).find((x) => x.venue.name === v.name);
    assert.ok((stop.caveats || []).includes('Paragliding: a tandem flight with a pilot, not a plane or helicopter.'), JSON.stringify(stop.caveats));
  }
  const vocab = require('../data/vocabulary/shared.json');
  assert.ok(vocab.termLabels.paragliding && vocab.descriptionSynonyms.paragliding, 'its own group in shared.json');
});
