// Third first-time pub owner test on Whistler (Priya, iPad, 2026-11-14; Whistler Roam
// drafts/fresh-eyes-pub3-2026-11-14/REPORT.md). The setup code is shared, so the fixes are made here for every type:
// "How often?" on the setup's events screen (her open mic is the first Thursday only), "Change my Apr 20 – Jun 30 hours"
// on the reopened year question (summer/winter reset the season's own day hours), "second happy hour" help, research
// text in the Known for / booking / groups boxes selected on first tap with a ✕, All ages and Free parking pre-picked from
// research, "Every day:" deals, $2 spend steps, Build My Trip's "Dinner at 7 PM at X" and "at 7pm", and no "from" before
// the reviews count.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-wr3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const tp = require('../trip-planner.js');
const req = require('../trip-requirements.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[o, c]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Junction Tap Test ${++n}`, slug: `junction-tap-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, reviews: 188, address: `${700 + n} Water St, Kelowna`, phone: '250-555-0178', website: 'https://example.com', hours: WEEK('12:00', '23:59'),
  description: 'A fixture used only by the third pub fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, extra = { setup_frequency: true }) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, ...extra, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const fn = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const night = (o) => ({ days: ['thu'], kind: 'open_mic', title: 'Open mic', start: '20:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null, season_from: null, season_to: null, ...o });
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q), topics: JSON.parse(m[1]).topics };
};

// ---------- 1. "How often?" on the setup's events screen ----------
test('how often: the setup offers the edit page’s list, and a 1st-of-the-month open mic saved from it goes live and shows only on first Thursdays', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.nightFreqs, [['weekly', 'Every week'], ['biweekly', 'Every other week'], ['monthly-1st', '1st of the month'], ['monthly-last', 'Last of the month'], ['monthly-1st-3rd', '1st & 3rd of the month'], ['monthly-2nd-4th', '2nd & 4th of the month']]);
  const fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.deepEqual(fr.nightFreqs.map((x) => x[1]), ['Chaque semaine', 'Une semaine sur deux', '1er du mois', 'Dernier du mois', '1er et 3e du mois', '2e et 4e du mois']);
  assert.equal(text.en.howOften, 'How often?'); assert.equal(text.fr.howOften, 'À quelle fréquence ?');
  // The edit page uses the same words.
  assert.match((await get(`/owner/${t}`)).text, /<option value="monthly-1st"[^>]*>1st of the month<\/option>/);
  const r = await change(t, { weekly_nights: [night({ frequency: 'monthly-1st' }), night({ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00' })] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(app.venueWeeklyNightsList(v.id).map((x) => `${x.title}|${x.frequency}`).sort(), ['Open mic|monthly-1st', 'Trivia|weekly'], 'live right away (a setup save goes live)');
  const list = app.venueWeeklyNightsList(v.id); const mic = list.find((x) => x.title === 'Open mic');
  assert.equal(mic.frequency, 'monthly-1st');
  // Thursday Dec 3, 2026 is the first Thursday; Dec 10 and Dec 31 are not.
  assert.equal(app.nightOnDate(mic, '2026-12-03'), true); assert.equal(app.nightOnDate(mic, '2026-12-10'), false); assert.equal(app.nightOnDate(mic, '2026-12-31'), false);
  const tonight = (iso) => (app.weeklyNightsTodayFor([app.getVenueById ? app.getVenueById(v.id) : { ...v, hours: WEEK('12:00', '23:59') }], new Date(iso)).byId.get(v.id) || { today: [] }).today.map((x) => x.title);
  assert.deepEqual(tonight('2026-12-03T20:00:00Z'), ['Open mic']);
  assert.deepEqual(tonight('2026-12-10T20:00:00Z'), []);
  // The page says which Thursday.
  assert.match((await get(`/kelowna/pubs/${v.slug}`)).text, /1st Thu/);
  // Reloaded, the setup starts from it (and Change an answer can show it).
  const again = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(again.cur.weekly_nights.find((x) => x.title === 'Open mic').frequency, 'monthly-1st');
});

test('how often: "Every week" picked in the setup is kept (setup_frequency); an older setup page still carries the waiting or live one', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  assert.equal((await change(t, { weekly_nights: [night({ frequency: 'monthly-1st' })] })).status, 200);
  // The new setup sends what she picked: every week now.
  assert.equal((await change(t, { weekly_nights: [night({ frequency: 'weekly' })] })).status, 200);
  assert.equal(app.venueWeeklyNightsList(v.id)[0].frequency, 'weekly');
  // An older setup page (no setup_frequency) sent every row as weekly: the live how often is carried, as before.
  assert.equal((await change(t, { weekly_nights: [night({ frequency: 'biweekly' })] })).status, 200);
  assert.equal((await change(t, { weekly_nights: [night({ frequency: 'weekly', start: '20:30' })] }, {})).status, 200);
  assert.equal(app.venueWeeklyNightsList(v.id)[0].frequency, 'biweekly');
  // The rule itself; the season carry is unchanged.
  const live = [night({ frequency: 'monthly-last', season_from: '06-01', season_to: '09-30' })];
  assert.equal(app.ownerNightsKeepFrequency([night()], null, live)[0].frequency, 'monthly-last');
  assert.equal(app.ownerNightsKeepFrequency([night()], null, live, { ownFrequency: true })[0].frequency, 'weekly');
  const lost = [night({ frequency: 'monthly-last' })];
  assert.equal(app.ownerNightsKeepFrequency([night()], lost, live, { ownFrequency: true })[0].season_from, '06-01');
});

test('how often: the client shows "How often?" per event, keeps it on reload and in the "unchanged" check, sends it, and names it on the Events row', () => {
  const s = CLIENT();
  assert.match(s, /'<label class="su-q" for="ntf' \+ i \+ '">' \+ h\(T\.howOften\) \+ '<\/label><select class="su-field su-often-pick" id="ntf' \+ i \+ '" data-ntf="' \+ i \+ '">'/);
  assert.match(s, /nightAppt\(e\) \|\| !\(C\.nightFreqs \|\| \[\]\)\.length \? ''/, 'not for a tour by appointment');
  assert.match(s, /freq: nightFreqOf\(x\.frequency\) \}; e\.was = nightKey\(e\);/);
  assert.match(s, /frequency: appt \? 'appointment' : nightFreqOf\(e\.freq\)/);
  assert.match(s, /S\.nights\[\+inp\.getAttribute\('data-ntf'\)\]\.freq = nightFreqOf\(inp\.value\);/);
  assert.match(s, /from_setup: true, setup_frequency: true,/);
  assert.doesNotMatch(s, /suEventsOften/);
  const C = { nightFreqs: [['weekly', 'Every week'], ['monthly-1st', '1st of the month']] };
  const lib = new Function('C', 'daysKey', 'seaKey', `${fn(s, 'nightFreqOf')}\n${fn(s, 'nightKey')}\n${fn(s, 'freqLabel')}\nreturn { nightFreqOf, nightKey, freqLabel };`)(C, (d) => Object.keys(d).filter((k) => d[k]).join(','), () => '');
  assert.equal(lib.nightFreqOf('monthly-1st'), 'monthly-1st'); assert.equal(lib.nightFreqOf('appointment'), 'weekly'); assert.equal(lib.nightFreqOf(undefined), 'weekly'); assert.equal(lib.nightFreqOf('fortnightly'), 'weekly');
  const e = { days: { thu: true }, kind: 'open_mic', what: 'Open mic', start: '20:00', freq: 'weekly' };
  const k0 = lib.nightKey(e); e.freq = 'monthly-1st';
  assert.notEqual(lib.nightKey(e), k0, 'a changed how often is sent, not the stored row');
  // Events row in Change an answer: "Open mic: 1st of the month".
  const T = { stOften: text.en.stOften };
  const S = { done: { music: 'live' }, nightsSaved: [{ title: 'Open mic', frequency: 'monthly-1st' }, { title: 'Trivia', frequency: 'weekly' }] };
  const line = new Function('S', 'T', 'C', 'fill', `${fn(s, 'freqLabel')}\n${fn(s, 'musicOftenLine')}\nreturn musicOftenLine();`)(S, T, C, (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => o[k]));
  assert.equal(line, 'Open mic: 1st of the month');
  assert.match(s, /\(s === 'music' && musicOftenLine\(\) \? ' · ' \+ h\(musicOftenLine\(\)\) : ''\)/);
  assert.equal(text.fr.stOften, '{title} : {often}');
});

test('help: on the setup, "how often" and "first Thursday" are answered from the setup itself (no "we check changes first"); the edit page keeps its answer', async () => {
  for (const type of ['pub', 'restaurant', 'brewery', 'cafe']) {
    const v = mk(type); const t = tokenFor(v.id);
    const en = helpBot((await get(`/owner/${t}/setup`)).text);
    for (const q of ['how often', 'Open mic is the first Thursday only', 'trivia every other week']) assert.equal(en.best(q).id, 'weekly-nights', `${type}: ${q}`);
    const tp0 = en.topics.find((x) => x.id === 'weekly-nights');
    assert.match(tp0.a, /<strong>How often\?<\/strong>/); assert.match(tp0.a, /1st of the month/);
    assert.doesNotMatch(tp0.a, /check changes first|check it first|edit link/);
    const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
    assert.equal(fr.best('à quelle fréquence').id, 'weekly-nights');
    assert.match(fr.topics.find((x) => x.id === 'weekly-nights').aFr, /À quelle fréquence \?/);
  }
  const edit = helpBot((await get(`/owner/${tokenFor(mk('pub').id)}`)).text);
  assert.match(edit.topics.find((x) => x.id === 'weekly-nights').a, /Weekly nights/);
  // Distilleries and lounges keep their own topics, which now say setup can do it.
  assert.match(app.COCKTAIL_SETUP_HELP_TOPICS.find((x) => x.id === 'cocktail-djs').a, /Pick it under <strong>How often\?<\/strong>/);
  assert.match(app.DISTILLERY_SETUP_HELP_TOPICS.find((x) => x.id === 'distillery-tours').aFr, /À quelle fréquence\?/);
});

// ---------- 2. The reopened year question with a stored season ----------
test('year question: with a stored season it offers "Change my Apr 20 – Jun 30 hours" (EN and FR), never summer/winter that would reset its days', () => {
  const s = CLIENT();
  assert.match(s, /\(storedSea\(\) \? big\('✎', fill\(T\.seaChange, storedSea\(\)\), T\.seaChangeSub, true, 'yearSeasonEdit'\) : big\('☀️', T\.allYearSummer/);
  assert.match(s, /if \(k === 'yearSeasonEdit'\) \{ if \(APPT\) S\.wYearPick = 'all'; S\.sea\.on = true; S\.sea\.open = \{\}; S\.seaTouched = true; S\.dirty = 'hours'; return go\('hours:season'\); \}/);
  // Never over a stored season's dates and day hours.
  assert.match(s, /var keepStored = !!\(S\.sea\.week && \(CUR\.hours_seasons \|\| \[\]\)\.length\);\n\s+S\.sea\.kind = v; if \(!keepStored\) \{/);
  assert.match(s, /var keepSt = !!\(S\.sea\.week && \(CUR\.hours_seasons \|\| \[\]\)\.length\);/);
  // The all-year keep/remove confirm from #871 stays.
  assert.match(s, /if \(k === 'yearAll' && S\.sea\.on && \(CUR\.hours_seasons \|\| \[\]\)\.length && seaSpan\(S\.sea\)\) return go\('hours:yeardrop'\);/);
  // storedSea, run: Apr 20 – Jun 30 in both languages.
  for (const [lang, want] of [['en', 'Change my Apr 20 – Jun 30 hours'], ['fr', 'Modifier mes heures du 20 avr. au 30 juin']]) {
    const C = { lang, monthNames: lang === 'fr' ? ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
    const S = { sea: { on: true, week: { sun: [['12:00', '22:00']] }, exact: { from: '04-20', to: '06-30' } } };
    const seaOut = (o) => ({ ok: true, from: o.exact.from, to: o.exact.to });
    const got = new Function('S', 'CUR', 'C', 'seaOut', `${fn(s, 'monthName')}\n${fn(s, 'mdLabel')}\n${fn(s, 'storedSea')}\nreturn storedSea();`)(S, { hours_seasons: [{ from: '04-20', to: '06-30' }] }, C, seaOut);
    assert.equal(text[lang].seaChange.replace('{a}', got.a).replace('{b}', got.b), want);
    assert.equal(new Function('S', 'CUR', 'C', 'seaOut', `${fn(s, 'storedSea')}\nreturn storedSea();`)(S, { hours_seasons: [] }, C, seaOut), null, 'first time: summer/winter as before');
  }
});

test('year question: a stored season reopened in the setup keeps its Sun–Wed 10 PM through a re-save', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const sea = { ...JSON.parse(WEEK('12:00', '23:59')) }; for (const d of ['sun', 'mon', 'tue', 'wed']) sea[d] = [['12:00', '22:00']];
  assert.equal((await change(t, { hours_seasons: [{ from: '04-20', to: '06-30', label: '', hours: sea }] })).status, 200);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.hours_seasons[0].hours.sun, [['12:00', '22:00']]);
  assert.equal(cfg.cur.hours_seasons[0].from, '04-20');
});

// ---------- 3. Help: a second happy hour ----------
test('help: "a second happy hour on weekends" and « deuxième 5 à 7 » get the happy hour times answer, naming + Add another happy hour and Until close', async () => {
  for (const type of ['pub', 'brewery', 'cocktail', 'restaurant']) {
    const v = mk(type); const t = tokenFor(v.id);
    const en = helpBot((await get(`/owner/${t}/setup`)).text);
    for (const q of ['How do I add a second happy hour on weekends', 'late night happy hour', 'add another happy hour', 'weekend happy hour']) assert.equal(en.best(q).id, 'hh-times', `${type}: ${q}`);
    const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
    for (const q of ['comment ajouter un deuxième 5 à 7 la fin de semaine', '5 à 7 de fin de soirée', 'deuxième 5 à 7']) assert.equal(fr.best(q).id, 'hh-times', `${type}: ${q}`);
  }
  assert.match(app.HH_TIMES_HELP_TOPIC.a, /<strong>\+ Add another happy hour<\/strong>/); assert.match(app.HH_TIMES_HELP_TOPIC.a, /<strong>Until close<\/strong>/);
  assert.match(app.HH_TIMES_HELP_TOPIC.aFr, /<strong>\+ Ajouter un autre 5 à 7<\/strong>/); assert.match(app.HH_TIMES_HELP_TOPIC.aFr, /<strong>Jusqu’à la fermeture<\/strong>/);
  // A second business still gets that answer (on the edit page, where it lives).
  const edit = helpBot((await get(`/owner/${tokenFor(mk('pub').id)}`)).text);
  for (const q of ['add a second business', 'add a second location', 'I manage two businesses']) assert.equal(edit.best(q).id, 'more-businesses', q);
  assert.equal(edit.best('How do I add a second happy hour on weekends').id, 'hh-times');
  const mb = app.OWNER_HELP_TOPICS.find((x) => x.id === 'more-businesses');
  assert.ok(!mb.keys.includes('add a second'));
});

// ---------- 4. Research text in the two-line boxes ----------
test('Known for, booking and groups boxes: research text is selected on the first tap, and they have the ✕', () => {
  const s = CLIENT();
  assert.match(s, /<textarea class="su-field su-line" id="suLine" data-vk="' \+ h\(cfg\[0\]\) \+ '"/);
  assert.match(s, /textarea\.su-area, textarea\.su-line'\), function\(inp\)\{/);
  assert.match(s, /b\.setAttribute\('aria-label', area && !line \? T\.storyClear : T\.clearField\);/);
  assert.match(s, /var vk = inp\.getAttribute\('data-vk'\), researchLine = !!vk && !!inp\.value && \(C\.visitResearch \|\| \[\]\)\.indexOf\(vk\) >= 0 && inp\.value === \(\(CUR\.visit_rows \|\| \{\}\)\[vk\] \|\| ''\);/);
  assert.match(s, /\|\| researchStory \|\| researchLine, first = true;/);
});

// ---------- 5. All ages from research's "Family friendly" ----------
test('pubs: research’s "Family friendly" pre-picks All ages (a suggestion); never "19+" research, never lounges', async () => {
  const v = mk('pub'); research(v.id, [{ label: 'Kids & dogs', text: 'Family friendly' }, { label: 'Good to know', text: 'Free parking' }, { label: 'Known for', text: 'Locals’ pub with house-brewed beer' }]);
  const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(cfg.suggestKidsAll, true);
  assert.equal(app.venuePubInfo ? (app.venuePubInfo(v.id) || {}).minors : undefined, undefined, 'nothing saved');
  const adults = mk('pub'); research(adults.id, [{ label: 'Kids & dogs', text: '19+ only, no minors' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(adults.id)}/setup`)).text).suggestKidsAll, false);
  const lounge = mk('cocktail'); research(lounge.id, [{ label: 'Kids & dogs', text: 'Family friendly' }]);
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(lounge.id)}/setup`)).text).suggestKidsAll);
  assert.match(CLIENT(), /else if \(C\.pub && !CK && !S\.minors\.policy && C\.suggestKidsAll\) S\.minors\.policy = 'all_ages';/);
});

// ---------- 6. Small fixes ----------
test('Free parking: research’s Good to know "Free parking" pre-ticks the tile on a pub (only while untouched); "no free parking" does not', async () => {
  const v = mk('pub'); research(v.id, [{ label: 'Good to know', text: 'Free parking' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).visitTicks, ['free_parking']);
  const w = mk('pub'); research(w.id, [{ label: 'Good to know', text: 'There is no free parking nearby; free Wi-Fi.' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(w.id)}/setup`)).text).visitTicks, []);
  assert.match(CLIENT(), /if \(\(C\.winery \|\| C\.brewery \|\| C\.pub \|\| C\.restaurant\) && !S\.done\.offer && !S\.visitTicksSet\) \{ S\.visitTicksSet = true; S\.visitTicked = \(C\.visitTicks \|\| \[\]\)\.filter\(function\(k\)\{ if \(S\.badges\[k\]/);
});

test('deals: a happy hour on every day reads "Every day: …" (« Tous les jours : … »); older "Mon–Sun: " deals still come back as typed', () => {
  const s = CLIENT();
  const names = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  for (const [lang, want] of [['en', 'Every day: '], ['fr', 'Tous les jours : ']]) {
    const lib = new Function('DAYS', 'dayName', 'T', `${fn(s, 'dayPrefix')}\n${fn(s, 'rangePrefix')}\n${fn(s, 'oldPrefix')}\n${fn(s, 'prefixOf')}\nreturn { dayPrefix, prefixOf };`)(DAYS, (d) => names[d], text[lang]);
    const all = { days: Object.fromEntries(DAYS.map((d) => [d, true])) };
    assert.equal(lib.dayPrefix(all), want);
    for (const stored of [`${want}$6 pints`, 'Mon–Sun: $6 pints', 'Mon, Tue, Wed, Thu, Fri, Sat, Sun: $6 pints']) { const p = lib.prefixOf(all, stored); assert.ok(p, stored); assert.equal(stored.slice(p.length), '$6 pints'); }
    assert.equal(lib.dayPrefix({ days: { mon: true, tue: true, wed: true, thu: true, fri: true } }), 'Mon–Fri: ');
  }
});

test('spend: − and + move $2 at a time ($1 for cafés, with their 25-cent buttons)', () => {
  const s = CLIENT();
  assert.match(s, /var SPEND_STEP = C\.cafe \? 1 : 2;/);
  assert.match(s, /data-act="spend:-' \+ SPEND_STEP \+ '"/); assert.match(s, /data-act="spend:' \+ SPEND_STEP \+ '"/);
  assert.match(s, /if \(k === 'spend'\) \{ S\.spend = Math\.round\(Math\.max\(C\.cafe \? 2 : 5, Math\.min\(300, S\.spend \+ \(\+v\)\)\) \* 4\) \/ 4;/, 'a value she reached is kept and stepped from');
});

test('Build My Trip: "Dinner at 7 PM at <pub>." is dinner at 7 PM, "at 7pm" too, no clock word is "not used", and "Brewpub" in a name adds no Breweries', async () => {
  const v = mk('pub', { name: 'Function Junction Brewpub', slug: 'function-junction-brewpub', cuisine: 'Pub Fare', region: 'penticton', address: '1 Main St, Penticton', latitude: 49.49, longitude: -119.59 });
  const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
  for (const q of ['Dinner at 7 PM at Function Junction Brewpub.', 'Sunday May 16: dinner at 7 PM at Function Junction Brewpub.', 'Dinner on Sunday May 16 at 7pm at Function Junction Brewpub.']) {
    const r = await plan(q);
    const row = (r.schedule || []).find((x) => x.venueId === v.id);
    assert.ok(row, q); assert.equal(row.startMinutes, 19 * 60, `${q} ${JSON.stringify((r.schedule || []).map((x) => [x.venueId, x.startMinutes, x.label || x.name]))} ${JSON.stringify(r.itinerary && r.itinerary.stops.map((x) => [x.label, x.venue && x.venue.name, x.component && x.component.meal]))}`);
    assert.deepEqual(r.understood.notUsed, [], q);
    assert.ok(!r.understood.interests.includes('breweries'), JSON.stringify(r.understood.interests));
    assert.ok(!(r.warnings || []).some((w) => /\bpm\b|7pm/i.test(w) && /Not part of this plan/.test(w)), JSON.stringify(r.warnings));
  }
  // Asked for in words outside the name, breweries stay.
  assert.ok((await plan('Dinner at Function Junction Brewpub then beers at a brewery')).understood.interests.includes('breweries'));
  // The pieces.
  const tax = { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' } };
  assert.deepEqual(req.extractTripRequirements({ text: 'Dinner at 7 PM at the pub', intent: { days: null }, taxonomy: tax }).mealMinutes, { dinner: 1140 });
  assert.deepEqual(req.extractTripRequirements({ text: 'lunch at 12:30 pm then a hike', intent: { days: null }, taxonomy: tax }).mealMinutes, { lunch: 750 });
  assert.equal(req.extractTripRequirements({ text: 'dinner at 3 am', intent: { days: null }, taxonomy: tax }).mealMinutes, undefined);
  assert.deepEqual(tp.dropNameOnlyTypes(['restaurant', 'brewery'], [{ name: 'Function Junction Brewpub', type: 'pub' }], 'dinner at function junction brewpub'), ['restaurant']);
  assert.deepEqual(tp.dropNameOnlyTypes(['brewery'], [{ name: 'Function Junction Brewpub', type: 'pub' }], 'function junction brewpub and a brewery'), ['brewery']);
});

test('Build My Trip card: "★ 4.5 out of 5 (188 reviews)" for screen readers, never "4.5 from (188 reviews)"', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  assert.ok(appJs.includes("'tripv3.from': 'out of 5',") && !appJs.includes("'tripv3.from': 'from',"));
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(page, /<span class="t3-sr">' \+ esc\(tx\('tripv3\.from'\)\) \+ ' <\/span>'/);
});
