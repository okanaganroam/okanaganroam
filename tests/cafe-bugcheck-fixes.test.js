// Café bug-check fixes on PR #844 (2026-11-12; drafts/bugcheck-cafe-2026-11-12/REPORT.md and a code review). Keep it
// simple: bugs fixed, nothing new asked. Runs on a throwaway database (like server.test.js); run
// `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-bugcheck-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const TEXT = require('../owner-setup-text.js');
const { highlightsFor } = require('../food-drink-venue-layout.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (a, b) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CBC ${type} ${++n}`, slug: `cbc-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.6, address: `${n} Main St, Penticton`, phone: '250-555-0100', hours: week('08:00', '14:00'),
  description: 'A fixture used only by the café bug-check fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const nextIp = () => `10.77.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const post = (p, body, ip = nextIp()) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, ip) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }, ip);
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const chipsRow = (html) => { const m = /<p class="chips">([\s\S]*?)<\/p>/.exec(html); return m ? m[1] : ''; };

test('A: every translated Plan your visit line still shows on French pages; English lines that are not wholly presets stay as typed', () => {
  const dir = path.join(__dirname, '..', 'data', 'french');
  const files = fs.readdirSync(dir).filter((f) => /^visit-boxes-.*\.json$/.test(f));
  assert.ok(files.length > 0);
  const dropped = [], changedEn = [];
  let count = 0;
  for (const f of files) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [en, fr] of Object.entries(list)) {
      count++;
      const row = { rows: [{ label: 'Good to know', text: en }] };
      const frHtml = app.visitInfoHtml(row, true);
      if (!frHtml) dropped.push(en);
      if (!app.isPresetAnswer(en) && app.presetInLang(en, 'en') !== en) changedEn.push(en);
      assert.ok(typeof fr === 'string');
    }
  }
  assert.ok(count > 100, String(count));
  assert.deepEqual(dropped, [], 'rows dropped from the French page');
  assert.deepEqual(changedEn, [], 'English rows rewritten');
  // The review's examples: kept whole in English, translated (not dropped) in French.
  const take = { rows: [{ label: 'Takeout', text: 'Takeout available; call to order.' }] };
  assert.match(app.visitInfoHtml(take, false), /Takeout available; call to order\./);
  assert.doesNotMatch(app.visitInfoHtml(take, false), /Call to order/);
  assert.match(app.visitInfoHtml(take, true), /appelez pour commander/);
  assert.equal(app.presetInLang('Takeout available; call to order.', 'en'), 'Takeout available; call to order.');
  // A line made only of presets is still shown in the page's language.
  assert.equal(app.presetInLang('Terrasse seulement', 'en'), 'Patio only');
  assert.equal(app.presetInLang('Patio only', 'en'), 'Patio only');
  assert.match(app.visitInfoHtml({ rows: [{ label: 'Dogs', text: 'Terrasse seulement' }] }, false), /Patio only/);
  assert.match(app.visitInfoHtml({ rows: [{ label: 'Dogs', text: 'Patio only' }] }, true), /Terrasse seulement/);
  // Closure notes: an English note of her own stays as written; a holiday name follows the page.
  assert.equal(app.closureNoteFor('Staff party, back at 9', false), 'Staff party, back at 9');
  assert.equal(app.closureNoteFor('Noël', false), 'Christmas Day');
  assert.equal(app.closureNoteFor('Christmas Day', true), 'Noël');
  assert.equal(app.closureNoteFor('Closed Remembrance Day (Nov 11), Christmas Day, Boxing Day and New Year\'s Day.', false), 'Closed Remembrance Day (Nov 11), Christmas Day, Boxing Day and New Year\'s Day.');
});

test('B: the setup address follows the step on screen, and a reload or language switch lands on it with the same way forward', () => {
  // Kept in step as she moves (no stale #closures from a language switch).
  assert.match(CLIENT, /function navSync\(\)\{[\s\S]*?history\.replaceState\(\{ suNav: r \}, '', url\)/);
  assert.match(CLIENT, /screen\.innerHTML = x;\n    wire\(\);\n    navSync\(\);/);
  // Screens with no step of their own (Welcome back, the end) clear the hash, so a reload shows the Welcome back list.
  assert.match(CLIENT, /url = location\.pathname \+ location\.search \+ \(r\.h \? '#' \+ r\.h : ''\)/);
  // On load: only a matching record is used (a checklist link keeps its "back to the list").
  assert.match(CLIENT, /if \(navWas && navWas\.h !== startAt\) navWas = null;/);
  assert.match(CLIENT, /if \(navWas\) \{ S\.toList = !!navWas\.toList; S\.toFinish = !!navWas\.toFinish; S\.toEss = !!navWas\.toEss; \}/);
  // G: a language switch keeps where a first pass goes next (the record is kept for the twin page, one use).
  assert.match(CLIENT, /function navKeep\(\)\{ try \{ var r = navRec\(\); r\.at = Date\.now\(\); window\.sessionStorage\.setItem\(navKey\(\), JSON\.stringify\(r\)\); \} catch \(e\) \{\} \}/);
  assert.match(CLIENT, /window\.sessionStorage\.removeItem\(navKey\(\)\)/);
  // The edit screens open straight from the address.
  assert.match(CLIENT, /else if \(startAt === 'hours:edit' \|\| startAt === 'basics:edit'\) \{ S\.hist = \['start', base\(startAt\)\]; S\.step = startAt; \}/);
});

test('C: a language switch mid-edit reopens the edit screen with the draft; unsaved answers are never shown as saved', () => {
  assert.match(CLIENT, /if \(s0 === 'hours:edit' \|\| s0 === 'hours:season'\) return 'hours:edit';/);
  assert.match(CLIENT, /if \(s0 === 'basics:edit'\) return s0;/);
  assert.match(CLIENT, /function pending\(step\)\{ return S\.dirty === step && !!DR\.restored\[step\]; \}/);
  // No "✓ Saved" line and no "Next" (which sent nothing) over a restored draft: only the screen's own Save moves on.
  assert.match(CLIENT, /function doneLine\(step\)\{\n    var d = S\.done\[step\]; if \(!d \|\| d === 'skip' \|\| d === 'later'\) return '';\n[^\n]*\n    if \(pending\(step\)\) return '';/);
  assert.match(CLIENT, /if \(answered\(step\) && pending\(step\)\) return '';/);
  assert.match(CLIENT, /if \(drApply\(b\)\) \{ S\.dirty = b; DR\.restored\[b\] = true; render\(\); return true; \}/);
  assert.match(CLIENT, /delete DR\.restored\[step\];/);
});

test('D: the setup save limit is per place (with a high per-IP ceiling); a 429 says so kindly in the setup', async () => {
  const ip = '10.99.0.1';
  const a = mk('cafe'), b = mk('cafe');
  const ta = tokenFor(a.id), tb = tokenFor(b.id);
  // Two places behind one network: well past the old 80 an hour, all saved.
  for (let i = 0; i < 120; i++) { const r = await post(`/owner/${ta}/setup/progress`, { step: 'basics', status: 'skip' }, ip); assert.equal(r.status, 200, `a ${i}`); }
  for (let i = 0; i < 60; i++) { const r = await post(`/owner/${tb}/setup/progress`, { step: 'basics', status: 'skip' }, ip); assert.equal(r.status, 200, `b ${i}`); }
  ok(await change(tb, { cafe_info: { year: 'all' } }, ip));
  // One place's own budget still ends (300 an hour), with the kind message.
  let last;
  for (let i = 0; i < 200; i++) { last = await post(`/owner/${ta}/setup/progress`, { step: 'basics', status: 'skip' }, `10.98.${i >> 8}.${i & 255}`); if (last.status === 429) break; }
  assert.equal(last.status, 429);
  assert.equal(last.body.rate_limited, true);
  assert.match(last.body.error, /Nothing you entered is lost/);
  // The client shows its own words (in the page's language) on a 429.
  assert.match(CLIENT, /if \(r\.status === 429\) return \{ ok: false, error: T\.tooFast \|\| T\.failed, rateLimited: true \};/);
  assert.match(TEXT.en.tooFast, /Nothing you entered is lost/);
  assert.match(TEXT.fr.tooFast, /Rien de ce que vous avez entré n’est perdu/);
  // The per-IP ceiling and the classic limits.
  assert.match(SERVER, /const SETUP_RATE_LIMIT = 300;/);
  assert.match(SERVER, /const SETUP_RATE_LIMIT_IP = 1000;/);
});

test('E, F: picked files are not dropped by a language switch; the switch link escapes the query', () => {
  assert.match(CLIENT, /if \(S\.step === 'photos:review' && goodPhotos\(\)\.length && S\.rights\) \{ S\.langGo = true; S\.exitAfter = true; sendPhotos\(\); return false; \}/);
  assert.match(CLIENT, /if \(S\.photos\.length \|\| S\.menuFiles\.length \|\| S\.menuPages\.length \|\| S\.sheetFiles\.length\) \{ S\.langGo = true; askExit\(\); return false; \}/);
  assert.match(SERVER, /if \(typeof window\.suBeforeLang === 'function' && window\.suBeforeLang\(\) === false\) return;/);
  assert.doesNotMatch(SERVER, /withTwinLangSwitch\([^\n]*search\.replace\(\/&\/g, '&amp;'\)/);
});

test('H, I: café hours saved but holidays not done says "Next: Holidays and closures"; off-season holidays are covered', () => {
  assert.match(CLIENT, /if \(half\(step\)\) return '<div class="su-stack" style="margin-top:14px">' \+ big\('➜', nextLabel\(step\), '', true, 'after:' \+ step\) \+ '<\/div>';/);
  assert.match(CLIENT, /function holCovered\(o\)\{ return coveredBy\(o\.date\) \|\| offSeason\(o\.date\); \}/);
  // Open Apr 15 – Oct 15: Christmas is outside, July 1 inside; a season over New Year wraps.
  const off = new Function('S', /function offSeason\(date\)\{[^\n]*\}/.exec(CLIENT)[0] + '; return offSeason;');
  const f = off({ openSea: { from: '04-15', to: '10-15' } });
  assert.equal(f('2026-12-25'), true); assert.equal(f('2027-07-01'), false); assert.equal(f('2026-04-14'), true); assert.equal(f('2026-10-15'), false);
  const w = off({ openSea: { from: '11-15', to: '04-15' } });
  assert.equal(w('2026-12-25'), false); assert.equal(w('2027-07-01'), true);
  assert.equal(off({ openSea: null })('2026-12-25'), false);
  assert.ok(TEXT.en.holSeason && TEXT.fr.holSeason);
});

test('J, K: French month abbreviations end in a dot like the rest of the site; French colon spacing on the public page', async () => {
  assert.match(SERVER, /monthNames: fr \? \['janv\.', 'févr\.', 'mars', 'avr\.', 'mai', 'juin', 'juill\.', 'août', 'sept\.', 'oct\.', 'nov\.', 'déc\.'\]/);
  // "de juin à sept.." never doubles the dot.
  const fill = new Function(/function fill\(s, o\)\{[^\n]*\}/.exec(CLIENT)[0] + '; return fill;')();
  assert.equal(fill('de {a} à {b}.', { a: 'juin', b: 'sept.' }), 'de juin à sept.');
  assert.equal(fill('{n} photos', { n: 2 }), '2 photos');
  const c = mk('cafe'); const t = tokenFor(c.id);
  const soon = app.todayLocal(new Date(Date.now() + 5 * 86400000));
  ok(await change(t, { closures: [{ from: soon, to: soon, note: 'Christmas Day' }] }));
  const fr = page(c, 'fr');
  assert.match(fr, /Fermetures spéciales\u00a0:/);
  assert.doesNotMatch(fr, /Fermetures spéciales:/);
  assert.match(page(c, 'en'), /Special closures:<\/strong>/);
});

test('L: the French café page shows the same four chips as the English one, dietary first, "(cuisine partagée)" kept', async () => {
  const c = mk('cafe'); const t = tokenFor(c.id);
  ok(await change(t, { badges: { vegan: true, vegetarian: true, gluten_free: true, patio: true, dog_friendly: true, kid_friendly: true, live_music: true, lake_view: true } }));
  ok(await change(t, { cafe_info: { diet: { milks: ['oat'], milk_extra: 'no', gf_kitchen: 'shared' } } }));
  const en = /<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(page(c, 'en'))[1];
  const enTop = (en.match(/<span>[^<]*<\/span>/g) || []).slice(0, 4).map((s) => s.replace(/<\/?span>/g, ''));
  assert.deepEqual(enTop.map((s) => s.split(' ')[0]), ['🌱', '🥗', '🌾', '🐾']);
  const row = chipsRow(page(c, 'fr'));
  const labels = (row.match(/<span class="chip chip-vb[^"]*">[\s\S]*?<\/span>(?=\s|$)/g) || []).map((s) => s.replace(/<[^>]+>/g, '').trim());
  assert.ok(labels.some((l) => /Options sans gluten \(cuisine partagée\)/.test(l)), labels.join(' | '));
  // Review fix (2026-11-12): the four lead (dietary first), then every other chip still shows (music, lake, patio, kids).
  const vg = labels.findIndex((l) => /végan/i.test(l)), vgt = labels.findIndex((l) => /végétarien/i.test(l)), gfi = labels.findIndex((l) => /sans gluten/i.test(l));
  assert.deepEqual([vg, vgt, gfi], [0, 1, 2], labels.join(' | '));
  for (const re of [/musique/i, /lac/i, /terrasse/i, /enfants/i]) assert.equal(labels.filter((l) => re.test(l)).length, 1, `${re} once: ${labels.join(' | ')}`);
  assert.equal(labels.filter((l) => /sans gluten/i.test(l)).length, 1, labels.join(' | '));
  // Happy hour: a chip when the page has no happy-hour line, none when it does (skipHappyHour, as on the English page).
  const hhVenue = { ...app.getVenue(c.id), happy_hour: 1 };
  assert.match(app.cafeFrChipsHtml(hhVenue, undefined), /Happy hour|5 à 7|Heure/i);
  assert.equal(app.cafeFrChipsHtml(hhVenue, undefined, { skipHappyHour: true }), app.cafeFrChipsHtml({ ...hhVenue, happy_hour: 0 }, undefined));
  // The same keys as the English page's four.
  const keys = highlightsFor({ vegan: 1, vegetarian: 1, gluten_free: 1, patio: 1, dog_friendly: 1, kid_friendly: 1, live_music: 1, lake_view: 1 }, null, { highlightFirst: ['vegan', 'vegetarian', 'gluten'], returnKeys: true });
  assert.deepEqual(keys, ['vegan', 'vegetarian', 'gluten', 'dog']);
  // Restaurants keep the full French chip row.
  const r = mk('restaurant'); ok(await change(tokenFor(r.id), { badges: { vegan: true, patio: true, live_music: true, lake_view: true, kid_friendly: true } }));
  assert.match(chipsRow(page(r, 'fr')), /Musique/i);
});

test('M: the specials "closed on" warning counts a day open in any of the special\'s seasons as open', () => {
  const src = /function closedWarn\(days, sea\)\{[\s\S]*?\n  \}/.exec(CLIENT)[0];
  const DAYS2 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const mkFn = (S) => new Function('S', 'DAYS', 'T', 'seaMonths', 'fill', 'dayName', src + '; return closedWarn;')(S, DAYS2,
    { closedWarn: 'closed on {days}{when}', closedWarnSeason: ' (in your {kind} hours)', closedWarnUsual: ' (usual)', seasonWord: { summer: 'summer' } },
    () => Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => [m, true])),
    (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m)), (d) => d);
  const usual = { mon: [['8', '3']], tue: [['8', '3']], wed: [['8', '3']], thu: [['8', '3']], fri: [['8', '3']], sat: [['8', '3']], sun: null };
  const summer = { mon: null, tue: [['8', '3']], wed: [['8', '3']], thu: [['8', '3']], fri: [['8', '3']], sat: [['8', '3']], sun: [['8', '3']] };
  const S = { week: usual, sea: { on: true, week: summer, months: { 6: true, 7: true, 8: true }, kind: 'summer' } };
  const every = Object.fromEntries(DAYS2.map((d) => [d, true]));
  // Sun open in summer, Mon open the rest of the year: not "closed" for an all-year special.
  assert.equal(mkFn(S)(every, null), '');
  // No seasons: Sun is closed.
  assert.equal(mkFn({ week: usual, sea: { on: false, week: null, months: {} } })(every, null), 'closed on sun');
});

test('N, O: gelato prices start at a single scoop; vegan gelato ticks Vegan; the kind is not said twice', async () => {
  assert.match(CLIENT, /function cafeSpendStart\(\)\{ return S\.place === 'Ice cream & gelato' \? 6 : S\.place === 'Bubble tea' \? 7 : 9; \}/);
  assert.match(CLIENT, /if \(dv\.vegan_ice && !S\.badges\.vegan\) \{[\s\S]*?dl\.push\(\{ badges: \{ vegan: true \} \}\);/);
  const g = mk('cafe'); const t = tokenFor(g.id);
  ok(await change(t, { place_type: 'Ice cream & gelato', cafe_info: { serves: ['ice_cream', 'sorbet'] } }));
  const en = page(g, 'en');
  assert.doesNotMatch(en, /Ice cream &amp; gelato shop · Ice cream &amp; gelato/);
  assert.match(en, /Ice cream &amp; gelato shop · Sorbet/);
  // The server accepts the vegan badge saved alongside the dietary answers.
  ok(await change(t, { cafe_info: { diet: { milks: [], milk_extra: '', gf_kitchen: '', vegan_baking: false, nut_free: false, vegan_ice: true } }, badges: { vegan: true } }));
  assert.ok(app.getVenue(g.id).vegan);
});

test('Review 3: the serves line drops only what the kind itself says (Bubble tea keeps a plain "tea")', async () => {
  const b = mk('cafe');
  ok(await change(tokenFor(b.id), { place_type: 'Bubble tea', cafe_info: { serves: ['bubble_tea', 'tea', 'smoothies'] } }));
  const line = (/venue-cafe-serves[\s\S]*?<strong>([^<]*)<\/strong>/.exec(page(b, 'en')) || [])[1];
  assert.match(line, /^Bubble tea shop · Tea and smoothies &amp; juice$/, line);
  const h = mk('cafe');
  ok(await change(tokenFor(h.id), { place_type: 'Tea house', cafe_info: { serves: ['tea', 'pastries'] } }));
  assert.match(page(h, 'en'), /<strong>Tea house · Pastries<\/strong>/);
  const j = mk('cafe');
  ok(await change(tokenFor(j.id), { place_type: 'Juice & smoothie bar', cafe_info: { serves: ['smoothies', 'tea'] } }));
  assert.match((/venue-cafe-serves[\s\S]*?<strong>([^<]*)<\/strong>/.exec(page(j, 'en')) || [])[1], /· Tea$/);
});
