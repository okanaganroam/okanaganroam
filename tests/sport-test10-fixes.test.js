// Sport test 10 fixes (2026-11-21; Lorraine, the office & admin manager of The Harvest Golf Club in Kelowna, on the office
// laptop then her phone; drafts/fresh-eyes-sport10-2026-11-21/REPORT.md):
//   1. Help checks that its answer fits the question (sport-help.js FIT): a confident answer to a different question is
//      swapped for the right topic, or becomes "I'm not sure" with Ask us. Her 26 questions all land well.
//   2. "gym shorts" stays "gym shorts" (no single word of a longer place name gets a capital).
//   3. The closure "Why?" box: each new closure starts empty, a counter shows what's left, a long one is a nudge (no cut),
//      and two notes are never joined.
//   4. Owner-set-up places first on the golf hub (EN and FR) and in Build My Trip.
//   5. The phone error says where a second number goes; "walk on golf" puts a book-ahead course last with a note;
//      "after work" is a time in search; "You're signed in" by the name; no "Tee times recommended" after "No, please book
//      a tee time"; the owner home's update lines in the kind's words.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test10-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const clean = require('../owner-text-clean.js');
const { SRC, Q } = require('./help-sport10-questions.js');
const F = require('./sport10-fixture.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0, harvest;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  harvest = F.harvest(app, db); F.neighbours(app);
  if (app.clearVenueCaches) app.clearVenueCaches();
});
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:30', '18:00']]]));
const ip = () => `10.131.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const cfg = JSON.parse(m[1]);
  return { best: (q) => ctx.window.__ohbBest(q), cfg, answer: (id) => (cfg.topics.find((x) => x.id === id) || {}).a || '' };
};
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Sport Ten ${n}`, slug: `sport-ten-${n}`, region: o.region || 'peachland', type: o.type || 'golf', latitude: 49.77 + n / 4000, longitude: -119.73,
    address: `${n} KLO Rd`, website: `https://ten-${n}.example.com/`, hours: JSON.stringify(WK), description: o.description || 'A fixture for sport test 10.', description_fr: 'Un lieu de test.' });
}
async function setUp(c, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (c.season) assert.equal((await change(t, { hours: WK, open_months: c.season })).status < 300, true);
  assert.equal((await change(t, { indoor_info: { kinds: c.kinds, length: c.length || '1-2h', book: c.book, age: 'all', year: c.season ? 'seasonal' : 'all' }, indoor_price: c.price })).status < 300, true);
  return { v, t };
}

test('1. Help: every one of Lorraine’s 26 questions lands on a right answer (or an honest Ask us), none wrong or harmful', async () => {
  const { t } = await setUp(SRC.sport10);
  const bots = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', '']]) bots[page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = [];
  for (const [, page, lang, q, ok, harm] of Q) {
    const r = bots[page][lang].best(q);
    if (r.id && harm.includes(r.id)) bad.push(`HARM "${q}" -> ${r.id}`);
    else if (r.id ? !ok.includes(r.id) : !ok.includes('UNSURE')) bad.push(`"${q}" -> ${r.id || 'not sure'} (wants ${ok.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  // The eight that landed on a different question, with the answers Dayton asked for.
  const s = bots.setup.en, e = bots.edit.en;
  const want = [
    [e, "I'll start this on my work computer today and finish it on my phone at home tonight. Will I lose what I've done or have to start again?", 'resume-device', /Nothing is lost: your answers save as you go[\s\S]*same link[\s\S]*Create a login/],
    [s, 'We also have a toll free line for out of town golfers, 1-800-257-8577. Can I list both numbers?', 'phone', /One fits the phone box[\s\S]*Good to know/],
    [s, 'Right now the course is closed but the golf shop is open weekdays 9 to 5 for gift cards. Does that count as being open?', 'sport-part-season', /doesn’t count as open[\s\S]*Good to know/],
    [s, 'Our 18 hole rate is $215 in high season and $175 in the shoulder season. Locals get $160 with proof of residence. Which number do you want here?', 'indoor-price', /regular adult rate[\s\S]*Your prices/],
    [s, "The golf club itself doesn't have a happy hour. Masa's Grill runs its own Friday specials. What should I do on this one?", 'sport-hh-none-specials', /tap <strong>No<\/strong>[\s\S]*Known for<\/strong> or <strong>Good to know/],
    [s, 'Every June the Ladies Charity Tournament closes the course to the public for a day. The date changes every year. How do I put that in?', 'sport-one-off-closure', /Closed for a week or two[\s\S]*Every year/],
    [e, 'Our head professional would like to post the junior camp dates himself. Can he get his own access without using my login?', 'staff', /Create a login/],
    [e, 'Is there any charge to us if golfers book tee times after finding us on your site?', 'indoor-cost', /No cost, ever/],
  ];
  for (const [b, q, id, re] of want) { const r = b.best(q); assert.equal(r.id, id, q); assert.match(b.answer(id), re, id); }
  // French too: the resume and the cost questions.
  assert.equal(bots.edit.fr.best('Je commence au bureau et je finis ce soir sur mon téléphone. Est-ce que je vais perdre mes réponses?').id, 'resume-device');
});

test('1b. the fit check: a question’s intent decides; an answer that fits none of it becomes "I’m not sure" (Ask us) when no topic fits', async () => {
  const { t } = await setUp(SRC.sport10);
  const b = helpBot(await getText(`/owner/${t}/setup`));
  assert.ok(Array.isArray(b.cfg.fit) && b.cfg.fit.length >= 8, 'sport and golf places carry the fit rules');
  // A rule whose own topic isn't on this place's list: the answer that doesn't fit is withheld (Ask us), with suggestions.
  const cfg = { ...b.cfg, fit: [{ id: 'x', all: ['\\bshorts\\b'], fit: ['sport-dress-code'], go: ['no-such-topic'] }] };
  const html = `<script type="application/json" id="ohbCfg">${JSON.stringify(cfg)}</script>\n<script>${(/<script type="application\/json" id="ohbCfg">[\s\S]*?<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(await getText(`/owner/${t}/setup`)))[1]}</script>`;
  const r = helpBot(html).best('how do i add our happy hour deals, shorts are fine');
  assert.equal(r.id, null, 'a confident answer that fits none of the question’s intent is not given');
  assert.equal(r.hits[0], 'sport-dress-code', 'the suggestions start with the topics that fit');
  // An answer that fits stays as it is; no rule, no change.
  assert.equal(b.best('Is this the right spot for our dress code? no tank tops or gym shorts').id, 'sport-dress-code');
  // Restaurants (no fit rules) are untouched.
  const rv = mk({ type: 'restaurant' }); const rt = app.createOwnerLink(rv.id, {}).url.split('/owner/')[1];
  assert.equal(helpBot(await getText(`/owner/${rt}`)).cfg.fit, undefined);
});

test('2. the capitaliser: a common word from a longer place name never gets a capital; the whole name does', () => {
  const known = clean.buildKnownNames(['Shorts Creek Canyon Trail (Fintry Provincial Park)', 'Kalamalka Beach', 'Knox Mountain Park', 'Myra Canyon', 'Mission Creek Regional Park', 'Okanagan Lake Park',
    'Summit Ridge Trail', 'Eagle Point Park', 'Harvest Moon Trail', 'Canyon Hot Springs', 'Bear Creek Provincial Park'], ['Kelowna', 'West Kelowna', 'Lake Country', 'Okanagan'], () => false);
  const common = 'no tank tops or gym shorts. by the creek, beach, park, ridge, canyon, springs, harvest, summit, eagle, the country and the moon';
  assert.equal(clean.knownNameCaps(common, known), common);
  assert.equal(clean.knownNameCaps('we love shorts creek canyon, myra canyon and eagle point in kelowna, west kelowna and lake country', known),
    'we love Shorts Creek Canyon, Myra Canyon and Eagle Point in Kelowna, West Kelowna and Lake Country');
  // Saved through the setup: her dress code line keeps "gym shorts".
  return (async () => {
    db.prepare("INSERT INTO venues (name, slug, region, type, latitude, longitude) VALUES ('Shorts Creek Canyon Trail (Fintry Provincial Park)', 'shorts-creek-t10', 'kelowna', 'outdoor', 50.1, -119.5)").run();
    if (app.clearVenueCaches) app.clearVenueCaches();
    const { v, t } = await setUp(SRC.sport10);
    assert.ok((await change(t, { visit_rows: { good_to_know: 'Dress code: collared or golf shirts, no tank tops or gym shorts.' } })).status < 300);
    const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info);
    const g = info.rows.find((r) => r.label === 'Good to know');
    assert.match(g.text, /gym shorts/); assert.doesNotMatch(g.text, /Shorts/);
  })();
});

test('3. the closure "Why?" box: each new closure starts empty, shows what’s left, nudges when too long (never cuts), never joins two notes', async () => {
  const { v, t } = await setUp(SRC.sport10);
  const sim = await openSetup(base, t, { hash: 'closures' });
  const addOne = async (day, note) => {
    await sim.click('go:closures:add');
    const box = sim.doc.getElementById('suCn');
    assert.equal(box.value, '', 'the Why? box starts empty');
    assert.match(sim.screen(), /id="suCnC"[^>]*>60 characters left</);
    await sim.type('suCf', day); await sim.type('suCn', note);
    await sim.click('closureAdd');
  };
  await addOne('2027-06-14', 'First note AAA');
  await addOne('2027-07-05', 'Second note BBB');
  // Too long: a nudge with how many over, her words kept in the box, nothing added.
  await sim.click('go:closures:add');
  await sim.type('suCf', '2027-08-02'); await sim.type('suCn', 'Closed to the public for the Harvest Ladies Golf Club Charity Tournament');
  await sim.click('closureAdd');
  assert.match(sim.text(), /Please keep “Why\?” to 60 characters, so it fits on your page \(12 too many\)/);
  assert.equal(sim.doc.getElementById('suCn').value, 'Closed to the public for the Harvest Ladies Golf Club Charity Tournament');
  await sim.type('suCn', 'Ladies Charity Tournament: closed to the public');
  await sim.click('closureAdd');
  await sim.click('closuresSave');
  const cl = JSON.parse(db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(v.id).closures);
  assert.deepEqual(cl.map((c) => c.note), ['First note AAA', 'Second note BBB', 'Ladies Charity Tournament: closed to the public']);
  // No box with a limit cuts what was typed on its own: the closure note was the one silent .slice(0, 60).
  const client = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.doesNotMatch(client, /cn\.replace\(\/\[\(\)&<>\]\/g, ''\)\.slice\(0, 60\)/);
});

test('4. owner-set-up places first: the Kelowna golf hub (EN and FR) and Build My Trip; the hub keeps every listing', async () => {
  const cards = (h) => [...h.matchAll(/<span class="venue-card-name">([^<]*)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  for (const p of ['/kelowna/golf', '/fr/kelowna/golf']) {
    const c = cards(await getText(p));
    const courses = c.filter((x) => !/Sim|Virtual|Evolution|JSquared|Simplex|Fringe|Driving Range/.test(x));
    assert.equal(courses[0], harvest.name, `${p}: ${courses.slice(0, 4).join(' | ')}`);
    assert.equal(new Set(c).size, F.H.neighbours.filter((x) => x.type === 'golf').length + 1, `${p}: every Kelowna golf listing, no more`);
  }
  const NAMES = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || [])].filter((x) => x && x.venue).map((x) => x.venue.name);
  for (const q of ['tee time in the morning then dinner in Kelowna on Friday July 16 2027', 'golf on Tuesday afternoon July 13 2027 in Kelowna', 'golf and wineries in Kelowna on Saturday July 17 2027']) {
    const p = app.runTripPlan({ text: q }, NOV);
    const golf = NAMES(p).filter((x) => /Golf|Springs|Ranch|Ridge|Greens|Canyon/.test(x));
    assert.equal(golf[0], harvest.name, `${q}: ${NAMES(p).join(' | ')}`);
  }
});

test('5a. the phone error says where a second number goes', async () => {
  const { t } = await setUp(SRC.sport10);
  const r = await change(t, { phone: '250-862-3103, toll free 1-800-257-8577' });
  const j = await r.json();
  assert.equal(j.errors.phone, 'One phone number fits here, like 250-555-0123. A second one (toll-free, the restaurant) can go in Good to know.');
  const one = await (await change(t, { phone: '250 86' })).json();
  assert.match(one.errors.phone, /10-digit phone number/);
});

test('5b. search: "walk on golf" puts a book-ahead course last with its note; "golf after work" is a time, not the word "work"', async () => {
  const model = (q) => app.searchPageModel(app.runDiscovery(q, { limit: 60 }), NOV, 'en');
  const m = model('walk on golf kelowna');
  const names = m.venues.filter((v) => v.type === 'golf' && v.region === 'kelowna').map((v) => v.name);
  assert.ok(names.includes(harvest.name));
  assert.equal(names[names.length - 1], harvest.name, names.join(' | '));
  const t = plain(await getText('/search?q=walk%20on%20golf%20kelowna'));
  assert.match(t, /Please book a tee time ahead\./);
  const aw = plain(await getText('/search?q=golf%20after%20work%20kelowna'));
  assert.doesNotMatch(aw, /“work”|'work'|"work"/);
  assert.ok(model('golf after work kelowna').venues.some((v) => v.name === harvest.name), 'her course is found');
});

test('5c. after Create a login, "You’re signed in" is by the name at the top (EN and FR)', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = s.indexOf('<h1>${escapeHtml(venue.name)}</h1>\n      ${/* Sport test 10'), w = s.indexOf('id="opWelcome"', i), f = s.indexOf('id="opFree"', i);
  assert.ok(i > 0 && w > i && w < f, 'the welcome line comes right after the name, before "Free."');
});

test('5d. "No, please book a tee time": no "Tee times recommended" chip; the owner home names a rates link and the kind’s dogs', async () => {
  const { v, t } = await setUp(SRC.sport10);
  const sim = await openSetup(base, t, { hash: 'bring' });
  const chips = (sim.screen().match(/data-quick="[^"]*"/g) || []).map((x) => x.slice(12, -1));
  assert.ok(chips.length > 3, chips.join(' | '));
  assert.ok(!chips.includes('Tee times recommended'), chips.join(' | '));
  // A course that takes walk-ons when there's room still gets it.
  const { t: tb } = await setUp({ ...SRC.sport10, book: 'busy' });
  assert.ok(((await openSetup(base, tb, { hash: 'bring' })).screen().match(/data-quick="[^"]*"/g) || []).some((x) => x.includes('Tee times recommended')));
  // Owner home: "Rates link" and "dogs on the course".
  assert.ok((await change(t, { not_offered: ['dogs'] })).status < 300);
  db.prepare("INSERT INTO owner_change_requests (venue_id, changes, previous, status) VALUES (?, ?, '{}', 'pending')").run(v.id, JSON.stringify({ address: '2725 K.L.O. Rd, Kelowna, BC V1W 4S1', menu_url: 'https://example.com/rates' }));
  const home = plain(await getText(`/owner/${t}`));
  assert.match(home, /dogs on the course/); assert.doesNotMatch(home, /dogs allowed/);
  assert.match(home, /Listing update: Address, rates link/); assert.doesNotMatch(home, /Listing update: [^.]*menu link/i);
});
