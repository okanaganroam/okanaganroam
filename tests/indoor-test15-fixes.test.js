// Indoor test 15 (2026-11-19; Aaron, staff at a free public art gallery in Vernon: Tue–Sat, free admission with paid classes,
// closed on stat holidays; research's fall-exhibitions event said "Admission is by donation" and named a past opening). Each
// fix from his report, checked with the real setup page script and real taps (tests/setup-sim.js), the owner event form's
// server, the review page, Build My Trip, search and the trip page script. His Help questions are in the Help matrix
// (tests/indoor-help-matrix.test.js); the free requests for each free-entry kind are in tests/indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test15-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const DS = require('../discovery-search.js');
const { openSetup } = require('./setup-sim.js');
const sentForms = [];
app.setVenueSubmissionTransport(async (f) => { sentForms.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const TUE_SAT = { mon: null, tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: null };
const ALL_WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '20:00']]])));
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Gallery T15 Fixture ${++n}`, slug: `indoor-t15-${n}`, region: 'vernon', type: 'indoor', cuisine: 'Art gallery', latitude: 50.2645 + n / 3000, longitude: -119.2745,
  address: `${3200 + n} 31st Ave, Vernon, BC`, phone: '250-555-0115', website: 'https://example.com', hours: JSON.stringify(TUE_SAT), rating: 4.5, reviews: 90,
  description: 'The largest public art gallery in the North Okanagan, presenting changing contemporary exhibitions.', kid_friendly: 1, arts_culture: 1, ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const ip = () => `10.88.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const NOW = new Date('2026-11-19T12:00:00-08:00');
const today = app.todayLocal ? app.todayLocal() : new Date().toISOString().slice(0, 10);
const addDays = (d, k) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);

// Aaron's gallery, as research left it (with its by-donation fall-exhibitions event), then his answers.
const aaron = async (answers = true) => {
  const v = mk({ name: `Vernon Public Gallery T15 ${n + 1}` });
  const ev = app.createEvent({ name: `Fall Exhibitions T15 ${v.id}`, region: 'vernon', venue_id: v.id,
    description: 'Three new shows fill the gallery this fall. Admission is by donation; a free opening reception with the artists runs Thursday, October 22, 6 to 8 pm.',
    website: 'https://example.com', categories: ['arts-culture'], source_type: 'official_venue', source_name: 'Gallery', source_url: `https://example.com/fall-${v.id}`, source_checked_at: '2026-10-31',
    price_kind: 'donation', occurrences: [{ start_date: addDays('2026-09-01', v.id), end_date: addDays(today, 30), all_day: 1 }] }, { reason: 'indoor test 15 seed', batch_id: 'indoor-t15', reviewed_duplicates: db.prepare('SELECT id FROM events').all().map((r) => r.id) });
  assert.ok(ev.ok !== false, JSON.stringify(ev));
  const t = tokenFor(v.id);
  if (answers) {
    await ok(change(t, { indoor_info: { kinds: ['gallery', 'classes'], length: '1h', book: 'no', age: 'all', year: 'all' }, indoor_price: 'free' }));
    await ok(change(t, { hours: TUE_SAT }));
    approveAll(v.id);
  }
  return { v, t, eventId: ev.id || (ev.event && ev.event.id) };
};
const ownerEvent = (t, o = {}) => postJson(`/owner/${t}/events`, { name: 'Summer Art Camp', categories: ['family-kids'], description: 'A week-by-week summer art camp for kids 6 to 12, with painting, clay and printmaking.',
  start_date: addDays(today, 40), end_date: addDays(today, 40 + 53), start_time: '', end_time: '', all_day: true, event_url: '', price_text: '', schedule_notes: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000, partner_venue_ids: [], ...o });

test('1. Add an event: an owner event runs up to 120 days as it is (a summer camp, Jul 5 – Aug 27); a longer one goes in flagged for the reviewer; only a run over a year is turned back, naming "Repeats or other dates?"; the public form keeps 31 days and names its own box', async () => {
  const { t, v } = await aaron(false);
  // 54 days (a summer camp): accepted, no flag.
  const camp = await ownerEvent(t);
  assert.equal(camp.status, 201, JSON.stringify(camp.body));
  assert.ok(!camp.body.long);
  const sub = db.prepare('SELECT * FROM event_submissions WHERE id = ?').get(camp.body.id);
  assert.equal(sub.end_date, addDays(today, 93));
  assert.deepEqual(app.eventSubmissionReviewFlags(sub), []);
  // 150 days (an exhibition that runs into spring): accepted with its full dates, flagged on the review card and email.
  const long = await ownerEvent(t, { name: 'Winter Exhibition', start_date: addDays(today, 5), end_date: addDays(today, 154) });
  assert.equal(long.status, 201, JSON.stringify(long.body));
  assert.equal(long.body.long, true);
  const ls = db.prepare('SELECT * FROM event_submissions WHERE id = ?').get(long.body.id);
  assert.equal(ls.end_date, addDays(today, 154));
  assert.match(app.eventSubmissionReviewFlags(ls).join(' '), /^Runs 150 days .* longer than 120\. Check the end date before approving\./);
  await new Promise((r) => setTimeout(r, 50));
  const mail = sentForms.find((f) => f['Event name'] === 'Winter Exhibition');
  assert.ok(mail && /longer than 120/.test(mail['Check before approving'] || ''), JSON.stringify(mail));
  // Over a year: turned back, with the owner form's own box named.
  const year = await ownerEvent(t, { name: 'Permanent Collection', start_date: addDays(today, 5), end_date: addDays(today, 400) });
  assert.equal(year.status, 400);
  assert.match(year.body.errors.end_date, /write the full run in “Repeats or other dates\?” below/);
  // The public form: still 31 days, and its message names its own box.
  const pub = app.validateEventSubmission ? app.validateEventSubmission({ name: 'Long show', description: 'A long show at the hall downtown, all ages.', categories: ['arts-culture'], region: 'vernon',
    venue_name: 'Hall', organizer_name: 'Org', contact_name: 'Pat', contact_email: 'pat@example.com', consent: true, start_date: addDays(today, 5), end_date: addDays(today, 50), all_day: true }) : null;
  if (pub) assert.match(pub.errors.end_date, /at most 31 days\. Put the first day here and write the full run in “Other dates or schedule notes” below\./);
  // A run written in Repeats on a one-day event is flagged, never published as one day without a look.
  const one = await ownerEvent(t, { name: 'Fall Show', start_date: addDays(today, 3), end_date: '', schedule_notes: 'runs until December 19' });
  assert.equal(one.status, 201, JSON.stringify(one.body));
  const os = db.prepare('SELECT * FROM event_submissions WHERE id = ?').get(one.body.id);
  assert.match(app.eventSubmissionReviewFlags(os).join(' '), /One day only, but “Repeats or other dates\?” says: “runs until December 19”/);
  const weekly = db.prepare('SELECT * FROM event_submissions WHERE id = ?').get((await ownerEvent(t, { name: 'Life Drawing', start_date: addDays(today, 3), end_date: '', schedule_notes: 'every Tuesday' })).body.id);
  assert.equal(app.eventSubmissionReviewFlags(weekly).length, 1);
  // The edit page: the Add an event line doesn't repeat the heading's words, and a gallery's events say exhibitions.
  const edit = await (await fetch(`${base}/owner/${t}`)).text();
  assert.match(edit, /Exhibitions, openings, artist talks, workshops on What&rsquo;s On/);
  const hint = /<p class="op-hint">([^<]*Send one event at a time[^<]*)<\/p>/.exec(edit);
  assert.ok(hint, 'Add an event hint');
  assert.doesNotMatch(hint[1], /Exhibitions, openings/);
  assert.match(hint[1], /up to 120 days/);
  // Approved, the 150-day run shows on What's On as running until its end ("until Apr …"), not one day.
  const ap = app.approveEventSubmission(long.body.id, { reviewer: 'admin:test' });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  assert.equal(app.getVenue(v.id).id, v.id);
  const end = new Date(`${addDays(today, 154)}T12:00:00Z`);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][end.getUTCMonth()];
  const wo = plain(app.renderWhatsOnPage(app.parseWhatsOnPageQuery({ when: 'custom', from: addDays(today, 30), to: addDays(today, 30), regions: 'vernon' })));
  // Not started yet: "Nov 24 – Apr 22"; running: "Until Apr 22". Never a single day.
  assert.match(wo, new RegExp(`Winter Exhibition[\\s\\S]{0,120}(?:[Uu]ntil|– )${mon} ${end.getUTCDate()}`));
});

test('2. "free things to do in Vernon": free and by-donation places come before any café or diner, and the free, Complete & Verified gallery is in the first list, first', async () => {
  const { v } = await aaron();
  // Free museums as well rated as the gallery (a tie: Complete & Verified breaks it), and better-rated diners.
  for (let i = 0; i < 7; i++) mk({ name: `Free Museum T15 ${i}`, cuisine: 'Museum', description: 'A local history museum.', rating: 4.5, reviews: 90, free_entry: 1, hours: JSON.stringify(TUE_SAT) });
  for (let i = 0; i < 8; i++) mk({ name: `Diner T15 ${i}`, type: i % 2 ? 'restaurant' : 'cafe', cuisine: 'Diner', description: 'Breakfast all day.', rating: 4.8, reviews: 900, price: 1, hours: ALL_WEEK, kid_friendly: 0, arts_culture: 0 });
  app.setCompleteVerifiedIdsForTest([v.id]);
  for (const q of ['free things to do in Vernon', 'free things to do in vernon this weekend']) {
    const items = itemsOf(app.runTripPlan({ text: q }, NOW));
    const names = items.map((x) => `${x.venue.name} [${x.venue.type}]`).join(' | ');
    assert.equal(items[0] && items[0].venue.id, v.id, `${q}: ${names}`);
    assert.ok(!items.some((x) => ['cafe', 'restaurant'].includes(x.venue.type)), `${q}: ${names}`);
  }
  app.resetCompleteVerifiedCache();
});

test('3. search: the other number of any word matches ("art class" finds "adult art classes", "galleries" finds "gallery", "tour" finds "tours")', () => {
  const v = { textName: 'vernon public art gallery', textCuisine: 'art gallery', textDesc: 'gift shop adult art classes register online guided tours', features: {}, collections: [] };
  assert.ok(DS.termMatch(v, 'class'));
  assert.ok(DS.termMatch(v, 'art class'));
  assert.ok(DS.termMatch(v, 'galleries'));
  assert.ok(DS.termMatch(v, 'tour'));
  assert.ok(!DS.termMatch({ ...v, textDesc: 'the news this week' }, 'new'));
  assert.deepEqual(DS.numberVariants('gallery'), ['galleries']);
  assert.deepEqual(DS.numberVariants('classes'), ['class']);
  assert.ok(!DS.numberVariants('news').includes('new'));
});

test('4. his price set to Free puts the research event that says "by donation" (and a passed opening) on the review page, once; saving it fixes the event, the owner\'s answers stay', async () => {
  const { v, t, eventId } = await aaron();
  const checks = app.listEventChecks().filter((c) => c.event.id === eventId);
  assert.equal(checks.length, 1, JSON.stringify(app.listEventChecks()));
  assert.equal(checks[0].why, 'price');
  assert.equal(checks[0].owner, 'Free entry');
  assert.match(checks[0].text, /Admission is by donation/);
  // Another live change doesn't add a second item for the same event.
  await ok(change(t, { hours: { ...TUE_SAT, sat: [['11:00', '16:00']] } }));
  approveAll(v.id);
  assert.equal(app.listEventChecks().filter((c) => c.event.id === eventId).length, 1);
  // Nothing on the event changed yet.
  assert.match(db.prepare('SELECT description FROM events WHERE id = ?').get(eventId).description, /by donation/);
  // Saved with the text fixed: the event says free and the item leaves the list; the owner's answers are untouched.
  const r = app.decideEventCheck(checks[0].id, 'approve', { description: 'Three new shows fill the gallery this fall. Admission is free.' }, 'admin:test');
  assert.ok(r.ok, JSON.stringify(r));
  const ev = db.prepare('SELECT description, price_kind FROM events WHERE id = ?').get(eventId);
  assert.equal(ev.description, 'Three new shows fill the gallery this fall. Admission is free.');
  assert.equal(ev.price_kind, 'free');
  assert.equal(app.listEventChecks().filter((c) => c.event.id === eventId).length, 0);
  assert.equal(app.venueIndoorInfo(v.id).free, 'free');
  // "Keep as it is" also takes it off the list and changes nothing.
  const b = await aaron();
  const c2 = app.listEventChecks().find((c) => c.event.id === b.eventId);
  assert.ok(c2);
  // On the review page, under Changes to live events, with its own two buttons; Keep as it is goes through the page's route.
  const login = await fetch(`${base}/admin/review/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() }, body: JSON.stringify({ token: 'indoor-test15-admin-token' }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const page = await (await fetch(`${base}/admin/review`, { headers: { Cookie: cookie } })).text();
  assert.match(page, new RegExp(`data-kind="eventcheck" data-id="${c2.id}"`));
  assert.match(plain(page), /Changes to live events[\s\S]*the owner now says Free entry[\s\S]*may now be wrong about its price: “Admission is by donation;/);
  assert.match(page, /data-act="dismiss">Keep as it is</);
  const kept = await fetch(`${base}/admin/review/eventcheck/${c2.id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: '{}' });
  assert.equal(kept.status, 200, await kept.text());
  assert.match(db.prepare('SELECT description FROM events WHERE id = ?').get(b.eventId).description, /by donation/);
  assert.equal(app.listEventChecks().filter((c) => c.event.id === b.eventId).length, 0);
  // An owner's own event is never put up for this check.
  const own = await ownerEvent(b.t, { name: 'Donation Night', description: 'An evening of art; admission by donation at the door, all welcome.', start_date: addDays(today, 3), end_date: '' });
  assert.equal(own.status, 201);
  assert.equal(app.approveEventSubmission(own.body.id, { reviewer: 'admin:test' }).status, 200);
  assert.ok(!app.indoorEventChecksFor(app.getVenue(b.v.id)).some((c) => /Donation Night/.test(c.event.name)));
});

test('5. "free family saturday vernon" with nothing on What\'s On lists the free, kid-friendly places open Saturday, not a restaurant that says Saturday', async () => {
  const { v } = await aaron();
  const shut = mk({ name: 'Closed Saturday Museum T15', cuisine: 'Museum', free_entry: 1, hours: JSON.stringify({ ...TUE_SAT, sat: null }) });
  const r0 = mk({ name: 'Saturday Buffet T15', type: 'restaurant', cuisine: 'Chinese', description: 'Family dinners and a buffet on Fridays and Saturdays.', hours: ALL_WEEK, kid_friendly: 1, arts_culture: 0 });
  const res = await fetch(`${base}/search?q=${encodeURIComponent('free family saturday vernon')}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
  const h = plain(await res.text());
  assert.match(h, /Free places for families open Saturday/);
  assert.ok(h.includes(v.name), h.slice(0, 1500));
  assert.ok(!h.includes(r0.name));
  assert.ok(!h.includes(shut.name));
});

test('6. polish: the trip total says "Free" for free stops (EN + FR); a gallery starts on All ages ("We picked…", saved only with the screen) and No dogs allowed is on the screen; a performing arts centre is never labelled an art gallery', async () => {
  // The trip page's own estimate code, run on two free stops.
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  const fn = (name) => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
  const run = (lang, prices) => {
    const el = { hidden: true, textContent: '' };
    const cards = prices.map((c) => ({ querySelector: () => (c == null ? null : { dataset: { costCents: String(c) }, hasAttribute: () => false, getAttribute: () => null }) }));
    const ctx = { Intl, Number, Array, resultEl: { querySelector: () => el, querySelectorAll: () => cards }, lang: () => lang };
    vm.createContext(ctx); vm.runInContext(`${fn('cad')}\n${fn('updateTripEstimate')}\nupdateTripEstimate();`, ctx);
    return el.textContent;
  };
  assert.equal(run('en', [0, 0]), 'Estimated total per person: Free');
  assert.equal(run('fr', [0, 0]), 'Estimation par personne : Gratuit');
  assert.match(run('en', [0, 1500]), /\$15 CAD · Before tax/);
  assert.doesNotMatch(run('en', [0]), /\$0/);
  // All ages pre-picked for a gallery, marked as our pick, not saved until Save.
  const v = mk({ name: 'Age Gallery T15' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', year: 'all' } }));
  approveAll(v.id);
  const sim = await openSetup(base, t, { hash: 'offer' });
  assert.ok(sim.has('[data-tpick="age:all"][aria-pressed="true"]'), sim.screen().slice(0, 2000));
  assert.match(sim.text(), /We picked the usual for your kind of place/);
  assert.ok(sim.has('[data-off="no_dogs"]'), 'No dogs allowed is a real button');
  assert.equal(app.venueIndoorInfo(v.id).age, undefined);
  // Research that names an age keeps it empty.
  const a = mk({ name: 'Adults Gallery T15', description: 'A gallery of contemporary art. Adults only (19+) for the evening shows.' });
  const ta = tokenFor(a.id);
  await ok(change(ta, { indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', year: 'all' } }));
  approveAll(a.id);
  const sa = await openSetup(base, ta, { hash: 'offer' });
  assert.ok(!sa.has('[data-tpick="age:all"][aria-pressed="true"]'));
  // Build My Trip: a performing arts centre in an art gallery plan carries its own kind.
  const pac = mk({ name: 'Vernon & District Performing Arts Centre T15', cuisine: null, description: 'A 750-seat theatre for concerts, plays and dance, and the arts.', hours: ALL_WEEK, rating: 4.7, reviews: 300 });
  const items = itemsOf(app.runTripPlan({ text: 'art gallery Vernon on Monday' }, NOW));
  const card = items.find((x) => x.venue.id === pac.id);
  if (card) assert.notEqual(card.venue.typeLabel, 'Art Gallery');
  for (const x of items) if (!/galler|\bart\b/i.test(`${x.venue.name} ${x.venue.cuisineLabel || ''}`) && x.venue.typeLabel) assert.ok(!/^Art Galler/i.test(x.venue.typeLabel), `${x.venue.name}: ${x.venue.typeLabel}`);
});
