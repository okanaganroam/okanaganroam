// Badge guide intros (2026-10-27): the intro and meta description of each town + badge guide (/guide/<town>/<badge>)
// come from that page's own places (guide-intros.js computeGuideFacts + renderGuideIntro, data from server.js
// guideIntroContext): the mix of places, a fact recipe per badge (happy hour windows and deal prices, dog rules,
// earliest / latest hours, fully vegan kitchens, weekly nights...), what the cards add and the town's Local Favourites
// and Hidden Gems (top rated only when the slice has none). Only notable facts become sentences; no live counts. The
// noindex threshold and the sitemap are unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r28-intros-admin-token';
const app = require('../server.js');
const db = require('../db.js');
const gi = require('../guide-intros.js');
const hours = require('../hours.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (from, to, days = WEEK) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, days.includes(d) ? [[from, to]] : null])));
const today = app.todayLocal();
let n = 0;
const mk = (o) => app.createVenue({ slug: `intro-fixture-${++n}`, region: 'naramata', type: 'pub', latitude: 49.59 + n / 1000, longitude: -119.59, rating: 4.0, reviews: 30,
  description: 'A fixture place used only by the badge guide intro tests.', hours: week('11:00', '22:00'), ...o });
const setHH = (id, times, deals) => db.prepare('UPDATE venues SET happy_hour_times = ?, happy_hour_source = ?, happy_hour_checked_at = ?, happy_hour_deals = ?, happy_hour_deals_source = ?, happy_hour_deals_checked_at = ? WHERE id = ?')
  .run(times, 'https://example.com/hh', today, deals ? JSON.stringify(deals) : null, deals ? 'https://example.com/hh' : null, deals ? today : null, id);
const collection = (kind) => {
  const row = db.prepare('SELECT id FROM collections WHERE kind = ?').get(kind);
  return row ? row.id : Number(db.prepare('INSERT INTO collections (slug, kind, title) VALUES (?, ?, ?)').run(`${kind}-r28`, kind, kind).lastInsertRowid);
};
const addTo = (kind, venueId, note = null, batch = 'public-notes-2026-10') => {
  db.prepare('INSERT INTO collection_items (collection_id, content_type, content_id, note) VALUES (?, ?, ?, ?)').run(collection(kind), 'venue', venueId, note);
  if (note) db.prepare("INSERT INTO venue_enrichment_log (venue_id, field_name, old_value, new_value, source, confidence, batch_id) VALUES (?, ?, NULL, 'member', 'test', 'high', ?)").run(venueId, `collection:${kind}`, batch);
};
const BANNED = /\b(?:right now|open now|on now|today|tonight|highly recommended|looking for the best|week-end)\b/i;

// Naramata happy hour: 12 places (indexable), 9 with times on file, 5 with deals; 3 also have a patio, all are pubs or
// restaurants. One Local Favourite with a note, one Hidden Gem with none.
const hhVenues = [];
for (let i = 0; i < 12; i++) {
  const v = mk({ name: `Intro HH ${String.fromCharCode(65 + i)}`, type: i < 8 ? 'pub' : 'restaurant', happy_hour: 1, patio: i < 3 ? 1 : 0, rating: 4 + i / 20, reviews: 40 + i * 10 });
  hhVenues.push(v);
}
// Times: 6 at 3-6 PM (the common window), 2 at 2-5 PM (the earliest start is Intro HH G's 2 PM), 1 at 9-11 PM (late).
for (let i = 0; i < 6; i++) setHH(hhVenues[i].id, week('15:00', '18:00'));
setHH(hhVenues[6].id, week('14:00', '17:00', ['mon', 'tue', 'wed']), [{ text: 'House pints', price: '$5' }, { text: 'Wings', price: '$8' }]);
setHH(hhVenues[7].id, week('14:30', '17:00'), [{ text: 'Draft beer sleeves', price: '$6' }, { text: 'House wine', price: '$7' }]);
setHH(hhVenues[8].id, week('21:00', '23:00'), [{ text: 'Glass of wine', price: '$6.50' }, { text: 'Half price appies' }]);
setHH(hhVenues[9].id, null, [{ text: 'Nachos', price: '$10' }]);
setHH(hhVenues[10].id, null, [{ text: 'Oysters', price: '$2 off' }]);
addTo('local_favorite', hhVenues[2].id, 'Voted the best patio pint in Naramata (2026).');
addTo('hidden_gem', hhVenues[9].id, null);

// Oliver dog-friendly: 9 places (below the index threshold).
for (let i = 0; i < 9; i++) mk({ name: `Intro Dog ${i}`, region: 'oliver', dog_friendly: 1 });

test('computeGuideFacts: happy hour facts (times, common window, earliest / latest, late, deal prices) from stored data', () => {
  const venues = app.guideIntroContext ? db.prepare("SELECT * FROM venues WHERE region = 'naramata' AND happy_hour = 1 AND redirect_to IS NULL").all().map(app.rowToVenue) : [];
  assert.equal(venues.length, 12);
  const f = app.guideIntroFacts('happy_hour', venues);
  assert.equal(f.n, 12);
  assert.deepEqual(f.mix, [{ type: 'pub', count: 8 }, { type: 'restaurant', count: 4 }]);
  assert.equal(f.special.withTimes, 9);
  assert.deepEqual(f.special.commonWindow, { from: 15 * 60, to: 18 * 60, count: 6 });
  assert.equal(f.special.earliest, 14 * 60);
  assert.deepEqual(f.special.earliestBy, ['Intro HH G']);
  assert.equal(f.special.latest, 23 * 60);
  assert.equal(f.special.late, 1, 'one happy hour from 8 PM on (not enough for a sentence)');
  assert.equal(f.special.everyDay, 8, 'Intro HH G runs three days');
  assert.equal(f.special.withDeals, 5);
  assert.equal(f.special.pintFrom, 5);
  assert.equal(f.special.wineFrom, 6.5);
  assert.equal(f.special.foodFrom, 8, '"$2 off" is not a price; "Half price" has none');
  assert.deepEqual(f.overlaps, [{ badge: 'patio', count: 3 }]);
  assert.equal(f.standoutKind, 'collection');
  assert.deepEqual(f.standouts.map((s) => [s.name, s.kind]), [['Intro HH C', 'local_favourite'], ['Intro HH J', 'hidden_gem']]);
  assert.equal(f.standouts[0].note.en, 'voted the best patio pint in Naramata (2026)');
  assert.equal(f.standouts[1].note.en, 'a fixture place used only by the badge guide intro tests', 'no note: the first sentence of its own description');
  assert.equal(f.standouts[1].note.fr, '', 'no French description: no French clause');
});

test('the intro: only notable facts, EN and Canadian French, every number from the facts, no live or salesy wording', () => {
  const venues = db.prepare("SELECT * FROM venues WHERE region = 'naramata' AND happy_hour = 1").all().map(app.rowToVenue);
  const facts = app.guideIntroFacts('happy_hour', venues);
  const en = app.guideIntroFor('naramata', 'happy_hour', venues, 'en', new Date(), facts);
  const fr = app.guideIntroFor('naramata', 'happy_hour', venues, 'fr', new Date(), facts);
  assert.ok(en && fr);
  const count = (t) => t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/).length;
  assert.ok(count(en.text) >= 2 && count(en.text) <= 4, en.text);
  assert.deepEqual(en.keys, fr.keys, 'the same facts in both languages');
  assert.ok(en.keys.includes('hh-times') && en.keys.includes('hh-deals'), en.keys.join());
  assert.ok(!en.keys.includes('hh-late'), 'a single late happy hour is skipped');
  assert.ok(!en.keys.includes('extras') && !en.keys.includes('seasonal'), 'no specials, nights, menus or seasons: nothing said');
  assert.match(en.text, /3–6 PM/);
  assert.match(en.text, /pints from \$5/);
  assert.match(fr.text, /15 h–18 h/);
  assert.match(fr.text, /5 \$/);
  assert.match(en.text, /Intro HH C, one of our Local Favourites: voted the best patio pint in Naramata \(2026\)/);
  assert.match(fr.text, /coups de cœur locaux/);
  // Every number in the English intro is one of the computed facts (counts, times, prices, the note's year).
  const sp = facts.special;
  const known = new Set([facts.n, ...facts.mix.map((m) => m.count), ...facts.overlaps.map((o) => o.count), sp.withTimes, sp.commonWindow.count, sp.withDeals, sp.everyDay,
    5, '6.50', 8, 2, 3, 6, 2026, 11].map(String));
  for (const x of en.text.match(/\d+(?:\.\d+)?/g)) assert.ok(known.has(x), `number ${x} not from the facts: ${en.text}`);
  for (const t of [en.text, fr.text, en.meta, fr.meta]) assert.doesNotMatch(t, BANNED, t);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'guide-intros.js'), 'utf8'), /week-end/i, 'never "week-end"');
  // French sentences are French: no English connectives.
  assert.doesNotMatch(fr.text, /\b(?:the|and|of|with|from|places)\b/, fr.text);
  // The standouts link to their pages in the HTML; the plain text matches what the page script compares.
  assert.match(en.html, /<a href="\/naramata\/pubs\/intro-fixture-3">Intro HH C<\/a>/);
  assert.equal(en.html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'), en.text);
});

test('meta description: at most 155 characters, whole sentences (or a word), from the same facts', () => {
  const venues = db.prepare("SELECT * FROM venues WHERE region = 'naramata' AND happy_hour = 1").all().map(app.rowToVenue);
  for (const lang of ['en', 'fr']) {
    const out = app.guideIntroFor('naramata', 'happy_hour', venues, lang);
    assert.ok(out.meta.length <= 155, out.meta);
    assert.ok(out.meta.startsWith(lang === 'fr' ? '12 adresses à Naramata, en C.-B.' : '12 venues with happy hour in Naramata, BC.'), out.meta);
    assert.match(out.meta, /[.)]$/);
  }
  // A fact that doesn't fit is left out whole (never cut mid-sentence); one that fits is added.
  const meta = (s) => gi.guideMeta({ n: 3 }, [{ key: 'x', en: s, fr: '' }], { town: 'Kelowna', noun: 'places' }, 'en');
  assert.equal(meta(`${'word '.repeat(60)}end.`), '3 places in Kelowna, BC.');
  assert.equal(meta('Short fact.'), '3 places in Kelowna, BC. Short fact.');
  // A head that is itself too long (a very long town name) ends at a word.
  const head = gi.guideMeta({ n: 3 }, [], { town: 'X'.repeat(10) + ' town'.repeat(40), noun: 'places' }, 'en');
  assert.ok(head.length <= 155 && /town$/.test(head), head);
});

test('facts recipes: zero, all-of-them and tiny shares are skipped; dogs, early/late, diets, nights', () => {
  const v = (id, o) => ({ id, name: `P${id}`, type: 'restaurant', region: 'kelowna', rating: 4, reviews: 10, ...o });
  // Every place has a patio: an "all of them" overlap is not a fact.
  const all = Array.from({ length: 10 }, (_, i) => v(i + 1, { patio: true, dog_friendly: true, lake_view: i < 1 }));
  const f = gi.computeGuideFacts('dog_friendly', all, { hoursModule: hours });
  assert.deepEqual(f.overlaps, [], 'patio on all 10 and kid_friendly on none');
  const intro = gi.renderGuideIntro(f, { town: 'Kelowna', region: 'kelowna' });
  assert.ok(!intro.keys.includes('overlap') && !intro.keys.includes('dog-rule') && !intro.keys.includes('dog-split'), intro.keys.join());
  // Dogs: rules and the outdoor / food split.
  const dogs = [...Array.from({ length: 4 }, (_, i) => v(20 + i, { type: i ? 'outdoor' : 'beach' })), ...Array.from({ length: 6 }, (_, i) => v(30 + i, { type: 'brewery' }))];
  const df = gi.computeGuideFacts('dog_friendly', dogs, { dogPolicy: new Map([[20, 'On leash'], [30, 'Patio only'], [31, 'Patio only']]) });
  assert.deepEqual([df.special.withRule, df.special.outdoor, df.special.beaches, df.special.food], [3, 4, 1, 6]);
  const dt = gi.renderGuideIntro(df, { town: 'Penticton', region: 'penticton' });
  assert.ok(dt.keys.includes('dog-rule') && dt.keys.includes('mix') && !dt.keys.includes('dog-split'), `one sentence on the kinds of places: ${dt.keys}`);
  // Without a readable mix (a single kind of place), the outdoor / food split says it instead.
  const split = gi.renderGuideIntro({ ...df, mix: [{ type: 'unknown', count: 10 }] }, { town: 'Penticton', region: 'penticton' });
  assert.match(split.text, /4 (?:are )?outdoor spots(?: on this list)?, including a beach, and 6/, split.text);
  // Early / late: from stored hours; a 24-hour day is left out.
  const hrs = (from, to) => ({ hours: week(from, to) });
  const late = [v(40, { name: 'Night Owl', ...hrs('16:00', '02:00') }), v(41, hrs('11:00', '00:30')), v(42, hrs('00:00', '24:00')), v(43, hrs('11:00', '23:00'))];
  const rows = new Map(late.map((x) => [x.id, x]));
  const lf = gi.computeGuideFacts('open_late', late, { hoursModule: hours, rows });
  assert.deepEqual([lf.special.extreme.at, lf.special.extreme.names, lf.special.flagged, lf.special.everyDay], [26 * 60, ['Night Owl'], 2, 3]);
  const early = [v(50, { name: 'Dawn Cafe', ...hrs('05:30', '14:00') }), v(51, hrs('07:00', '15:00')), v(52, hrs('00:00', '24:00'))];
  const ef = gi.computeGuideFacts('open_early', early, { hoursModule: hours, rows: new Map(early.map((x) => [x.id, x])) });
  assert.deepEqual([ef.special.extreme.at, ef.special.extreme.names], [5 * 60 + 30, ['Dawn Cafe']], 'the 24-hour place is not "first to open at midnight"');
  // Diets: fully vegan kitchens and mentions, from the server's ranking.
  const veg = Array.from({ length: 10 }, (_, i) => v(60 + i, { name: `Veg ${i}` }));
  const vf = gi.computeGuideFacts('vegan', veg, { dietTier: (x) => (x.id === 60 ? 0 : x.id < 64 ? 1 : 2) });
  assert.deepEqual([vf.special.dedicated.map((d) => d.name), vf.special.mentions], [['Veg 0'], 3]);
  assert.match(gi.renderGuideIntro(vf, { town: 'Vernon', region: 'vernon' }).text, /only (?:fully vegan kitchen|Veg 0 is fully vegan)|Veg 0 is the only fully vegan kitchen/);
  // Live music: weekly nights by kind.
  const mus = Array.from({ length: 10 }, (_, i) => v(80 + i, { type: 'pub' }));
  const mf = gi.computeGuideFacts('live_music', mus, { nights: new Map([[80, ['trivia', 'live_music']], [81, ['live_music']], [82, ['trivia']]]) });
  assert.deepEqual([mf.special.nightHosts, mf.special.nightKinds], [3, [['live_music', 2], ['trivia', 2]]]);
  // Extras: 1 or 2 of something is not worth a sentence; seasons count only when some (not all) are seasonal.
  const ex = gi.computeGuideFacts('patio', mus, { specials: new Map([[80, 2], [81, 1]]), seasonal: new Set(mus.map((x) => x.id)) });
  assert.equal(ex.extras.specials, 2);
  assert.ok(!gi.renderGuideIntro(ex, { town: 'Oliver', region: 'oliver' }).keys.includes('extras'));
  assert.ok(!gi.renderGuideIntro(ex, { town: 'Oliver', region: 'oliver' }).keys.includes('seasonal'), 'all 10 seasonal: not a distinguishing fact');
});

test('standouts: favourites first (with their note), spread over a town\'s pages; top rated only when the slice has none', () => {
  const v = (id, o) => ({ id, name: `S${id}`, type: 'restaurant', rating: 4, reviews: 50, description: '', ...o });
  const list = [v(1, { rating: 4.9, reviews: 900 }), v(2, { rating: 4.8, reviews: 400 }), v(3), v(4)];
  const none = gi.computeGuideFacts('patio', list, {});
  assert.equal(none.standoutKind, 'rated');
  assert.deepEqual(none.standouts.map((s) => s.name), ['S1', 'S2']);
  assert.match(gi.renderGuideIntro(none, { town: 'Kelowna', region: 'kelowna' }).text, /S1 \(4\.9 from 900 reviews\) and S2 \(4\.8 from 400 reviews\)/);
  const ctx = { localFavourites: new Set([3]), notes: new Map([[3, 'Our favourite patio on the lake.']]) };
  const fav = gi.computeGuideFacts('patio', list, ctx);
  assert.equal(fav.standoutKind, 'collection');
  assert.deepEqual(fav.standouts.map((s) => s.name), ['S3'], 'a favourite beats a higher rating');
  // One favourite in two of the town's slices: the first page gets it with its note, the other a short mention.
  const plan = gi.allocateStandouts([{ badge: 'patio', cand: gi.standoutCandidates('patio', list, ctx) }, { badge: 'kid_friendly', cand: gi.standoutCandidates('kid_friendly', list, ctx) }]);
  const a = plan.get('kid_friendly'), b = plan.get('patio');
  assert.deepEqual([a.ids, a.reused, b.ids, b.reused], [[3], false, [3], true]);
  const reused = gi.computeGuideFacts('patio', list, { ...ctx, standoutPlan: b });
  const t = gi.renderGuideIntro(reused, { town: 'Kelowna', region: 'kelowna' });
  assert.match(t.text, /S3, one of our Local Favourites, has a patio too\./);
  // Rated standouts are never repeated; a page that only gets the next ones doesn't call them the best.
  const p2 = gi.allocateStandouts([{ badge: 'vegan', cand: gi.standoutCandidates('vegan', list, {}) }, { badge: 'vegetarian', cand: gi.standoutCandidates('vegetarian', list, {}) }]);
  assert.deepEqual([p2.get('vegan').ids, p2.get('vegetarian').ids], [[1, 2], [3, 4]]);
  const next = gi.renderGuideIntro(gi.computeGuideFacts('vegetarian', list, { standoutPlan: p2.get('vegetarian') }), { town: 'Kelowna', region: 'kelowna' });
  assert.doesNotMatch(next.text, /best rated|top rated|come out on top/i, next.text);
});

test('the page: intro and meta from the facts on /guide/<town>/<badge> and /fr; noindex threshold and sitemap unchanged', async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (p) => fetch(`${base}${p}`, { redirect: 'manual' }).then(async (r) => ({ status: r.status, body: await r.text() }));
  try {
    const venues = db.prepare("SELECT * FROM venues WHERE region = 'naramata' AND happy_hour = 1 AND redirect_to IS NULL ORDER BY reviews DESC").all().map(app.rowToVenue);
    const en = app.guideIntroFor('naramata', 'happy_hour', venues, 'en');
    const page = await get('/guide/naramata/happy_hour');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(`<p class="outdoor-intro fd-intro">${en.html}</p>`), 'the intro paragraph');
    const desc = (/<meta name="description" content="([^"]*)"/.exec(page.body) || [])[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    assert.equal(desc, en.meta);
    assert.doesNotMatch(page.body.split('</head>')[0], /<meta name="robots"/, '12 places: indexable');
    assert.doesNotMatch(page.body, /Pubs, restaurants and lounges in Naramata with a happy hour/, 'the one-line template intro is gone');
    const fr = await get('/fr/guide/naramata/happy_hour');
    assert.equal(fr.status, 200);
    const frIntro = (/<p class="outdoor-intro fd-intro">([\s\S]*?)<\/p>/.exec(fr.body) || [])[1];
    assert.match(frIntro, /Sur 12 adresses|À Naramata|Nous avons les heures/, frIntro);
    assert.match(frIntro, /coups de cœur locaux/);
    assert.match(fr.body, /<meta name="description" content="12 adresses à Naramata, en C\.-B\./);
    // 9 places: still noindex, same as before.
    const thin = await get('/guide/oliver/dog_friendly');
    assert.equal(thin.status, 200);
    assert.match(thin.body.split('</head>')[0], /<meta name="robots" content="noindex">/);
    // The sitemap lists exactly the badge guides with MIN_INDEXABLE_GUIDE_VENUES places, as before.
    assert.equal(app.MIN_INDEXABLE_GUIDE_VENUES, 10);
    const sm = (await get('/sitemap.xml')).body;
    const guides = [...sm.matchAll(/<loc>https:\/\/okanaganroam\.com(\/guide\/[a-z-]+\/[a-z_]+)<\/loc>/g)].map((m) => m[1]).sort();
    const expected = app.listGuideCombos(10).map((c) => `/guide/${c.region}/${c.badge}`).sort();
    assert.deepEqual(guides, expected);
    assert.ok(guides.includes('/guide/naramata/happy_hour') && !guides.includes('/guide/oliver/dog_friendly'));
  } finally {
    srv.close();
  }
});

test('source: the threshold, the route and the sitemap lines are untouched; dated comments', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /\nconst MIN_INDEXABLE_GUIDE_VENUES = 10;\n/);
  assert.match(src, /\nconst MIN_GUIDE_VENUES = 8;\n/);
  assert.equal((src.match(/    noindex: venues\.length < MIN_INDEXABLE_GUIDE_VENUES,\n/g) || []).length, 2);
  assert.ok(src.includes('...combos.filter((c) => c.count >= MIN_INDEXABLE_GUIDE_VENUES).map('));
  assert.ok(src.includes("const guideMatch = pathname.match(/^\\/guide\\/([a-z-]+)\\/([a-z_-]+)\\/?$/);"));
  assert.ok(src.includes('// Badge guide intros (2026-10-27):'));
});
