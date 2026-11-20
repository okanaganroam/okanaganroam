// Indoor test 16 (2026-11-19; Tyler, owner of an escape room in Kelowna: $35 per player, 2 players minimum, a $180 private
// room, closed Mon–Tue, everyone books ahead, 8+ in Who can come with "Ages 12+ on their own; ages 8 to 11 with a paying
// adult" in Good to know, Great for Groups with a Groups line). Each fix from his report, checked with the real setup page
// script and real taps (tests/setup-sim.js), the public page (EN + FR), search, Build My Trip and the trip page script. His
// Help questions are in the Help matrix (tests/indoor-help-matrix.test.js); the kids-with-ages and group sweeps for every
// kind are in tests/indoor-kids-matrix.test.js and tests/indoor-planner-matrix.test.js.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test16-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const T = require('../owner-setup-text.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Tyler's hours: closed Monday and Tuesday, noon to 10 PM the rest of the week.
const TYLER = { mon: null, tue: null, wed: [['12:00', '22:00']], thu: [['12:00', '22:00']], fri: [['12:00', '22:00']], sat: [['12:00', '22:00']], sun: [['12:00', '22:00']] };
const ALL_WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T16 Fixture ${++n}`, slug: `indoor-t16-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.886 + n / 3000, longitude: -119.4248,
  address: `${2400 + n} Hwy 97 N, Kelowna, BC`, phone: '778-555-0116', website: 'https://example.com', hours: JSON.stringify(TYLER), rating: 4.6, reviews: 120,
  description: 'Three themed escape rooms in Kelowna for 2 to 6 players. Book a time slot online, grab your crew and beat the clock.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.116.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const rowsOf = (id) => JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id).info);
const GTK = 'Free lockers. Arrive 15 minutes early. Ages 12+ on their own; ages 8 to 11 with a paying adult.';
const GROUPS = 'Groups of 8 or more: please book ahead. Birthday parties. Corporate events and team building.';

// Tyler's room with his answers (the price as he typed it is tested with real taps below).
const tyler = async (o = {}, answers = {}) => {
  const v = mk({ name: `Exit Kelowna Escape T16 ${n + 1}`, cuisine: 'Escape room', great_groups: 1, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['escape'], length: '1-2h', book: 'ahead', age: '8', year: 'all', ...(answers.info || {}) }, indoor_price: answers.price || 35 }));
  await ok(change(t, { hours: TYLER }));
  await ok(change(t, { visit_rows: { good_to_know: GTK, groups: GROUPS } }));
  return { v, t };
};

test('1. The price typer: a price per person starts its first line with a per-person name ("One player"), a price per room with "One room"; never "Private room for 2 to 6" beside $35', async () => {
  const { t } = await tyler();
  const menu = await getText(`/owner/${t}/menu`);
  assert.match(menu, /"firstItem":\{"name":"One player","price":"35"\}/);
  assert.doesNotMatch(menu, /"firstItem":\{"name":"Private room/);
  const menuFr = await getText(`/fr/owner/${t}/menu`);
  assert.match(menuFr, /"firstItem":\{"name":"Un joueur","price":"35"\}/);
  // Per room: the room's own unit.
  const r = await tyler({}, { info: { per: 'room', per_min: 2, per_max: 6 }, price: 180 });
  assert.match(await getText(`/owner/${r.t}/menu`), /"firstItem":\{"name":"One room","price":"180"\}/);
  // Every kind: a per-person first line never names a room, lane, group or party.
  const IK = require('../indoor-kinds.js');
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const w = IK.indoorKindText([k], 'en').prices.typer;
    assert.doesNotMatch(w.person, /\b(?:room|lane|group|private|party)\b/i, k);
  }
});

test('2. "35 per person, min 2 players" (real taps): the minimum is kept, the preview line stays, the page says "From $35 per player (2-player minimum)" (EN + FR), and coming back keeps it', async () => {
  const v = mk({ name: 'Exit Kelowna Escape T16 Price', cuisine: 'Escape room' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['escape'], length: '1-2h', book: 'ahead', age: '8', year: 'all' } }));
  const sim = await openSetup(base, t, { hash: 'price' });
  await sim.type('suTprice', '35 per person, min 2 players');
  // Still per person, and the preview says it with the minimum.
  assert.ok(sim.has('[data-iper="person"][aria-pressed="true"]'), sim.text().slice(0, 600));
  assert.match(sim.doc.getElementById('suTpriceLead').textContent, /From \$35 per player \(2-player minimum\)/);
  await sim.click('priceSave');
  assert.equal(app.indoorPrice(v.id), 35);
  const info = app.venueIndoorInfo(v.id);
  assert.equal(info.per, undefined);
  assert.equal(info.per_min, 2);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.ok(en.includes('From $35 per player (2-player minimum).'), en.slice(0, 3000));
  assert.ok(fr.includes('(minimum 2 joueurs).'), fr.slice(0, 3000));
  // Coming back: the box says all of it, and saving again keeps the minimum.
  const sim2 = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim2.doc.getElementById('suTprice').value, '35 (2-player minimum)');
  await sim2.click('priceSave');
  assert.equal(app.venueIndoorInfo(v.id).per_min, 2);
  // Other ways to say it, in French too.
  const sf = await openSetup(base, t, { hash: 'price', lang: 'fr' });
  await sf.type('suTprice', '35, minimum 2 joueurs');
  assert.match(sf.doc.getElementById('suTpriceLead').textContent, /35\s\$ par joueur \(minimum 2 joueurs\)/);
  for (const typed of ['35 2 player minimum', '$35 (minimum of 2 players)', '35 per player min. 2']) {
    const s3 = await openSetup(base, t, { hash: 'price' });
    await s3.type('suTprice', typed);
    assert.match(s3.doc.getElementById('suTpriceLead').textContent, /From \$35 per player \(2-player minimum\)/, typed);
    await s3.click('priceSave');
    assert.equal(app.venueIndoorInfo(v.id).per_min, 2, typed);
    assert.equal(app.venueIndoorInfo(v.id).per, undefined, typed);
  }
  // A plain price takes the minimum off.
  const s4 = await openSetup(base, t, { hash: 'price' });
  await s4.type('suTprice', '35');
  await s4.click('priceSave');
  assert.equal(app.venueIndoorInfo(v.id).per_min, undefined);
  assert.doesNotMatch(plain(page(v)), /minimum\)/);
});

test('3. Search with a named day ("escape room monday kelowna"): a place closed that day says "Closed Mondays", never "Open now"; places open that day come first (EN + FR)', async () => {
  const { v } = await tyler({ name: 'Exit Kelowna Escape T16 Search', rating: 4.9, reviews: 900 });
  const open = mk({ name: 'Kelowna Escape Room T16 Open Monday', hours: ALL_WEEK, rating: 4.1, reviews: 20 });
  const h = await getText(`/search?q=${encodeURIComponent('escape room monday kelowna')}`);
  const cardOf = (html, name) => { const i = html.indexOf(`data-venue-name="${name}"`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('</li>', i)); };
  const mine = cardOf(h, v.name), theirs = cardOf(h, open.name);
  assert.match(mine, /<p class="fd-open-status" data-fd-open="closed" data-fd-day="1">Closed Mondays<\/p>/);
  assert.doesNotMatch(mine, /Open now/);
  assert.match(theirs, /data-fd-day="1">Open Mondays · 11 AM–11 PM</);
  assert.ok(h.indexOf(`data-venue-name="${open.name}"`) < h.indexOf(`data-venue-name="${v.name}"`), 'open that day first');
  assert.match(plain(h), /Escape rooms in Kelowna on Monday/);
  // The page's own clock never paints over the day's line.
  assert.match(h, /if \(el && !el\.hasAttribute\('data-fd-day'\)\)/);
  const fr = await getText(`/fr/search?q=${encodeURIComponent('jeu d’évasion lundi kelowna')}`);
  assert.match(cardOf(fr, v.name), /data-fd-day="1">Fermé le lundi</);
  // No day named: as before.
  assert.doesNotMatch(await getText(`/search?q=${encodeURIComponent('escape room kelowna')}`), /data-fd-day="1"/);
});

test('4. Groups: for a place everyone books ahead, the size question asks when a big group should call or book more than one room (by kind, EN + FR); otherwise as before', async () => {
  const { t } = await tyler();
  const g = await openSetup(base, t, { hash: 'groups' });
  assert.match(g.text(), /Big groups: from what size should they call or book more than one room\?/);
  const gf = await openSetup(base, t, { hash: 'groups', lang: 'fr' });
  assert.match(gf.text(), /Grands groupes\s*:\s*à partir de combien doivent-ils appeler ou réserver plus d’une salle/);
  // The size stays optional: the screen still offers no size.
  assert.ok(g.acts().some((a) => /^skip:|^go:/.test(a)) || g.has('#suGroupsNone') || /can’t take/i.test(g.text()), g.acts().join(' | '));
  // Walk-ins: the usual question.
  const w = mk({ name: 'Walk-in Bowling T16', cuisine: 'Bowling alley' });
  const tw = tokenFor(w.id);
  await ok(change(tw, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all', year: 'all' } }));
  assert.match((await openSetup(base, tw, { hash: 'groups' })).text(), /Groups and parties: from what size should they book ahead\?/);
  // Every kind has its own book-ahead question.
  for (const [k, q] of Object.entries(T.en.indoor.kindText)) assert.match(q.groupsQAhead, /^Big groups: from what size should they (?:call or book more than one \w+|call ahead)\?$/, k);
  for (const [k, q] of Object.entries(T.fr.indoor.kindText)) assert.match(q.groupsQAhead, /^Grands groupes\s*:\s*à partir de combien/, k);
});

// Help: every "tap X" in a Help answer names a button or label that is really there (the setup's own words, or the edit
// page's), for every kind of business; and the screens' known wrong names (WRONG_BUTTONS) never come back.
const WRONG_BUTTONS = [
  // The setup's hours screen moves on with Next; "Save my hours" is only a seasonal stretch's button.
  { pages: 'setup', ids: ['hours', 'setup-third-time', 'setup-split-hours', 'hours-right'], en: 'Save my hours', fr: 'Enregistrer mes heures' },
];
test('5. Help: the setup hours answer says Next (never Save my hours); every "tap X" in every kind\'s setup and edit Help answers is a real button or label (EN + FR)', async () => {
  const { t } = await tyler();
  const cfgOf = (html) => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]);
  const setup = cfgOf(await getText(`/owner/${t}/setup`));
  const hours = setup.topics.find((x) => x.id === 'hours');
  assert.match(plain(hours.a), /Tap Next : hours saved in the setup go live straight away/);
  assert.match(plain(hours.aFr), /Suivant/);
  for (const w of WRONG_BUTTONS) for (const tp of setup.topics) { assert.ok(!String(tp.a).includes(w.en), `${tp.id}: ${w.en}`); assert.ok(!String(tp.aFr).includes(w.fr), `${tp.id}: ${w.fr}`); }
  // The sweep: one business of every kind.
  const norm = (x) => String(x).replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&nbsp;| /g, ' ').replace(/&eacute;/g, 'é').replace(/^[✕✓+]\s*/, '');
  const flat = []; const walk = (o) => { if (typeof o === 'string') flat.push(o); else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k]); };
  walk(T.en); walk(T.fr);
  const known = norm(flat.join('\n')) + norm(fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8'));
  const missing = [];
  for (const type of ['indoor', 'restaurant', 'cafe', 'winery', 'brewery', 'tour', 'pub', 'cocktail', 'distillery']) {
    const v = type === 'indoor' ? app.getVenue(db.prepare("SELECT id FROM venues WHERE type = 'indoor' LIMIT 1").get().id) : app.createVenue({ name: `Help sweep ${type} T16`, slug: `help-sweep-${type}-t16`, region: 'kelowna', type, latitude: 49.88, longitude: -119.49, address: '1 Water St, Kelowna', description: 'A fixture.' });
    const tk = tokenFor(v.id);
    const edit = norm((await getText(`/owner/${tk}`)) + (await getText(`/fr/owner/${tk}`)) + (await getText(`/owner/${tk}/menu`)) + (await getText(`/fr/owner/${tk}/menu`)));
    for (const [lang, p] of [['en', `/owner/${tk}/setup`], ['fr', `/fr/owner/${tk}/setup`], ['en', `/owner/${tk}`], ['fr', `/fr/owner/${tk}`]]) {
      for (const tp of cfgOf(await getText(p)).topics) {
        for (const m of norm(lang === 'fr' ? tp.aFr : tp.a).matchAll(/(?:[Tt]ap|[Tt]ouchez|[Cc]lick|[Cc]liquez|[Pp]ress|[Aa]ppuyez sur)\s+(?:on\s+|sur\s+)?<strong>([^<]+)<\/strong>/g)) {
          const w = norm(m[1]).trim();
          if (!known.includes(w) && !edit.includes(w)) missing.push(`${type} ${lang} ${tp.id}: ${w}`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('6. Build My Trip: "Saturday 7pm then dinner" plans the escape room at 7 PM and dinner after it; "dinner then escape room Saturday 7pm" keeps dinner first', async () => {
  const { v } = await tyler({ name: 'Exit Kelowna Escape T16 Clock', region: 'summerland', latitude: 49.6, longitude: -119.67 });
  for (const nm of ['Bin 4 T16', 'Burger Lounge T16']) mk({ name: nm, region: 'summerland', type: 'restaurant', cuisine: 'Burgers', hours: ALL_WEEK, description: 'Burgers and craft beer.', rating: 4.5, reviews: 400, latitude: 49.601, longitude: -119.67 });
  const at = (p, id) => (p.schedule || []).find((x) => x.venueId === id);
  const p = app.runTripPlan({ text: `escape room Summerland Saturday 7pm then dinner` }, NOW);
  const mine = at(p, v.id);
  assert.ok(mine, JSON.stringify((p.schedule || []).map((x) => x.venueId)));
  assert.equal(mine.startMinutes, 19 * 60);
  const dinner = (p.schedule || []).find((x) => x.venueId !== v.id && x.startMinutes >= mine.endMinutes);
  assert.ok(dinner, 'dinner after it');
  const q = app.runTripPlan({ text: `dinner then escape room Summerland Saturday 7pm` }, NOW);
  const first = (q.schedule || [])[0];
  assert.ok(first && first.venueId !== v.id, 'dinner first');
});

test('7. Polish: the Ages row reads "Ages 12 and up (8+ with an adult)." from his own Good to know (EN + FR); "Why it fits" never lists Book ahead (the good-to-know lines come first); a place with no owner kind takes the kind its story names', async () => {
  const { v } = await tyler({ name: 'Exit Kelowna Escape T16 Ages' });
  const ages = rowsOf(v.id).rows.find((r) => r.label === 'Ages');
  assert.equal(ages.text, 'Ages 12 and up (8+ with an adult).');
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Ages 12 and up \(8\+ with an adult\)\./);
  assert.match(fr, /À partir de 12 ans \(dès 8 ans avec un adulte\)\./);
  // Only "8+ with an adult": "Ages 8 and up, with an adult."
  const w = await tyler({ name: 'Exit Kelowna Escape T16 Ages 2' });
  await ok(change(tokenFor(w.v.id), { visit_rows: { good_to_know: 'Free lockers. Kids 8+ with an adult.' } }));
  assert.equal(rowsOf(w.v.id).rows.find((r) => r.label === 'Ages').text, 'Ages 8 and up, with an adult.');
  // A rule for one activity above his own minimum stays in Good to know only.
  await ok(change(tokenFor(w.v.id), { visit_rows: { good_to_know: 'VR games: 10+ with an adult.' } }));
  assert.equal(rowsOf(w.v.id).rows.find((r) => r.label === 'Ages').text, 'Ages 8 and up.');
  // Build My Trip: Book ahead is a good-to-know line, never a reason; the page shows those lines above "Why it fits".
  const p = app.runTripPlan({ text: 'escape room Kelowna Saturday night' }, NOW);
  for (const it of itemsOf(p)) for (const r of it.why || []) assert.doesNotMatch(r, /book ahead/i, r);
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  const i = v3.indexOf("+ (cav ? '<ul class=\"t3-caveats\" aria-label="), j = v3.indexOf("+ (why ? '<details class=\"t3-fit\">");
  assert.ok(i > 0 && j > i, 'caveats before Why it fits');
  // No owner kind and a story that says escape rooms first: "Escape room", never "Indoor Attraction".
  const x = mk({ name: 'Xperience Games T16', region: 'oliver', latitude: 49.18, longitude: -119.55, cuisine: null, hours: ALL_WEEK, description: 'Xperience Games runs tech-based escape rooms with no locks or keys, alongside more than a dozen VR escape games. Every game is private to your group.' });
  const op = app.runTripPlan({ text: 'escape room Oliver Saturday night' }, NOW);
  const stop = itemsOf(op).concat(itemsOf(op).flatMap((s) => s.alternates || [])).find((s) => s.venue.id === x.id);
  assert.ok(stop, 'offered');
  assert.equal(stop.venue.typeLabel, 'Escape room');
  assert.equal(stop.venue.typeLabelFr, 'Jeu d’évasion');
});

test('S1 + S2 for Tyler: "something to do with my 10 year old" offers his 8+ room with "Under 12s come with an adult"; "with my 7 year old" leaves it out; "rainy day for a group of 6" ranks him first and the header never says “group”', async () => {
  const { v } = await tyler({ name: 'Exit Kelowna Escape T16 Sweep', region: 'peachland', latitude: 49.77, longitude: -119.74 });
  // Competitors: a better-rated gym and spa whose stories say "group", and family places nobody answered for.
  mk({ name: 'Peachland Y Fitness T16', region: 'peachland', cuisine: 'Gym', hours: ALL_WEEK, description: 'Group fitness classes and a pool.', rating: 4.9, reviews: 900, latitude: 49.771, longitude: -119.74 });
  mk({ name: 'Peachland Wellness Spa T16', region: 'peachland', cuisine: 'Spa', hours: ALL_WEEK, description: 'Group spa days and massage.', rating: 4.9, reviews: 900, latitude: 49.772, longitude: -119.74 });
  mk({ name: 'Peachland Fun Centre T16', region: 'peachland', cuisine: 'Family fun centre', hours: ALL_WEEK, description: 'Bowling and an arcade.', rating: 4.8, reviews: 600, kid_friendly: 1, latitude: 49.773, longitude: -119.74 });
  const ten = app.runTripPlan({ text: 'something to do with my 10 year old in Peachland' }, NOW);
  const stop = itemsOf(ten).find((x) => x.venue.id === v.id);
  assert.ok(stop, itemsOf(ten).map((x) => x.venue.name).join(' | '));
  assert.ok(stop.caveats.includes('Under 12s come with an adult (the owner’s own words).'), JSON.stringify(stop.caveats));
  const frCopy = require('../trip-french-copy.js');
  assert.match(frCopy.t3FrenchText('Under 12s come with an adult (the owner’s own words).'), /moins de 12 ans viennent avec un adulte/);
  assert.ok(!itemsOf(app.runTripPlan({ text: 'something to do with my 7 year old in Peachland' }, NOW)).some((x) => x.venue.id === v.id), '7 year old');
  assert.ok(!itemsOf(app.runTripPlan({ text: 'family fun in Peachland' }, NOW)).some((x) => x.venue.id === v.id), 'ages not named');
  for (const q of ['rainy day for a group of 6 in Peachland', 'indoor group activity Peachland', 'rainy day for 8 people in Peachland', 'big group fun in Peachland']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const first = itemsOf(p).find((x) => x.venue.type === 'indoor');
    assert.ok(first && first.venue.id === v.id, `${q}: ${itemsOf(p).map((x) => x.venue.name).join(' | ')}`);
    assert.ok(p.intent.features.includes('great_groups'), q);
    assert.ok(!(p.intent.foodTerms || []).some((f) => /^(?:group|groups|team)$/.test(f.term)), q);
    assert.doesNotMatch(JSON.stringify(p.understood), /“group”|"group"/, q);
    assert.ok(first.why.includes('Takes groups (the owner’s own Groups line)') || first.reasons.some((r) => r.code === 'group_line'), JSON.stringify(first.why));
  }
});
