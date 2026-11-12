// Fifth first-time café test fixes (Dayton, Nov 12 2026; drafts/fresh-eyes-cafe5-2026-11-12/REPORT.md). The tester played
// Priya, busy, on an iPhone SE. Keep it simple: bugs fixed, in-between screens removed, nothing new asked.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test5-admin';
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
const mk = (type, o = {}) => app.createVenue({ name: `CT5 ${type} ${++n}`, slug: `ct5-${type}-${n}`, region: 'vernon', type, latitude: 50.26 + n / 1000, longitude: -119.27,
  rating: 4.6, address: `${n} 30 Ave, Vernon`, phone: '250-555-0142', hours: week('07:00', '16:00'),
  description: 'A fixture used only by the café test 5 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.75.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const setupOf = async (v, lang) => { const r = await get(`${lang === 'fr' ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`); assert.equal(r.status, 200); return r.text; };
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const topHighlights = (html) => { const m = /<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(html); return m ? m[1] : ''; };

test('1: no "Saved / Sent → Next" screen needs a tap: the ✓ line shows on the next question, announced, and honest', async () => {
  // Every route to a "saved:" screen goes through go(), which moves straight on unless the screen carries a real choice.
  assert.match(CLIENT, /var sv = \/\^saved:\(\.\+\)\$\/\.exec\(step\);\s*if \(sv && !savedKept\(sv\[1\]\)\) \{ S\.flash = savedText\(sv\[1\]\); return after\(sv\[1\]\); \}/);
  // Kept only for the pubs' "your description still mentions sports" choice.
  assert.match(CLIENT, /function savedKept\(step\)\{ return step === 'offer' && !S\.badges\.sports_tv && !S\.storyFixed && !!sportsBit\(\); \}/);
  // Nothing sets S.step to a saved screen directly (that would skip the check).
  assert.doesNotMatch(CLIENT, /S\.step = 'saved:/);
  // The line is a role="status" live region next to the screen, filled after the screen is drawn.
  assert.match(CLIENT, /toastEl\.setAttribute\('role', 'status'\); toastEl\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(CLIENT, /render\(\); showToast\(fl\);/);
  assert.match(SERVER, /body\.owner-setup \.su-toast \{/);
  // Honest wording: "Sent" with "within a day" for what we check first, "Saved … on your page now" for what is live.
  assert.match(CLIENT, /how === 'day' \? \(many \? T\.savedDayMany : T\.savedDay\)/);
  assert.match(CLIENT, /how === 'day' \? T\.sentTitle : T\.savedTitle/);
  // "them" after more than one photo (EN + FR).
  for (const L of ['en', 'fr']) { assert.ok(TEXT[L].savedDayMany && TEXT[L].sentMeansMany, L); }
  assert.match(TEXT.en.sentMeansMany, /We check them first/); assert.match(TEXT.fr.sentMeansMany, /Nous les vérifions/);
  assert.match(CLIENT, /many = step === 'photos' && S\.lastBatch > 1/);
});

test('2: an unchanged setup re-send is a 200 no-op (the edit page still says "Nothing has changed yet"); the client sends only what changed', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const day = `${Number(app.todayLocal().slice(0, 4)) + 1}-12-25`;
  ok(await change(t, { closures: [{ from: day, to: day, note: 'Christmas Day' }], cafe_info: { year: 'all' } }));
  // The same again from the setup: no error, nothing written.
  const again = await change(t, { closures: [{ from: day, to: day, note: 'Christmas Day' }] });
  assert.equal(again.status, 200, JSON.stringify(again.body)); assert.equal(again.body.ok, true); assert.equal(again.body.unchanged, true); assert.deepEqual(again.body.review, []);
  const year = await change(t, { cafe_info: { year: 'all' } });
  assert.equal(year.status, 200); assert.equal(year.body.unchanged, true);
  // The classic edit page keeps its message.
  const classic = await change(t, { closures: [{ from: day, to: day, note: 'Christmas Day' }] }, false);
  assert.equal(classic.status, 400); assert.match(JSON.stringify(classic.body), /Nothing has changed yet/);
  // A real error from the setup is still an error.
  const bad = await change(t, { hours: 'nonsense' });
  assert.equal(bad.status, 400);
  // Something waiting for review that is sent again: still a success, and named as waiting ("within a day" stays true).
  const r = mk('restaurant'); const tr = tokenFor(r.id);
  ok(await change(tr, { description: 'A brand new description for this little place by the lake.' }));
  const w = await change(tr, { description: 'A brand new description for this little place by the lake.' });
  ok(w); assert.deepEqual(w.body.review, ['description']);
  // "Your earlier changes are already waiting for review": also a no-op success from the setup.
  const x = await change(tr, { closures: [] });
  assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(x.body.unchanged, true); assert.deepEqual(x.body.review, []);
  const x2 = await change(tr, { closures: [] }, false);
  assert.equal(x2.status, 400); assert.match(JSON.stringify(x2.body), /already waiting for review/);
  // The client: closures only when they changed, the "open all year" answer only when it changed, and a memo of what this
  // visit already sent so the same answer is never posted twice.
  assert.match(CLIENT, /var cl = closuresKey\(\) === S\.closuresWas \? \[\] : \[\{ closures: out \}\];/);
  assert.match(CLIENT, /if \(C\.cafe && \(om \? 'seasonal' : 'all'\) !== S\.savedYear\) cl\.push/);
  assert.match(CLIENT, /if \(C\.cafe && \(ov \? 'seasonal' : 'all'\) !== S\.savedYear\) listH\.push/);
  assert.match(CLIENT, /parts\.every\(function\(x\)\{ return sentMemo\[x\[0\]\] && sentMemo\[x\[0\]\]\.v === x\[1\]; \}\)\) return Promise\.resolve/);
  // With nothing to send, a step that was "within a day" stays so.
  assert.match(CLIENT, /\(!statuses\.length && S\.done\[step\] === 'day'\) \? 'day' : 'live'/);
});

test('3: vegan and vegetarian options make the top highlights (a café leads with vegan); the four-chip limit stays', async () => {
  const all = { dog_friendly: 1, kid_friendly: 1, patio: 1, gluten_free: 1, vegan: 1, vegetarian: 1 };
  const r = highlightsFor(all, null, {});
  assert.equal(r.length, 4); assert.ok(r.some((h) => /Vegan/.test(h[1])), JSON.stringify(r));
  assert.equal(highlightsFor({ ...all, vegan: 0 }, null, {}).filter((h) => /Vegetarian/.test(h[1])).length, 1);
  assert.equal(highlightsFor({ dog_friendly: 1, kid_friendly: 1 }, null, {}).length, 2);
  // The café page (Priya's answers): Vegan first in the row, badge data unchanged.
  const c = mk('cafe'); const t = tokenFor(c.id);
  ok(await change(t, { badges: { vegan: true, vegetarian: true, gluten_free: true, patio: true, dog_friendly: true, kid_friendly: true } }));
  const row = topHighlights(page(c, 'en'));
  assert.match(row, /^<span>🌱 Vegan-friendly<\/span>/, row);
  assert.equal((row.match(/<span>/g) || []).length >= 4, true);
  assert.ok(app.getVenue(c.id).vegan); assert.ok(app.getVenue(c.id).vegetarian);
  // A restaurant with more than four: the vegan chip is in the row too.
  const rs = mk('restaurant'); const tr = tokenFor(rs.id);
  ok(await change(tr, { badges: { vegan: true, patio: true, dog_friendly: true, kid_friendly: true, lake_view: true, gluten_free: true } }));
  assert.match(topHighlights(page(rs, 'en')), /Vegan-friendly/);
});

test('4: the Verified pill\'s "updated" date is the site\'s local date, the same one "checked" uses', () => {
  // 12:30 AM on Nov 12 2026, Okanagan time (fixed UTC-7 since Nov 1): Intl's America/Vancouver still said Nov 11.
  const utc = '2026-11-12 07:30:00';
  assert.equal(app.todayLocal(new Date('2026-11-12T07:30:00Z')), '2026-11-12');
  assert.equal(app.ownerUpdatedDate(utc), 'Nov 12, 2026');
  assert.match(app.ownerUpdatedDate(utc, true), /^12 nov\. 2026$/);
  // Before the change (summer, PDT) nothing moves.
  assert.equal(app.ownerUpdatedDate('2026-07-02 06:30:00'), 'July 1, 2026');
  assert.match(SERVER, /const \[y, m, day\] = todayLocal\(d\)\.split\('-'\)\.map\(Number\);/);
});

test('5: every holiday tile has "This year and next", Christmas Eve and New Year\'s Eve too', async () => {
  assert.match(CLIENT, /next: ymd\(fn\(d\.getFullYear\(\) \+ 1\)\), yearly: true \}; \};/);
  assert.doesNotMatch(CLIENT, /key !== 'xmasEve'/);
  // The tick is drawn for every ticked yearly tile.
  assert.match(CLIENT, /HOL\.filter\(function\(o\)\{ return o\.yearly && S\.closures\.indexOf\(o\.key\) >= 0 && !holCovered\(o\); \}\)\.map\(function\(o\)\{ return '<label class="su-tick"/);
  const cfg = cfgOf(await setupOf(mk('cafe')));
  assert.equal(cfg.t.everyYear, 'This year and next');
});

test('6 + 7: Sat–Sun copy beside Mon–Fri (closed days stay closed), shorter hours list, nothing pinned on short screens', async () => {
  assert.match(CLIENT, /data-copywe="' \+ d \+ '">' \+ h\(T\.copyWeekend\)/);
  assert.match(CLIENT, /\(we \? \['sat', 'sun'\] : \['mon', 'tue', 'wed', 'thu', 'fri'\]\)\.indexOf\(x\) >= 0/);
  // Copies only to the days copyGets allows (a day marked Closed is never filled).
  assert.match(CLIENT, /var gets = DAYS\.filter\(function\(x\)\{ return copyGets\(d, x\); \}\);/);
  for (const L of ['en', 'fr']) assert.ok(TEXT[L].copyWeekend, L);
  assert.match(CLIENT, /d === firstOpenCard && DAYS\.some/);
  assert.match(SERVER, /@media \(max-height: 640px\) \{ body\.owner-setup \.su-head \{ position: static; \} body\.owner-setup \.su-sticky \{ position: static;/);
  assert.match(SERVER, /@media \(max-width: 380px\) \{ body\.owner-setup \.su-hrow \.su-hoffrow \{/);
});

test('8 + 9: wording, the menu "Use <site>" button, and picked photos never silently lost', async () => {
  for (const L of ['en', 'fr']) { assert.doesNotMatch(TEXT[L].spendWhyOff, /once prices|quand les prix/); assert.ok(TEXT[L].rightsAsk && TEXT[L].photosBackAsk, L); }
  assert.equal(TEXT.en.spendWhyOff, 'This helps visitors know what to expect. We’ll show it soon.');
  assert.match(CLIENT, /id="suUseSiteRow"' \+ \(urlNow\.trim\(\) === site \? ' hidden' : ''\)/);
  // The rights box sits right above Send and is asked for gently (no red error).
  assert.match(CLIENT, /if \(!S\.rights\) \{ S\.rightsAsk = true;/);
  assert.doesNotMatch(CLIENT, /S\.nudge = T\.needRights/);
  assert.match(CLIENT, /'<\/span><\/span><\/label>'\s*\+ '<div class="su-stack">' \+ big\('✓', S\.error \? T\.tryAgain : g\.length === 1 \? T\.sendOne/);
  // Back / Exit / the page hidden with photos picked: sent when the box is ticked, otherwise one gentle ask.
  assert.match(CLIENT, /if \(S\.step === 'photos:review' && goodPhotos\(\)\.length\) \{\s*if \(S\.rights\) \{ S\.backAfter = true; return sendPhotos\(\); \}/);
  assert.match(CLIENT, /if \(S\.step === 'photos:review' && goodPhotos\(\)\.length && S\.rights\) \{ e\.preventDefault\(\); S\.exitAfter = true; return sendPhotos\(\); \}/);
  assert.match(CLIENT, /document\.addEventListener\('visibilitychange', function\(\)\{ if \(document\.visibilityState === 'hidden' && S\.step === 'photos:review' && S\.rights/);
});

test('10: a gelato shop that answered every step that applies to it is done (no coffee step), as the setup page shows it', async () => {
  const g = mk('cafe', { name: 'CT5 Gelato' }); const t = tokenFor(g.id);
  ok(await change(t, { place_type: 'Ice cream & gelato', cafe_info: { serves: ['ice_cream', 'sorbet'] } }));
  const cfg = cfgOf(await setupOf(g));
  assert.ok(!cfg.steps.includes('coffee'), JSON.stringify(cfg.steps)); assert.ok(!cfg.part2.includes('coffee'));
  for (const s of cfg.steps) { const r = await post(`/owner/${t}/setup/progress`, { step: s, status: s === 'door' ? 'later' : 'skip' }); assert.equal(r.status, 200, s); }
  assert.equal(app.setupState(g.id), 'done');
  // Ticking espresso brings the coffee step back (the same rule as the page's syncCoffee).
  ok(await change(t, { cafe_info: { serves: ['ice_cream', 'espresso'] } }));
  assert.ok(cfgOf(await setupOf(g)).steps.includes('coffee'));
  assert.equal(app.setupState(g.id), 'essentials');
  // A coffee shop still has it.
  const c = mk('cafe'); ok(await change(tokenFor(c.id), { place_type: 'Coffee shop' }));
  assert.ok(cfgOf(await setupOf(c)).steps.includes('coffee'));
});
