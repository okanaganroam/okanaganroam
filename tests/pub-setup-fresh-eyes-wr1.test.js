// First-time pub owner test on Whistler (Tanya, 2026-11-14; Whistler Roam drafts/fresh-eyes-pub1-2026-11-14/REPORT.md).
// The setup code is shared, so the fixes are made here for every type that shares it: a season picked in the setup is
// named by its dates (never "Summer hours" in November), research's "Minors until 9 PM" pre-picks 9 PM on a pub's Who's
// welcome (and the default is never midnight), the finish screen names every open item, seasonal hours questions get the
// seasonal answer, her own Known for line always shows, her Groups answer is its own line beside research's Good to
// know, and a kids trip leaves a "kids until 9 PM" place by 9.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-wr1-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Powder Pub Test ${++n}`, slug: `powder-pub-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, address: `${400 + n} Water St, Kelowna`, phone: '250-555-0188', website: 'https://example.com', hours: WEEK('11:00', '01:00'),
  description: 'A fixture used only by the pub fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list, description) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const rows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const pagePath = (v, fr) => `${fr ? '/fr' : ''}/kelowna/pubs/${v.slug}`;
const md = (d) => d.toISOString().slice(5, 10);

// ---------- 1. A season picked in the setup is named by its dates ----------
test('season: the setup saves no English season name; the page says "Hours (dates) apply now" / « Heures du … au … en vigueur »', async () => {
  const src = CLIENT();
  assert.doesNotMatch(src, /'Summer hours'|'Winter hours'/, 'the setup never names a season in English');
  assert.match(src, /label: same && s0\.label \? s0\.label : ''/);
  // A season around today (yesterday to a month on) so it applies now.
  const now = new Date(`${today}T12:00:00Z`);
  const from = md(new Date(now.getTime() - 86400000)), to = md(new Date(now.getTime() + 30 * 86400000));
  const v = mk('pub', { slug: 'powder-hound-season', description_fr: 'Un pub utilisé seulement pour les tests.' }); const t = tokenFor(v.id);
  assert.equal((await change(t, { hours_seasons: [{ from, to, label: '', hours: JSON.parse(WEEK('12:00', '23:00')) }] })).status, 200);
  const en = (await get(pagePath(v))).text;
  assert.match(en, /<p class="venue-hours-note"><strong>Hours<\/strong> \([A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}\) apply now\.<\/p>/);
  assert.doesNotMatch(en, /Summer hours|Seasonal hours<\/strong>/);
  const fr = (await get(pagePath(v, true))).text;
  assert.match(fr, /<html lang="fr/);
  assert.match(fr, /<strong>Heures du \d{1,2}(?:er)? [a-zéû.]+ au \d{1,2}(?:er)? [a-zéû.]+<\/strong> en vigueur\./);
  assert.doesNotMatch(fr, /Heures saisonnières<\/strong>/);
  // A research season with its own name keeps it.
  const w = mk('pub', { slug: 'powder-hound-winter' });
  assert.equal((await change(tokenFor(w.id), { hours_seasons: [{ from, to, label: 'Winter hours', hours: JSON.parse(WEEK('12:00', '23:00')) }] })).status, 200);
  assert.match((await get(pagePath(w))).text, /<strong>Winter hours<\/strong> \(.+?\) apply now\./);
  // The kitchen screen: "In your Apr 21 – Nov 24 hours" (fr: « Pendant vos heures du 21 avr. au 24 nov. »), no season word.
  assert.equal(text.en.kitchenSeasonQ, 'In your {range} hours, when does the kitchen close?');
  assert.match(text.fr.kitchenSeasonQ, /^Pendant vos heures du \{a\} au \{b\}, à quelle heure la cuisine ferme-t-elle \?$/);
  assert.doesNotMatch(text.en.kitchenSeasonQ + text.fr.kitchenSeasonQ, /\{kind\}/);
});

// ---------- 2. Who's welcome: research's 9 PM, never midnight ----------
test('pubs: research "Minors until 9 PM" pre-picks 9 PM; the default is an hour before close, never past 9 PM', async () => {
  const v = mk('pub', { slug: 'powder-hound-minors' });
  research(v.id, [{ label: 'Known for', text: 'Après-ski and wings' }, { label: 'Kids & dogs', text: 'Minors until 9 PM' }]);
  const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(cfg.suggestKidsUntil, '21:00');
  const fr = cfgOf((await get(`/fr/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(fr.suggestKidsUntil, '21:00');
  // No research line: nothing suggested (the client's default applies).
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).suggestKidsUntil, '');
  // The client picks it (saved only with the screen) and its default never reaches midnight.
  const src = CLIENT();
  assert.match(src, /else if \(C\.pub && !S\.minors\.policy && C\.suggestKidsUntil\) \{ S\.minors\.policy = 'minors_until'; S\.minors\.until = C\.suggestKidsUntil; \}/);
  const fn = /function beforeClose\(\)\{[\s\S]*?\n {2}\}\n/.exec(src)[0] + /function minorsDefault\(\)\{[\s\S]*?\n {2}\}\n/.exec(src)[0] + /function parseWeek\(w\)\{.*\}\n/.exec(src)[0];
  const run = (week, f = 'minorsDefault') => vm.runInNewContext(`var S = { week: ${JSON.stringify(week)} }, CUR = {}, DAYS = ['mon','tue','wed','thu','fri','sat','sun']; ${fn}; ${f}();`);
  assert.match(src, /until: \(S\.pubInfo\.minors \|\| \{\}\)\.until \|\| minorsDefault\(\)/); assert.match(src, /until: BIm\.until \|\| minorsDefault\(\)/);
  const wk = (o, c) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]]));
  assert.equal(run(wk('11:00', '01:00')), '21:00', 'a 1 AM close: 9 PM, not midnight');
  assert.equal(run(wk('11:00', '00:00')), '21:00');
  assert.equal(run(wk('11:00', '23:59')), '21:00');
  assert.equal(run(wk('11:00', '20:00')), '19:00', 'an early close: an hour before');
  assert.equal(run(wk('11:00', '01:00'), 'beforeClose'), '00:00', 'the kitchen default is unchanged (an hour before close)');
});

// ---------- 3. The finish screen names every open item ----------
test('finish: two open items on one step share one button that names both ("Dietary options · Games")', () => {
  const src = CLIENT();
  assert.match(src, /function addName\(out, st, lab\)/);
  assert.match(src, /if \(seen\[st\]\) return addName\(out, st, lab\); if \(chk\.indexOf/);
  assert.match(src, /if \(seen\[st\]\) return addName\(out, st, lab\); seen\[st\] = true; out\.push\(\{ step: st, label: lab, items: true \}\); \}\);\n {4}return out;\n {2}\}\n {2}\/\/ One "To reach 100%"/);
  // Run the helper itself.
  const fn = /function addName\(out, st, lab\)\{[\s\S]*?\n {2}\}\n/.exec(src)[0];
  const out = vm.runInNewContext(`${fn}; var out = [{ step: 'offer', label: 'Dietary options', items: true }]; addName(out, 'offer', 'Games'); addName(out, 'offer', 'Games'); out;`);
  assert.equal(out[0].label, 'Dietary options · Games');
});

// ---------- 4. Help: seasonal questions get the seasonal answer ----------
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q), topics: JSON.parse(m[1]).topics };
};
test('help: "change my hours when the mountain closes" and other seasonal questions get the seasonal answer, EN + FR', async () => {
  for (const withSeason of [false, true]) {
    const v = mk('pub'); const t = tokenFor(v.id);
    if (withSeason) assert.equal((await change(t, { hours_seasons: [{ from: '04-21', to: '11-24', label: '', hours: JSON.parse(WEEK('12:00', '23:00')) }] })).status, 200);
    const en = helpBot((await get(`/owner/${t}/setup`)).text);
    for (const q of ['How do I change my hours when the mountain closes?', 'How do I change my hours for winter?', 'summer hours', 'different hours in the off-season', 'our hours change for ski season', 'we close earlier after the season']) assert.equal(en.best(q).id, 'seasonal-hours', q);
    // Not seasonal: unchanged.
    assert.equal(en.best('How do I change my hours?').id, 'hours');
    assert.equal(en.best('open past midnight').id, 'hours');
    assert.equal(en.best('I am only open some months').id, 'season');
    assert.equal(en.best('closed on christmas').id, 'closures');
    assert.equal(en.best('when does the kitchen close').id, 'pub-kitchen');
    const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
    for (const q of ['Comment changer mes heures quand la montagne ferme?', 'Comment changer mes heures pour l’hiver?', 'heures d’été', 'horaire pour la saison de ski']) assert.equal(fr.best(q).id, 'seasonal-hours', q);
    assert.equal(fr.best('Comment changer mes heures?').id, 'hours');
    // The answer: the setup's Hours first (live at once), usual hours vs the dated set; edit-link checks only for the edit page.
    const tp = en.topics.find((x) => x.id === 'seasonal-hours');
    assert.match(tp.a, /<strong>Set up your page<\/strong> → <strong>Change an answer<\/strong> → <strong>Hours<\/strong>/);
    assert.match(tp.a, /usual hours/);
    assert.match(tp.a, /saved in the setup go live straight away|you save in the setup go live straight away/);
    assert.ok(tp.a.indexOf('go live straight away') < tp.a.indexOf('edit page'), 'setup first');
    assert.doesNotMatch(tp.a, /summer hours<\/strong>,/);
    if (withSeason) assert.match(tp.a, /usual hours<\/strong> \(Nov 25 – Apr 20\) and your <strong>other hours<\/strong> \(Apr 21 – Nov 24\)\./);
    assert.match(tp.aFr, /<strong>Configurez votre page<\/strong> → <strong>Modifier une réponse<\/strong> → <strong>Heures<\/strong>/);
    assert.match(tp.aFr, /en ligne tout de suite/);
    assert.ok(!/\S[?!;:](\s|<|$)/.test(tp.aFr.replace(/<[^>]+>/g, ' ').replace(/https?:\S+/g, '')), `French spacing: ${tp.aFr}`);
  }
});

// ---------- 5. Her own Known for line always shows ----------
test('Known for: the owner’s own line is never dropped as a repeat of the description; research’s still is', () => {
  const desc = 'A ski village pub for après-ski, chicken wings, craft beer on tap and hockey on the big screens.';
  const line = 'Après-ski, chicken wings, craft beer and hockey';
  const box = { rows: [{ label: 'Known for', text: line }, { label: 'Reservations', text: 'Walk-ins only' }] };
  assert.equal(app.visitDropRepeatedKnownFor(box, desc).rows.length, 1, 'research’s repeat is left out (unchanged)');
  assert.equal(app.visitDropRepeatedKnownFor({ ...box, owner_labels: ['Known for'] }, desc).rows.length, 2, 'hers stays');
});

// ---------- 6. Groups is its own line; research's Good to know stays ----------
test('groups: her answer is a "Groups" line; research’s Good to know stays unless it is about groups; an older answer stays hers', async () => {
  const v = mk('pub', { slug: 'powder-hound-groups' }); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Après-ski and wings' }, { label: 'Good to know', text: 'Live music on weekends in winter' }]);
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(!(cfg.visitResearch || []).includes('groups'), 'research’s music line is not offered as her groups answer');
  assert.equal((await change(t, { visit_rows: { groups: 'Groups of 10 or more, call ahead.' } })).status, 200);
  const r = rows(v.id);
  assert.deepEqual(r.find((x) => x.label === 'Groups'), { label: 'Groups', text: 'Groups of 10 or more, call ahead.' });
  assert.equal((r.find((x) => x.label === 'Good to know') || {}).text, 'Live music on weekends in winter');
  assert.ok(app.venueVisitInfo(v.id).owner_labels.includes('Groups'));
  assert.ok(!app.venueVisitInfo(v.id).owner_labels.includes('Good to know'));
  const page = (await get(pagePath(v))).text;
  assert.match(page, /<span class="visit-label">Groups<\/span><span>Groups of 10 or more, call ahead\.<\/span>/);
  assert.match(page, /<span class="visit-label">Good to know<\/span><span>Live music on weekends in winter<\/span>/);
  // Changing it again changes her line only; clearing it leaves research's.
  assert.equal((await change(t, { visit_rows: { groups: 'Private room for 30.' } })).status, 200);
  assert.equal(rows(v.id).filter((x) => x.label === 'Groups').length, 1);
  assert.equal(rows(v.id).find((x) => x.label === 'Groups').text, 'Private room for 30.');
  assert.equal((await change(t, { visit_rows: { groups: '' } })).status, 200);
  assert.ok(!rows(v.id).some((x) => x.label === 'Groups'));
  assert.equal(rows(v.id).find((x) => x.label === 'Good to know').text, 'Live music on weekends in winter');
  // Research's Good to know about groups: her answer covers it and replaces it (as before).
  const g = mk('pub'); const tg = tokenFor(g.id);
  research(g.id, [{ label: 'Good to know', text: 'Large groups should book ahead' }]);
  assert.ok(cfgOf((await get(`/owner/${tg}/setup`)).text).visitResearch.includes('groups'));
  assert.equal((await change(tg, { visit_rows: { groups: 'Private room for 30.' } })).status, 200);
  assert.deepEqual(rows(g.id).map((x) => `${x.label}: ${x.text}`), ['Good to know: Private room for 30.']);
  // A line that isn't about groups (the edit page's "Groups and good to know" box) is still Good to know, in research's place.
  const e = mk('pub'); research(e.id, [{ label: 'Good to know', text: 'Live music on weekends in winter' }]);
  assert.equal((await change(tokenFor(e.id), { visit_rows: { groups: 'Free parking out back' } })).status, 200);
  assert.deepEqual(rows(e.id).map((x) => `${x.label}: ${x.text}`), ['Good to know: Free parking out back']);
  // An owner's earlier answer saved under "Good to know" is still read and changed as hers.
  assert.equal((await change(tg, { visit_rows: { groups: 'Buyouts for 60.' } })).status, 200);
  assert.deepEqual(rows(g.id).map((x) => `${x.label}: ${x.text}`), ['Good to know: Buyouts for 60.']);
});

// ---------- 7. Build My Trip: a kids visit ends by the kids-until time ----------
test('planner: on a kids trip a "minors until 9 PM" pub is left by 9 PM; the caveat stays; adults trips unchanged', async () => {
  const p = mk('pub', { name: 'Kidstime Taphouse Pub', slug: 'kidstime-taphouse-pub', hours: WEEK('11:00', '01:00'), kid_friendly: 1 }); const t = tokenFor(p.id);
  assert.equal((await change(t, { pub_info: { minors: { policy: 'minors_until', until: '21:00' } } })).status, 200);
  const plan = (txt) => fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).then((r) => r.json());
  const stopsOf = (j) => (j.days || []).flatMap((d) => d.stops || []).concat((j.itinerary || {}).stops || [], (j.outing || {}).stops || []).filter((s) => s && s.venue && s.venue.id === p.id);
  const rowOf = (j) => (j.schedule || []).find((r) => r.venueId === p.id);
  const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  let checked = 0;
  try {
    for (const q of ['Saturday evening in Kelowna with the kids: dinner, then Kidstime Taphouse Pub', 'Saturday in Kelowna with our kids, ending at Kidstime Taphouse Pub in the evening', 'Family evening in Kelowna on Saturday at Kidstime Taphouse Pub after dinner']) {
      const j = await plan(q);
      const s = stopsOf(j), row = rowOf(j);
      if (!s.length) continue;
      assert.ok(s[0].caveats.some((c) => /^Kids welcome with an adult until 9 PM/.test(c)), JSON.stringify(s[0].caveats));
      if (row && Number.isFinite(row.endMinutes)) { checked++; assert.ok(row.endMinutes <= 21 * 60, `${q}: ends ${row.endMinutes}`); }
    }
    // The scheduler directly: an evening stop after a long afternoon ends by 9 PM (shortened) or isn't timed there.
    const planner = require('../trip-planner.js');
    const facts = [{ id: 1, type: 'pub', name: 'Kids Pub', region: 'kelowna', latitude: 49.88, longitude: -119.49, hours: WEEK('11:00', '01:00'), kidsUntil: '21:00', features: { kid_friendly: true }, collections: [], activities: [] }];
    const mkPlan = () => ({ kind: 'itinerary', days: [], itinerary: { stops: [{ kind: 'venue', label: 'Evening', daypart: 'evening', venue: { id: 1, name: 'Kids Pub' }, caveats: [] }] } });
    const run = (kids, start) => { const pl = mkPlan(); planner.scheduleTripByHours(pl, { facts, intent: kids ? { party: { kids: true } } : {}, tripDate: '2027-02-06' }, { items: [], conflicts: [], startDate: '2027-02-06', startMinutes: start }); return pl.schedule[0]; };
    if (typeof planner.scheduleTripByHours === 'function') {
      const kidsRow = run(true, 19 * 60 + 35);
      assert.ok(Number.isFinite(kidsRow.endMinutes) && kidsRow.endMinutes <= 21 * 60 && kidsRow.endMinutes - kidsRow.startMinutes >= 45, JSON.stringify(kidsRow));
      // After a 7:30 dinner (7:50 PM start): shortened to end at 9 PM, not dropped.
      const squeezed = run(true, 19 * 60 + 50);
      assert.equal(squeezed.endMinutes, 21 * 60, JSON.stringify(squeezed)); assert.ok(squeezed.endMinutes - squeezed.startMinutes >= 60);
      const late = run(true, 20 * 60 + 40);
      assert.ok(!Number.isFinite(late.endMinutes) || late.endMinutes <= 21 * 60, JSON.stringify(late));
      const adults = run(false, 19 * 60 + 35);
      assert.ok(adults.endMinutes > 21 * 60, `adults keep their visit: ${JSON.stringify(adults)}`);
      checked++;
    }
  } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; }
  assert.ok(checked > 0, 'at least one timed check ran');
});

// ---------- 8. Small things ----------
test('small: chips follow typing; kitchen-time screen has its own address; one return heading; only touched tiles are sent', () => {
  const src = CLIENT();
  assert.match(src, /var quickTyped = function\(e\)\{/);
  assert.match(src, /screen\.addEventListener\('input', quickTyped\)/);
  assert.match(src, /\['hours:kitchen', 'hours:kitchentime', 'offer:sports', 'offer:minors'\]\.indexOf\(s0\)/);
  assert.match(src, /else if \(C\.pub && startAt === 'hours:kitchentime'\) \{ S\.hist = \['start', 'hours:kitchen'\]; S\.step = startAt; S\.toList = true; \}/);
  assert.match(src, /x = any \? q\(T\.soFarQ, /);
  assert.doesNotMatch(src, /S\.fresh \? T\.welcome : T\.soFarQ/);
  assert.equal(text.en.soFarQ, 'Your answers so far'); assert.match(text.fr.soFarQ, /^Vos réponses jusqu’ici$/);
  assert.match(src, /var sendB = \{\}; Object\.keys\(badges\)\.forEach\(function\(b\)\{ if \(!!badges\[b\] !== !!S\.savedBadges\[b\]\) sendB\[b\] = badges\[b\]; \}\);/);
  assert.match(src, /if \(Object\.keys\(sendB\)\.length\) list\.push\(\{ badges: sendB \}\);/);
  assert.doesNotMatch(src, /list\.push\(\{ badges: badges \}\)/);
});
