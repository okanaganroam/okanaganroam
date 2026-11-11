// Third first-time café test fixes (Dayton, Nov 11 2026; drafts/fresh-eyes-cafe3-2026-11-11/REPORT.md). The tester played
// Minnie, a bubble tea and study café in Kelowna. "We don't need TikTok on there ... We need to keep it easy": bugs and
// confusing words fixed, clutter removed, nothing new added.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test3-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (a, b) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[a, b]]])));
const weekObj = (a, b) => Object.fromEntries(DAYS.map((d) => [d, [[a, b]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CT3 ${type} ${++n}`, slug: `ct3-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.6, address: `${n} Ellis St, Kelowna`, phone: '250-555-0188', website: 'https://example.com', hours: week('10:00', '22:00'),
  description: 'A fixture used only by the café test 3 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.73.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const setupOf = async (v, lang) => { const r = await get(`${lang === 'fr' ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`); assert.equal(r.status, 200); return r.text; };
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');

test('1: one money() only, so the price screen shows "$9", never "$$9"', () => {
  assert.equal((CLIENT.match(/function money\(/g) || []).length, 1);
  // No other function is declared twice in the page script either (a second one silently replaces the first).
  const names = (CLIENT.match(/^ {2}function (\w+)/gm) || []).map((x) => x.trim());
  assert.deepEqual(names.filter((x, i) => names.indexOf(x) !== i), []);
  // Run the price helper: whole dollars, cents, French comma; the "$" comes from the words around it.
  const src = /function money\(n\)\{.*?\n/.exec(CLIENT)[0];
  for (const [lang, v, out] of [['en', 9, '9'], ['en', 7.25, '7.25'], ['fr', 7.25, '7,25']]) assert.equal(new Function('C', `${src}; return money(${v});`)({ lang }), out);
  assert.match(CLIENT, /price: moneyStr\(e\.price\)/);
  assert.equal(new Function(`${/function moneyStr\(v\)\{.*?\n/.exec(CLIENT)[0]}; return [moneyStr('18'), moneyStr('$1 off')];`)().join('|'), '$18|$1 off');
  assert.ok(TEXT.en.spendYes.includes('${n}') && !TEXT.en.spendYes.includes('$${n}'));
});

test('2: a café\'s weekly-event buttons all have labels (EN + FR); the café-kind words have their own name', async () => {
  const v = mk('cafe');
  for (const lang of ['en', 'fr']) {
    const cfg = cfgOf(await setupOf(v, lang));
    for (const k of cfg.nightKinds) assert.ok(typeof cfg.t.kinds[k] === 'string' && cfg.t.kinds[k], `${lang} ${k}`);
    assert.ok(cfg.t.cafeKinds['Bubble tea'].story);
  }
  assert.match(CLIENT, /\(T\.cafeKinds \|\| \{\}\)\[S\.place\]/);
});

test('3: a comma no longer splits a special; a long line is cut between words and reads back as typed', () => {
  const line = /( {6}var t1 = text, rest = '';\n {6}if \(text\.length > 40\).*\n)/.exec(CLIENT)[1];
  const split = new Function('text', `${line}; return [t1, rest || text];`);
  assert.deepEqual(split('Buy 9, get the 10th free (loyalty card)'), ['Buy 9, get the 10th free (loyalty card)', 'Buy 9, get the 10th free (loyalty card)']);
  assert.deepEqual(split('Wing night, 60¢ a wing'), ['Wing night, 60¢ a wing', 'Wing night, 60¢ a wing']);
  const long = 'Buy 9, get the 10th free when you show your loyalty card';
  const [t, d] = split(long);
  assert.ok(t.length <= 40 && !/\s$/.test(t)); assert.equal(`${t} ${d}`, long);
  const lc = new Function(`${/function longCut\(t, d\)\{.*?\n/.exec(CLIENT)[0]}; return longCut;`)();
  assert.equal(lc(t, d), true); assert.equal(lc('Wing night', '60¢ a wing'), false);
  // The page shows a one-line special once (the deal repeats the title, so it's hidden).
  const s = { title: 'Buy 9, get the 10th free', deal: 'Buy 9, get the 10th free', price: null };
  assert.equal(app.specialLine(s, false).text, 'Buy 9, get the 10th free');
});

test('3b: a one-line special saved through the setup path stays one line on the page', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { specials: [{ days: DAYS, title: 'Buy 9, get the 10th free', deal: 'Buy 9, get the 10th free', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null }] }));
  const html = app.renderVenuePage(app.getVenue(v.id), [], [], []);
  assert.match(html, /class="venue-sp-title">Buy 9, get the 10th free</);
  assert.doesNotMatch(html, /class="venue-sp-deal">Buy 9/);
});

test('4: unsaved answers on a step are kept in sessionStorage by link and step, restored, and cleared on save', () => {
  assert.match(CLIENT, /'suDraft:' \+ C\.base \+ ':' \+ b/);
  for (const k of ['getItem', 'setItem', 'removeItem']) assert.match(CLIENT, new RegExp(`try \\{[^}]*sessionStorage\\.${k}`));
  assert.match(CLIENT, /S\.dirty = ''; drSaved\(step\); return true;/);
  assert.match(CLIENT, /if \(drAfter\(\)\) return;/);
  assert.match(CLIENT, /window\.addEventListener\('pagehide', drSave\)/);
  // A kept answer only comes back while the page still has what it replaced.
  assert.match(CLIENT, /if \(cur !== w\.was \|\| cur === w\.now\) return;/);
});

test('5: no doubled "For example: Like …" (EN + FR)', () => {
  // Every line the page shows after "For example:" (ex(T.…)).
  const keys = [...new Set((CLIENT.match(/\bex\(T\.(\w+)/g) || []).map((x) => x.slice(5)))];
  assert.ok(keys.includes('orderUrlEx') && keys.includes('specialTimeEx') && keys.includes('bookLinkEx'));
  for (const L of ['en', 'fr']) for (const o of [TEXT[L], TEXT[L].cafe, TEXT[L].pub].filter(Boolean)) for (const k of keys) {
    if (typeof o[k] === 'string') assert.doesNotMatch(o[k], /^(Like|For example|Par exemple|Comme)\b/i, `${L} ${k}`);
  }
});

test('6: no TikTok box in the setup or on the edit page, no TikTok help topic; a saved TikTok stays stored and on the page', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { tiktok_url: '@bobaandbrew' }));
  for (const lang of ['en', 'fr']) {
    const setup = await setupOf(v, lang);
    assert.doesNotMatch(scriptOf(setup), /suTt|ttLabel|tiktok_url/);
    assert.doesNotMatch(cfgOf(setup).t.ttLabel || '', /./);
    const edit = (await get(`${lang === 'fr' ? '/fr' : ''}/owner/${t}`)).text;
    assert.doesNotMatch(edit, /id="opTiktok"|TikTok \((optional|facultatif)\)/);
  }
  const help = app.ownerHelpWidgetHtml('setup', { avgSpend: true, completeness: true });
  assert.doesNotMatch(help, /"id":"tiktok"/);
  assert.doesNotMatch(help, /<strong>TikTok<\/strong>/);
  assert.match(app.renderVenuePage(app.getVenue(v.id), [], [], []), /href="https:\/\/www\.tiktok\.com\/@bobaandbrew"/);
});

test('7: café leftovers: gelato chips only for gelato, Weekly events (no guitar), cakes for bakeries, no patio when there is none', async () => {
  assert.match(CLIENT, /if \(ICE_ONLY\.indexOf\(o\.k\) >= 0\) return iceKind\(\);/);
  assert.match(CLIENT, /if \(C\.cafe\) P2_ICONS\.music = '🗓️';/);
  assert.match(CLIENT, /cakesShown\(\) \? ctile\('order\.preorder'/);
  assert.match(CLIENT, /S\.badges\.patio \? T\.noDogsSub : T\.noDogsSubInside/);
  for (const L of ['en', 'fr']) assert.ok(TEXT[L].noDogsSubInside && !/patio|terrasse/i.test(TEXT[L].noDogsSubInside) && TEXT[L].cafe.counterOnlySubNoCakes);
  const c = mk('cafe'); const t = tokenFor(c.id);
  ok(await change(t, { weekly_nights: [{ days: ['thu'], kind: 'games', title: 'Board game night', start: '19:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null, season_from: null, season_to: null }] }));
  const html = app.renderVenuePage(app.getVenue(c.id), [], [], []);
  assert.match(html, /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(app.renderVenuePage(app.getVenue(c.id), [], [], [], { lang: 'fr' }), /Événements de la semaine/);
  assert.match((await get(`/owner/${t}`)).text, /id="opNightsLabel">Weekly events/);
  const p = mk('pub'); ok(await change(tokenFor(p.id), { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null, season_from: null, season_to: null }] }));
  assert.match(app.renderVenuePage(app.getVenue(p.id), [], [], []), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
});

test('8 + 9: café specials examples are café ones; "Every day" on the specials day picker', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe'), 'en'));
  assert.equal(cfg.t.specialEx, 'Buy 9, get the 10th free');
  assert.doesNotMatch([cfg.t.specialEx, cfg.t.specialTimeEx, cfg.t.specialsLead].join(' '), /soup|brunch/i);
  const fr = cfgOf(await setupOf(mk('cafe'), 'fr'));
  assert.doesNotMatch([fr.t.specialEx, fr.t.specialTimeEx, fr.t.specialsLead].join(' '), /soupe|brunch/i);
  assert.match(CLIENT, /data-act="spDays:' \+ i \+ '">' \+ h\(T\.everyDay\)/);
  assert.match(CLIENT, /if \(k === 'spDays'\) \{ readEntries\(\); var es = S\.specials\[\+v\]; if \(!es\) return; var on7 = !allDays\(es\.days\);/);
});

test('10 + 11: café kind first in the preview; plainer words; price step named in café words', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe'), 'en'));
  assert.equal(cfg.placeShow['Bubble tea'], 'Bubble tea shop');
  assert.match(CLIENT, /h\(\[C\.cafe && S\.place \? \(C\.placeShow \|\| \{\}\)\[S\.place\]/);
  assert.equal(cfg.t.spendLabel, 'Price of {words}');
  assert.doesNotMatch(cfg.t.spendLeadOff, /one person/);
  assert.equal(TEXT.en.sentMeans, 'We check it first, then add it to your page within a day.');
  assert.doesNotMatch(TEXT.en.savedSpendOff, /go live/);
  const c = mk('cafe'); ok(await change(tokenFor(c.id), { cafe_info: { coffee: { source: 'Rotating roasters' } } }));
  const html = app.renderVenuePage(app.getVenue(c.id), [], [], []);
  assert.match(html, /Beans: Rotating roasters/); assert.doesNotMatch(html, /Beans from/);
});

test('12: "Yes, all year" clears a saved open season', async () => {
  assert.match(CLIENT, /if \(k === 'yearAll'\) \{ S\.sea\.on = false; S\.seaTouched = true; if \(S\.openSea \|\| CUR\.open_months\) \{ S\.openSea = null; S\.openTouched = true; \} return hoursSave\(\); \}/);
  // What it sends (hoursSave: open_months '' and the café's year answer) clears the season on the page.
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { open_months: '04-25:10-12' }));
  assert.equal(cfgOf(await setupOf(v, 'en')).cur.open_months, '04-25:10-12');
  ok(await change(t, { hours: weekObj('10:00', '22:00'), hours_checked: true, open_months: '' }));
  ok(await change(t, { cafe_info: { year: 'all' } }));
  assert.equal(cfgOf(await setupOf(v, 'en')).cur.open_months, '');
});
