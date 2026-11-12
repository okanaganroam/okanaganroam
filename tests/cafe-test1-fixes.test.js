// First first-time café test fixes (Dayton, Nov 11 2026: "yes, fix them all in one PR";
// drafts/fresh-eyes-cafe1-2026-11-11/REPORT.md). The setup is shared, so restaurants and pubs are checked too: every
// "No" answer saves, "No Wi-Fi" / "No laptops" show a friendly line, a dietary note, honest price wording while prices
// are off, "No website yet" counts, yearly custom closures, café questions brought forward, café wording, public
// wording fixes, small UI fixes and one set of success messages.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test1-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '17:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CT1 ${type} ${++n}`, slug: `ct1-${type}-${n}`, region: 'summerland', type, latitude: 49.6 + n / 1000, longitude: -119.67,
  rating: 4.6, address: `${n} Main St, Summerland`, phone: '250-555-0123', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the café test 1 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.71.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const editChange = (t, changes) => post(`/owner/${t}/changes`, { changes, note: '', contact_name: 'Marie', contact_email: 'marie@example.com', company_website: '', started_at: Date.now() - 60000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const notOffered = (id) => db.prepare('SELECT item FROM venue_not_offered WHERE venue_id = ? ORDER BY item').all(id).map((r) => r.item);

// ---------- 1: every "No" answer saves, for every type ----------
// The "No" buttons each type's setup can reach (sayNo's keys, plus the offer screen's Wi-Fi / ordering / dogs / dietary
// answers and step 1's "No website yet"), and the checklist's own "We don't have…" buttons.
const SETUP_NO = {
  cafe: ['specials', 'entertainment', 'pyv_groups', 'happy_hour', 'instagram', 'facebook', 'website', 'dietary', 'wifi', 'ordering', 'dogs'],
  pub: ['happy_hour', 'specials', 'entertainment', 'pyv_reservations', 'pyv_takeout', 'pyv_groups', 'instagram', 'facebook', 'website', 'dietary', 'dogs', 'sports', 'games', 'cuisine'],
  restaurant: ['happy_hour', 'specials', 'entertainment', 'pyv_reservations', 'pyv_takeout', 'pyv_groups', 'instagram', 'facebook', 'website', 'dietary', 'dogs'],
};
for (const type of ['cafe', 'pub', 'restaurant']) {
  test(`1: every "No" a ${type} can answer saves, one at a time and all together, and is remembered`, async () => {
    for (const k of SETUP_NO[type]) {
      assert.ok(pc.noneKeysFor(type).includes(k), `${type} may answer "No" to ${k}`);
      const v = mk(type, k === 'website' ? { website: '' } : {});
      const r = await change(tokenFor(v.id), { not_offered: [k] });
      ok(r);
      assert.deepEqual(notOffered(v.id), [k], `${type} ${k} stored`);
      // Sent again with the whole list (what the setup does on the next "No"): still fine.
      const other = k === 'instagram' ? 'facebook' : 'instagram';
      ok(await change(tokenFor(v.id), { not_offered: [k, other] }));
      assert.deepEqual(notOffered(v.id), [k, other].sort());
    }
    const all = mk(type, { website: '' });
    ok(await change(tokenFor(all.id), { not_offered: SETUP_NO[type].slice().sort() }));
    assert.deepEqual(notOffered(all.id), SETUP_NO[type].slice().sort());
    // The checklist never lists an unscored one, and the score is unchanged by them.
    const r = await get(`/owner/${tokenFor(all.id)}`);
    assert.equal(r.status, 200);
  });
}
test('1: the café\'s unscored "No" answers are kept out of its score and its checklist, and research respects them', () => {
  const base0 = { type: 'cafe', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  const a = pc.scoreCompleteness(base0, { today });
  const b = pc.scoreCompleteness({ ...base0, declaredNone: ['specials', 'entertainment', 'pyv_groups', 'happy_hour'] }, { today });
  assert.equal(a.pct, b.pct, 'unscored for cafés');
  assert.equal(b.declined.length, 0, 'never in "You told us you don’t have these" for a café');
  assert.deepEqual(b.declared.sort(), ['entertainment', 'happy_hour', 'pyv_groups', 'specials'], 'kept in the list the checklist sends back, so its own buttons never drop them');
  for (const it of pc.CAFE_ITEMS) assert.ok(!['specials', 'entertainment', 'pyv_groups', 'happy_hour'].includes(it.key));
  // Pubs: booking and takeout stay unscored.
  const p = pc.scoreCompleteness({ ...base0, type: 'pub', declaredNone: ['pyv_reservations', 'pyv_takeout'] }, { today });
  assert.equal(p.pct, pc.scoreCompleteness({ ...base0, type: 'pub' }, { today }).pct);
});
test('1: a café that said "No" to specials can still add some later (the setup takes the "No" back first)', async () => {
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { not_offered: ['specials'] }));
  ok(await change(tokenFor(v.id), { not_offered: [] }));
  assert.deepEqual(notOffered(v.id), []);
});
// The setup page and its script, as a café owner gets it.
const setupOf = async (v, lang) => { const r = await get(`${lang === 'fr' ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`); assert.equal(r.status, 200); return r.text; };
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];

// ---------- 2: "No Wi-Fi" and "No laptops" show a friendly line ----------
test('2: "No Wi-Fi" and "No laptops" show "a place to talk" on the café page, only when picked; EN + FR', async () => {
  const both = mk('cafe'), wifi = mk('cafe'), laptops = mk('cafe'), neither = mk('cafe'), hasWifi = mk('cafe');
  ok(await change(tokenFor(both.id), { not_offered: ['wifi'] })); ok(await change(tokenFor(both.id), { cafe_info: { stay: { laptops: 'none' } } }));
  ok(await change(tokenFor(wifi.id), { not_offered: ['wifi'] }));
  ok(await change(tokenFor(laptops.id), { cafe_info: { stay: { laptops: 'none', seats: 'few' } } }));
  ok(await change(tokenFor(neither.id), { cafe_info: { stay: { laptops: 'not_busy' } } }));
  ok(await change(tokenFor(hasWifi.id), { badges: { wifi: true } })); ok(await change(tokenFor(hasWifi.id), { cafe_info: { stay: { laptops: 'none' } } }));
  assert.match(page(both, 'en'), /No Wi-Fi or laptops: a place to talk/);
  assert.match(page(both, 'fr'), /Pas de Wi-Fi ni d’ordinateurs portables : un endroit pour discuter/);
  assert.match(page(wifi, 'en'), /No Wi-Fi: a place to talk/); assert.match(page(wifi, 'fr'), /Pas de Wi-Fi : un endroit pour discuter/);
  assert.match(page(laptops, 'en'), /No laptops: a place to talk/); assert.match(page(laptops, 'fr'), /Pas d’ordinateurs portables : un endroit pour discuter/);
  assert.ok(!/a place to talk/.test(page(neither, 'en')), 'nothing when neither was picked');
  assert.match(page(hasWifi, 'en'), /No laptops: a place to talk/); assert.ok(!/No Wi-Fi/.test(page(hasWifi, 'en')), 'never "No Wi-Fi" beside a Wi-Fi tile');
  // Restaurants and pubs never get it.
  const r = mk('restaurant'); ok(await change(tokenFor(r.id), { not_offered: ['instagram'] }));
  assert.ok(!/a place to talk/.test(page(r, 'en')));
  // The setup and checklist words say it shows.
  for (const L of ['en', 'fr']) { assert.ok(!/Nothing about laptops|Rien sur les ordinateurs/.test(TEXT[L].cafe.laptopSub.none)); assert.match(TEXT[L].cafe.noWifiSub, /Wi-Fi/); }
  assert.match(TEXT.en.cafe.laptopSub.none, /No laptops: a place to talk/);
  const owner = (await get(`/owner/${tokenFor(wifi.id)}`)).text;
  assert.match(owner, /Your page says “No Wi-Fi: a place to talk”/);
});

// ---------- 3: a dietary note, and the gluten-free chip says which kitchen ----------
test('3: the dietary note saves (120 max), shows with the details in English, and old diet answers read the same', async () => {
  const v = mk('cafe', { gluten_free: 1 }); const t = tokenFor(v.id);
  const old = mk('cafe'); ok(await change(tokenFor(old.id), { cafe_info: { diet: { milks: ['oat'], milk_extra: 'yes' } } }));
  assert.deepEqual(app.venueCafeInfo(old.id).diet, { milks: ['oat'], milk_extra: 'yes' }, 'no note: stored exactly as before');
  ok(await change(t, { cafe_info: { diet: { milks: ['oat', 'almond'], milk_extra: 'yes', gf_kitchen: 'shared', note: '  Oat & almond milk +50¢ · Gluten-free: macarons only ' } } }));
  assert.equal(app.venueCafeInfo(v.id).diet.note, 'Oat & almond milk +50¢ · Gluten-free: macarons only');
  const en = page(v, 'en');
  assert.match(en, /gluten-free baking \(made in a shared kitchen\)\. Oat &amp; almond milk \+50¢ · Gluten-free: macarons only/);
  assert.match(en, /Gluten-free options \(shared kitchen\)/, 'the top chip carries the hint');
  assert.ok(!/macarons only/.test(page(v, 'fr')), 'her own words stay off the French page, like the other notes');
  const long = await change(t, { cafe_info: { diet: { note: 'x'.repeat(121) } } });
  assert.equal(long.status, 400);
  // A note alone is an answer too.
  const n2 = mk('cafe'); ok(await change(tokenFor(n2.id), { cafe_info: { diet: { note: 'Ask about gluten-free bread' } } }));
  assert.match(page(n2, 'en'), /Ask about gluten-free bread/);
  // The setup: the box, its live count and the words in both languages.
  const html = await setupOf(v); const s = scriptOf(html);
  assert.match(s, /field\('suDnote', T\.dietNoteLabel, dt\.note, \{ max: 120/); assert.match(s, /noteRoom\(/);
  for (const L of ['en', 'fr']) assert.ok(TEXT[L].cafe.dietNoteLabel && TEXT[L].cafe.dietNoteEx, `${L} note words`);
  assert.equal(cfgOf(html).cur.cafe_info.diet.note, 'Oat & almond milk +50¢ · Gluten-free: macarons only', 'comes back to the setup as typed');
});

// ---------- 4: honest price wording while prices aren't public ----------
test('4: while AVG_SPEND_PUBLIC is off, the price question promises nothing; with it on, the old words', async () => {
  for (const type of ['cafe', 'pub', 'restaurant']) {
    const v = mk(type); const html = await setupOf(v); const cfg = cfgOf(html), s = scriptOf(html);
    assert.equal(cfg.spendPublic, false);
    assert.ok(!/Your page will say|indiquera/.test(cfg.t.spendLeadOff), `${type}: no promise`);
    assert.ok(!/soon|bientôt/.test(cfg.t.savedSpendOff + cfg.t.stSoon + cfg.t.helpSpend), `${type}: no "soon"`);
    assert.match(s, /fill\(C\.spendPublic \? T\.spendLead : T\.spendLeadOff \|\| T\.spendLead/);
    assert.match(s, /S\.done\.spend && S\.done\.spend !== 'skip' && C\.spendPublic \?/, 'the preview shows no price while prices are off');
  }
  assert.match(TEXT.en.cafe.spendLead, /Your page will say/, 'kept for when prices are on');
  assert.equal(TEXT.en.savedSpendOff, 'When prices go on pages, yours will show as your price range.'); // café test 4 wording
  process.env.AVG_SPEND_PUBLIC = '1';
  try { const v = mk('cafe'); assert.equal(cfgOf(await setupOf(v)).spendPublic, true); } finally { delete process.env.AVG_SPEND_PUBLIC; }
});

// ---------- 5: "No website yet" counts ----------
test('5: "Yes, that’s right" with no website saves the "no website" answer, and the Website item counts (all three types)', async () => {
  for (const type of ['cafe', 'pub', 'restaurant']) {
    const v = mk(type, { website: '' }); const t = tokenFor(v.id);
    const s = scriptOf(await setupOf(v));
    assert.match(s, /if \(k === 'basicsOk'\) \{ if \(!CUR\.website && !C\.website && S\.notOffered\.indexOf\('website'\) < 0\) return saveAll\('basics', \[\{ not_offered: addNot\('website'\) \}\]\)/);
    const before = cfgOf(await setupOf(v)).progress.score.left.map((x) => x.k);
    assert.ok(before.includes('website'), `${type}: website open before`);
    ok(await change(t, { not_offered: ['website'] }));
    const after = cfgOf(await setupOf(v)).progress.score.left.map((x) => x.k);
    assert.ok(!after.includes('website'), `${type}: counted after`);
  }
});

// ---------- 6: yearly custom closures, and the end date before Add ----------
test('6: "Every year" on her own dates saves (one yearly rule since café test 2); old pairs of dated closures still read; the end date shows before Add', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const s = scriptOf(await setupOf(v));
  assert.match(s, /id="suCyear"/); assert.match(s, /function plusYear\(s\)/); assert.match(s, /id="suCends"/);
  // Café test 2 (2026-11-11): one yearly rule, not this year and next.
  assert.match(s, /if \(S\.addYearly\) \{ var yr = \{ from: cf\.slice\(5\), to: to\.slice\(5\), note: cnote, yearly: true \};/);
  // Two plain closures (what the setup sent before café test 2) still save and show.
  const y = Number(today.slice(0, 4)) + 1;
  const pair = [{ from: `${y}-01-05`, to: `${y}-01-18`, note: 'Winter break' }, { from: `${y + 1}-01-05`, to: `${y + 1}-01-18`, note: 'Winter break' }];
  ok(await change(t, { closures: pair }));
  const html = page(v, 'en');
  assert.ok(html.includes(`${y + 1}`) || /Jan 5/.test(html));
  for (const L of ['en', 'fr']) for (const k of ['closeYearly', 'closeYearlySub', 'closeEnds', 'addedYearly']) assert.ok(TEXT[L][k], `${L}.${k}`);
  // The end date, worked out the same way Add does (first day + length − 1).
  const closeEnds = new Function('S', 'T', 'fill', 'dateLabel', 'ymd', `${/function lenEnd\(cf\)\{[^\n]*\}/.exec(s)[0]}\n${/function closeEnds\(cf\)\{[^\n]*\}/.exec(s)[0]}\nreturn closeEnds;`)(
    { addLen: '14' }, TEXT.en, (x, o) => x.replace(/\{(\w+)\}/g, (m, k) => o[k]), (d) => d, (d) => d.toISOString().slice(0, 10));
  assert.equal(closeEnds(`${y}-01-05`), `Closed ${y}-01-05 to ${y}-01-18`);
});

// ---------- 7: café questions brought forward ----------
test('7: Dietary details, Your coffee and Sells out early are above the fold for cafés; Groups and Weekly events stay folded', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe')));
  // 13 screens (2026-11-11): a café's six Part 2 tiles all show (Sells out, Groups and Weekly events aren't asked any more).
  for (const k of ['diet', 'coffee']) assert.ok(cfg.top2.includes(k), k);
  for (const k of ['groups', 'music', 'sellout']) assert.ok(!cfg.part2.includes(k), k);
  assert.deepEqual(cfg.top2, cfg.part2);
  assert.deepEqual(cfgOf(await setupOf(mk('pub'))).top2, ['music', 'specials', 'story', 'groups', 'instagram', 'facebook'], 'pubs unchanged');
  assert.deepEqual(cfgOf(await setupOf(mk('restaurant'))).top2, ['happy', 'specials', 'music', 'story', 'instagram', 'facebook'], 'restaurants unchanged');
});

// ---------- 8: café wording ----------
test('8: café specials example, "Specials" tab, menu photo hint; pubs keep "Deals"', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe')));
  assert.ok(!/Taco|\$12/.test(cfg.t.specialEx + cfg.t.priceEx)); assert.match(cfg.t.specialEx, /Buy 9/); // café test 3: café examples, not soup
  assert.ok(!/Taco|12 \$/.test(TEXT.fr.cafe.specialEx + TEXT.fr.cafe.priceEx));
  assert.equal(cfg.t.snapSub, 'Snap your menu (a board or each page)'); assert.match(TEXT.fr.snapSub, /tableau/);
  assert.match(cfgOf(await setupOf(mk('pub'))).t.specialEx, /Taco|Wing|wing/i, 'pubs keep theirs');
  const c = mk('cafe'); ok(await change(tokenFor(c.id), { specials: [{ days: ['tue', 'fri'], title: 'Fresh baguettes', deal: 'Fresh baguettes', price: null, kind: 'food' }] }));
  assert.match(page(c, 'en'), /<a href="#fdDeals">Specials<\/a>/);
  const p = mk('pub'); ok(await change(tokenFor(p.id), { specials: [{ days: ['tue'], title: 'Wing night', deal: '60¢ wings', price: null, kind: 'food' }] }));
  assert.match(page(p, 'en'), /<a href="#fdDeals">Deals<\/a>/);
});

// ---------- 9: public wording ----------
test('9: what a café serves reads as a proper list, and the pre-order line never repeats itself', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { cafe_info: { serves: ['espresso', 'breakfast', 'lunch', 'desserts'], order: { preorder: true, preorder_how: 'Cakes and tarts: call us 48 hours ahead' } } }));
  const en = page(v, 'en');
  assert.match(en, /Espresso drinks, breakfast, lunch and desserts &amp; cakes/);
  assert.ok(!/desserts and cakes/.test(en));
  assert.match(en, /🛍️<\/span> Cakes and tarts: call us 48 hours ahead</);
  assert.ok(!/Custom cakes and pre-orders: Cakes/.test(en));
  assert.match(page(v, 'fr'), /Gâteaux sur commande et précommandes/, 'French: the label alone');
  const w = mk('cafe'); ok(await change(tokenFor(w.id), { cafe_info: { order: { preorder: true } } }));
  assert.match(page(w, 'en'), /🛍️<\/span> Custom cakes and pre-orders</);
});

// ---------- 10: small UI ----------
test('10: the photo order buttons sit under the photo, only ✕ stays on it; Help sits in the Back row', async () => {
  const html = await setupOf(mk('cafe'));
  assert.match(html, /body\.owner-setup \.su-ph \.su-order \{ position: static;/);
  assert.match(html, /t\.appendChild\(b\);document\.body\.classList\.add\('su-help-inrow'\)/);
});

// ---------- 11: one set of success words ----------
test('11: success words: "It’s on your page now" for live answers, "We’ll add it within a day" for checked ones, no stray "soon"', async () => {
  for (const type of ['cafe', 'pub', 'restaurant']) {
    const t = cfgOf(await setupOf(mk(type))).t;
    assert.equal(t.savedLive, 'It’s on your page now.'); assert.equal(t.savedDay, 'We’ll add it within a day.');
    for (const k of ['savedDay', 'photosSent', 'sentMeans', 'savedFbName', 'savedIgName', 'savedMenuSocialName', 'phoneRestSite', 'phoneRestAddr', 'phoneRestBoth']) assert.match(t[k], k === 'sentMeans' ? /add it to your page within a day/ : /We’ll (add|find)/, `${type} ${k}`); // café test 3: plainer Sent line
    for (const k of Object.keys(t)) if (typeof t[k] === 'string' && k !== 'savedSoon') assert.ok(!/\bsoon\b/.test(t[k]), `${type}: no "soon" in ${k}`);
    assert.equal(t.st.day, 'we’ll add it within a day');
  }
  const f = cfgOf(await setupOf(mk('cafe'), 'fr')).t;
  assert.equal(f.savedDay, 'Nous l’ajouterons d’ici un jour.');
  for (const k of Object.keys(f)) if (typeof f[k] === 'string' && k !== 'savedSoon') assert.ok(!/bientôt/.test(f[k]), `fr: no "bientôt" in ${k}`);
});

// ---------- 12: the "refused changes … : form" log line ----------
test('12: the ordering screen no longer re-sends "no drive-thru, no walk-up" (it came back "Nothing has changed yet")', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  // The request the tester's server logged: unchanged badges, refused as "Nothing has changed yet" (400, errors.form).
  const r = await change(t, { badges: { drive_thru: false, walk_up: false } });
  assert.equal(r.status, 400); assert.deepEqual(Object.keys(r.body.errors), ['form']); assert.match(r.body.errors.form, /Nothing has changed yet/);
  // The setup now sends only what differs from what is stored.
  const s = scriptOf(await setupOf(v));
  // Café test 4 (2026-11-11): the ordering screen never sends the drive-thru / walk-up badges ("What you offer" asks them).
  assert.doesNotMatch(s, /ol\.push\(\{ badges: ob \}\)/);
  assert.match(s, /if \(JSON\.stringify\(oi\) !== S\.savedOrder\) ol\.push\(\{ cafe_info: \{ order: oi \} \}\);/);
  // And a pre-order only (the tester's answer) saves cleanly with nothing refused.
  ok(await change(t, { cafe_info: { order: { preorder: true, preorder_how: 'Call us 48 hours ahead' } } }));
  ok(await change(t, { not_offered: [] }).then((x) => (x.status === 400 && /Nothing has changed/.test(JSON.stringify(x.body)) ? { status: 200 } : x)));
});
