// Whistler tour test 17 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour17-2026-11-18/REPORT.md: Sarah,
// Sea to Sky Whitewater, rafting in Squamish: the Elaho full day 14+, a family float 6+, winter eagle floats December to
// January, a paid shuttle from Whistler; closed February to April and October to November; an iPhone 13 mini).
// The pickup button named the wrong town, the month picker refused her two closed stretches, the kind labels said
// "All year: wildlife and bear viewing", and Build My Trip missed her for "near Whistler" and for undated requests.
// The setup checks run the real setup page script (tests/setup-sim.js). The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
// Ported to Okanagan Roam (2026-11-18, Whistler #199): on Okanagan fixtures (Kelowna, Vernon, Coldstream, Penticton, Big White).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) {} }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t17-admin-token';
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
const mk = (type, o = {}) => app.createVenue({ name: `Tour T17 ${++n}`, slug: `tour-t17-${n}`, region: 'kelowna', type, latitude: 49.888 + n / 3000, longitude: -119.496,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Kelowna`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 17 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.77.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const plan = (q, lang, now = NOW) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, now);

// Sarah's typed tours (her final-state.json).
const TOURS = [{ name: 'Tours', items: [
  { name: 'Elaho River full day (Class III-IV)', description: 'Ages 14 and up. Lunch and wetsuits included. Leaves Vernon 8 AM.', price: '$219 per person', duration: 'Full day' },
  { name: 'Cheakamus family float', description: 'Ages 6 and up. Gentle Class I-II. Wetsuits included.', price: '$129 adults, 89 kids', duration: '2.5 hours' },
  { name: 'Winter eagle-viewing float (December to January)', description: 'By booking. Drysuits included.', price: '$109 per person', duration: '2 hours' }] }];
const STORY = 'Family-run rafting company in Vernon since 2004. Big-water full days on the Elaho, gentle family floats on the Cheakamus, and winter eagle-viewing floats in December and January. Wetsuits and guides included.';
async function sarah(o = {}, info = {}, { tours = true, months = '12-9', closure = true } = {}) {
  const v = mk('tour', { name: `Okanagan Whitewater ${n + 1}`, region: 'vernon', cuisine: 'Whitewater rafting', rating: 4.8, reviews: 211, address: '38129 2nd Ave, Vernon', latitude: 50.2671, longitude: -119.2720,
    description: STORY, hours: JSON.stringify(WK('08:00', '18:00')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['raft', 'wildlife'], length: '2-3h', book: 'ahead', age: '6', year: 'seasonal', weather_all: true, ...info } }));
  if (months) ok(await change(t, { open_months: months }));
  if (closure) ok(await change(t, { closures: [{ from: '02-01', to: '04-30', note: '', yearly: true }] }));
  ok(await change(t, { tour_price: 109 }));
  if (tours) db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}

test('1. The pickup button names the town the page will show ("hotels in Vernon" / « hôtels de Vernon »; Kelowna: "hotels in downtown Kelowna"), and pressing it shows exactly that', async () => {
  for (const [region, en, fr] of [['vernon', 'Vernon', 'de Vernon'], ['kelowna', 'downtown Kelowna', 'du centre-ville de Kelowna']]) {
    const { v, t } = await sarah({ region, address: region === 'vernon' ? '38129 2nd Ave, Vernon' : '4314 Main St, Kelowna' });
    const sim = await openSetup(base, t, { hash: 'basics' });
    const btn = /We pick you up \(from hotels in ([^)]+)\)/.exec(sim.text());
    assert.ok(btn, sim.text());
    assert.equal(btn[1], en);
    assert.doesNotMatch(sim.text(), /the village”|in the village\)/);
    const simFr = await openSetup(base, t, { hash: 'basics', lang: 'fr' });
    assert.match(simFr.text().replace(/[  ]/g, ' '), new RegExp(`Nous allons vous chercher \\(aux hôtels ${fr}\\)`));
    await sim.click('pickupOn:basics');
    approveAll(v.id);
    const pe = plain(page(v)), pf = plain(page(v, 'fr'));
    assert.equal((/Pickup:? hotels in (.+?) \(office/.exec(pe) || [])[1], btn[1], 'the button and the page say the same town');
    assert.match(pf, new RegExp(`hôtels ${fr} \\(bureau`));
  }
});

test('2. Months: Feb–Apr and Oct–Nov tapped from "We only run part of the year": Oct–Nov is saved as a yearly closure (one line says so) and the season is May 1 to Jan 31', async () => {
  const { v, t } = await sarah({}, { year: 'all' }, { months: null, closure: false });
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  if (!sim.has('[data-act="openMonths"]')) {
    const go = sim.acts().find((a) => a === 'yearClosed');
    assert.ok(go, sim.acts().join(' | '));
    await sim.click(go);
  }
  await sim.click('openMonths');
  assert.match(sim.text(), /Which months are you closed\?/);
  for (const m of [2, 3, 4, 10, 11]) await sim.click(`[data-chip="closedm:${m}"]`);
  await sim.click('monthsUse');
  assert.doesNotMatch(sim.text(), /Please pick closed months in a row/);
  assert.match(sim.text(), /Saved: closed Oct to Nov every year, under Closures and holidays\./);
  const cl = JSON.parse(db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(v.id).closures);
  assert.ok(cl.some((c) => c.yearly && c.from === '10-01' && c.to === '11-30'), JSON.stringify(cl));
  // The dates screen is filled with the season over the other stretch: May 1 to Jan 31.
  // (The stand-in browser doesn't pick a select's selected option by itself: as a phone would show it.)
  const sel = {};
  for (const id of ['suOfM', 'suOfD', 'suOtM', 'suOtD']) { const e = sim.doc.getElementById(id); const o = e.querySelector('option[selected]'); assert.ok(o, id); e.value = o.getAttribute('value'); sel[id] = +e.value; }
  assert.deepEqual(sel, { suOfM: 5, suOfD: 1, suOtM: 1, suOtD: 31 });
  const save = sim.acts().find((a) => /^openSave/.test(a));
  assert.ok(save, sim.acts().join(' | '));
  await sim.click(save);
  approveAll(v.id);
  const om = db.prepare('SELECT open_months FROM venue_links WHERE venue_id = ?').get(v.id).open_months;
  assert.match(String(om), /^0?5(?:-01)?(?:-|\.\.|:|–)0?1(?:-31)?$|05-01.*01-31/, String(om));
  const pe = plain(page(v));
  assert.match(pe, /Oct 1 – Nov 30|Oct 1 – 30 Nov|October/i, 'the break shows on the page');
  // Three stretches: the short line with a way to Closures and holidays.
  const v3 = await sarah({}, { year: 'all' }, { months: null, closure: false });
  const s3 = await openSetup(base, v3.t, { hash: 'hours:year' });
  if (!s3.has('[data-act="openMonths"]')) await s3.click('yearClosed');
  await s3.click('openMonths');
  for (const m of [2, 6, 10]) await s3.click(`[data-chip="closedm:${m}"]`);
  await s3.click('monthsUse');
  assert.match(s3.text(), /Pick one stretch here, then add the other under Closures and holidays\./);
  assert.ok(s3.acts().includes('go:closures'), s3.acts().join(' | '));
});

test('3. Kind labels: her chip order ("Whitewater rafting" first), "Wildlife viewing" (no bears in her words), and never "All year: …" for a company that runs part of the year', async () => {
  const { v } = await sarah();
  const cu = app.getVenue(v.id).cuisine;
  assert.match(cu, /^Whitewater rafting (?:·|&) [Ww]ildlife viewing$/, cu);
  const pe = plain(page(v)), pf = plain(page(v, 'fr'));
  assert.doesNotMatch(pe, /All year:|bear viewing/i);
  assert.match(pe, /Summer: whitewater rafting · Winter: wildlife viewing/);
  assert.doesNotMatch(pf, /Toute l’année :/);
  assert.match(pf, /Hiver : observation de la faune/);
  // Bears in the owner's own words keep "Wildlife and bear viewing".
  const b = await sarah({ name: 'Bear Floats T17', description: 'Black bear viewing floats on the river, May to September.', cuisine: 'Bear viewing' }, { kinds: ['wildlife'] });
  assert.match(app.getVenue(b.v.id).cuisine, /Wildlife and bear viewing/);
  // The kind's own months come from her trip's name ("(December to January)"), the rest from the company season.
  assert.deepEqual(app.tourKindSeasons(v.id), { raft: 'summer', wildlife: 'winter' });
});

test('4. Build My Trip: "rafting near Kelowna in July" offers the Vernon and Coldstream rafting companies next to Kelowna\'s (EN + FR); undated rafting plans May 1; "Hotel pickup" leads Why it fits and no-car / hotel words are used; the planned trip\'s own departure and length', async () => {
  const wh = mk('tour', { name: 'Kelowna Rafting T17', cuisine: 'Whitewater rafting', rating: 4.5, reviews: 300, hours: JSON.stringify(WK('08:00', '18:00')) });
  const cor = mk('tour', { name: 'Canadian Outback Rafting T17', region: 'coldstream', cuisine: 'Whitewater rafting & eagle-viewing floats', rating: 4.7, reviews: 500, latitude: 50.2210, longitude: -119.2480, address: '40900 Vernon Valley Rd, Coldstream' });
  const { v } = await sarah({}, { pickup: true });
  for (const [q, lang] of [['rafting near Kelowna in July'], ['rafting près de Kelowna en juillet', 'fr'], ['rafting around Kelowna in July'], ['rafting from Kelowna in July']]) {
    const p = plan(q, lang), names = namesOf(p);
    for (const x of [wh, cor, v]) assert.ok(names.includes(x.name), `${q}: ${x.name} in ${JSON.stringify(names)}`);
    assert.ok(names.indexOf(wh.name) < names.indexOf(cor.name), `${q}: Kelowna's own first, then by distance`);
    assert.match(JSON.stringify(p.notes), /within about an hour of Kelowna/, q);
  }
  const fr = require('../trip-french-copy.js');
  assert.equal(fr.t3FrenchText('This includes tours within about an hour of Kelowna, in Coldstream and Vernon.'), 'Inclut des sorties à environ une heure de route de Kelowna, à Coldstream et Vernon.');
  // A dinner near Whistler stays in Whistler (only tours are widened).
  assert.ok(!itemsOf(plan('dinner near Kelowna')).some((x) => x.venue.region === 'vernon' && x.venue.type !== 'tour'));
  // Undated, in November: the coming season of rafting (May 1), not her eagle floats' December 1.
  for (const q of ['family rafting with an 8 year old', 'rafting with my kids']) {
    const p = plan(q);
    assert.ok(p.comingSeason, `${q}: ${JSON.stringify(p.notes)}`);
    assert.equal(p.comingSeason.date, '2027-05-01', q);
    assert.ok(namesOf(p).includes(v.name), `${q}: ${JSON.stringify(namesOf(p))}`);
  }
  // Hotel pickup: first in Why it fits; "hotel" and "without car" are used, not "couldn't apply".
  for (const q of ['rafting with hotel pickup in July', 'rafting without a car in July']) {
    const p = plan(q), it = itemsOf(p).find((x) => x.venue.type === 'tour');
    assert.ok(it, `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.equal(it.why[0], 'Hotel pickup', `${q}: ${JSON.stringify(it.why)}`);
    const dropped = [...((p.understood && p.understood.notUsed) || []), ...(p.unsupported || [])];
    assert.ok(!dropped.some((u) => /car|hotel/i.test(u)), `${q}: ${JSON.stringify(dropped)}`);
  }
  // The trip's own numbers: the family float is 2.5 hours (no Elaho 8 AM departure on it); the Elaho is 8 AM for a full day.
  const only = (q) => app.runTripPlan({ text: q, excludeVenueIds: db.prepare("SELECT id FROM venues WHERE type = 'tour' AND id != ?").all(v.id).map((x) => x.id) }, NOW);
  const row = (p) => (p.schedule || []).find((r) => r.venueId === v.id);
  const fam = row(only('family rafting with an 8 year old in July, no car'));
  assert.ok(fam, 'the family float is planned');
  assert.equal(fam.endMinutes - fam.startMinutes, 150, JSON.stringify(fam));
  assert.ok(!(fam.departure && fam.startMinutes === 480), JSON.stringify(fam));
  const elaho = row(only('rafting in July, no car'));
  assert.ok(elaho, 'the Elaho is planned');
  assert.equal(elaho.startMinutes, 480); assert.equal(elaho.endMinutes - elaho.startMinutes, 480, JSON.stringify(elaho));
  // The planner's own choice of trip.
  const tp = require('../trip-planner.js');
  const items = [{ name: 'Elaho River full day (Class III-IV)', age: 14, mins: 480, departs: [480] }, { name: 'Cheakamus family float', age: 6, mins: 150 }, { name: 'Winter eagle-viewing float (December to January)', mins: 120, months: [12, 1] }];
  assert.equal(tp.tourTripFor({ tourItems: items }, 'family rafting with an 8 year old', 7).name, 'Cheakamus family float');
  assert.equal(tp.tourTripFor({ tourItems: items }, 'whitewater rafting', 7).name, 'Elaho River full day (Class III-IV)');
  assert.equal(tp.tourTripFor({ tourItems: items }, 'eagle float', 1).name, 'Winter eagle-viewing float (December to January)');
});

test('5. Help: a company that runs part of the year is never told to stay "all year" (one trip winter only)', async () => {
  const { t } = await sarah();
  const cfgOf = async (p) => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await fetch(base + p).then((r) => r.text()))[1]);
  const en = (await cfgOf(`/owner/${t}/setup`)).topics, fr = (await cfgOf(`/fr/owner/${t}/setup`)).topics;
  const one = en.find((x) => x.id === 'tour-one-trip-season'), oneFr = fr.find((x) => x.id === 'tour-one-trip-season');
  assert.doesNotMatch(one.a, /Stay “all year”/); assert.match(one.a, /^<p>Keep your season as it is/);
  assert.doesNotMatch(oneFr.aFr, /Restez à « toute l’année »/);
  // A company that runs all year still gets it.
  const all = await sarah({}, { year: 'all' }, { months: null, closure: false });
  assert.match((await cfgOf(`/owner/${all.t}/setup`)).topics.find((x) => x.id === 'tour-one-trip-season').a, /Stay “all year”/);
});

test('6. French Groups line: every size chip\'s line (21+ "like whole classes" too) is French on the French page', async () => {
  const text = require('../owner-setup-text.js');
  const keys = Object.keys(text.en.tour).filter((k) => /^groupsLine(?!Label)/.test(k) && typeof text.fr.tour[k] === 'string');
  assert.ok(keys.includes('groupsLineBig'));
  const missed = [];
  for (const k of keys) for (const nn of /\{n\}/.test(text.en.tour[k]) ? [2, 6, 10, 12, 15, 20, 21, 40] : [0]) {
    const en = text.en.tour[k].replace('{n}', nn), fr = text.fr.tour[k].replace('{n}', nn);
    // (Some sizes are a restaurant's line too, with its own French: any French line of ours is right.)
    const sp = (x) => String(x).replace(/[\s\u00a0\u202f]+/g, ' ');
    for (const line of [en, `${en}.`]) { const got = sp(app.presetInLang(line, 'fr')).replace(/\.$/, ''); if (got !== sp(fr) && !/^Groupes de \d+ (?:personnes )?ou plus : (?:réservez à l’avance|veuillez réserver)$|^Groupes jusqu’à \d+/.test(got)) missed.push(`${line} -> ${got}`); }
  }
  assert.deepEqual(missed, []);
  // On her page.
  const { v, t } = await sarah();
  ok(await change(t, { visit_rows: { groups: 'Groups of 21 or more, like whole classes: please book ahead' } }));
  approveAll(v.id);
  const pf = plain(page(v, 'fr'));
  assert.match(pf, /Groupes de 21 personnes ou plus, comme des classes entières/);
  assert.doesNotMatch(pf, /like whole classes/);
  // A line of commas that isn't a preset is still split and kept as typed.
  assert.equal(app.presetInLang('Groups of 10 or more: please book ahead, private rafts too', 'fr'), 'Groups of 10 or more: please book ahead, private rafts too');
});

test('7. Story: the year-round nudge goes once the box no longer says year-round, and after "Clear it and write my own"', async () => {
  const RES = 'Guided whitewater rafting trips around Vernon. Open year-round.';
  const { t } = await sarah({ description: RES });
  const sim = await openSetup(base, t, { hash: 'story' });
  const nudge = () => sim.doc.getElementById('suStoryYearRound');
  assert.ok(nudge(), sim.text());
  assert.ok(!nudge().hidden);
  if (sim.doc.getElementById('suStoryReplace')) {
    sim.doc.getElementById('suStoryReplace').onclick(); await sim.settle();
    assert.equal(nudge().hidden, true, 'gone after Clear it and write my own');
  }
  const sim2 = await openSetup(base, t, { hash: 'story' });
  const n2 = sim2.doc.getElementById('suStoryYearRound');
  await sim2.type('suStory', 'Guided whitewater rafting trips around Vernon, May to September, and eagle floats in winter.');
  assert.equal(n2.hidden, true, 'gone once the text no longer says year-round');
  await sim2.type('suStory', 'Open all year.');
  assert.equal(n2.hidden, false);
});

test('8. Price lines: every amount for a kind of guest gets the currency ("$129 adults, $89 kids" / « 129 $ adultes, 89 $ enfants »)', async () => {
  const P = app.menuPriceWithWords, sp = (x) => String(x).replace(/[  ]/g, ' ');
  assert.equal(P('$129 adults, 89 kids'), '$129 adults, $89 kids');
  assert.equal(sp(P('$129 adults, 89 kids', 'fr')), '129 $ adultes, 89 $ enfants');
  assert.equal(P('129 adults, 89 kids'), '$129 adults, $89 kids');
  assert.equal(P('$75 adults, $45 children'), '$75 adults, $45 children');
  // Counts stay counts.
  assert.equal(P('349 per sled (2 adults, or 1 adult + 2 kids)'), '$349 per sled (2 adults, or 1 adult + 2 kids)');
  assert.equal(P('$349 per sled, 2 adults'), '$349 per sled, 2 adults');
  const { v } = await sarah();
  assert.match(plain(page(v)), /\$129 adults, \$89 kids/);
});

// Okanagan port: Okanagan's /browse search is a plain "contains" match (Whistler's word-by-word matcher and its « aigle » /
// "microbrewery" / « ours » word lists aren't on Okanagan). The order rule is ported: a kind match above a name-only one.
test('9. Search (/browse): "eagle" finds the eagle floats, above Eagle Eye Theatre; "board" finds snowboard places', async () => {
  const theatre = mk('indoor', { name: 'Eagle Eye Theatre T17', region: 'vernon', cuisine: 'Theatre', rating: 4.9, reviews: 900, description: 'Community theatre.' });
  const snow = mk('shop', { name: 'Peak Snowboard Shop T17', cuisine: 'Snowboard rentals', description: 'Snowboards and boots.' });
  const { v } = await sarah();
  const order = async (q, fr) => { const h = await fetch(`${base}${fr ? '/fr' : ''}/browse?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
    return [...h.matchAll(/data-venue-name="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')); };
  for (const [q, fr] of [['eagle']]) {
    const o = await order(q, fr), i = o.indexOf(v.name);
    assert.ok(i >= 0, `${q}: ${JSON.stringify(o)}`);
    const j = o.indexOf(theatre.name);
    assert.ok(j < 0 || j > i, `${q}: the theatre (${j}) is below her (${i})`);
  }
  assert.ok((await order('board')).includes(snow.name));
  assert.ok(app.browseStrong('Canadian Outback Rafting', 'Whitewater rafting & eagle-viewing floats', 'eagle') > app.browseStrong('Eagle Eye Theatre', 'Theatre', 'eagle'));
});

test('10. Completeness: a tour with Instagram and no Facebook is at 100% (Instagram or Facebook); other types keep both items', () => {
  const pc = require('../portal-completeness.js');
  const items = (type) => pc.itemsFor ? pc.itemsFor(type) : null;
  const base0 = { instagramUrl: 'https://www.instagram.com/x/', facebookUrl: '' };
  const score = (type) => pc.scoreCompleteness({ type, ...base0 }, {});
  const t = score('tour'), r = score('restaurant');
  const miss = (s) => (s.missing || []).map((x) => x.key);
  assert.ok(!miss(t).includes('facebook'), JSON.stringify(miss(t)));
  assert.ok(miss(r).includes('facebook'), 'a restaurant still has Facebook to add');
  const none = pc.scoreCompleteness({ type: 'tour' }, {});
  assert.ok(miss(none).includes('instagram') && miss(none).includes('facebook'));
  void items;
});
