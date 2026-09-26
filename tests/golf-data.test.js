// Golf data (2026-09-26): green-fee data, loader, freshness, sorting and the
// golf-only HTML helpers. Pure unit tests against an in-memory database --
// never the shared okanagan.db the server tests use.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const golf = require('../golf-data.js');

const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'golf-course-data.json'), 'utf8'));
const TODAY = '2026-09-26';
const clone = (o) => JSON.parse(JSON.stringify(o));
const freshDb = () => new DatabaseSync(':memory:');
const loadReal = () => { const db = freshDb(); golf.loadGolfData(db, REAL); return db; };
const v = (key, name) => { const [region, slug] = key.split('/'); return { id: 1, type: 'golf', region, slug, name: name || slug }; };
const detailOf = (db, key) => golf.getGolfDetails(db, [v(key)]).get(key);

test('the reviewed data file validates, and every published fee set is sourced, dated and has exactly one comparison rate', () => {
  assert.deepEqual(golf.validateGolfData(REAL), []);
  const courses = Object.entries(REAL.courses);
  assert.equal(courses.length, 40);
  for (const [key, c] of courses) {
    assert.match(key, /^[a-z-]+\/[a-z0-9-]+$/);
    assert.match(c.fees.verified_at, /^\d{4}-\d{2}-\d{2}$/, key);
    if (c.fees.status === 'published') {
      assert.match(c.fees.source_url, /^https?:\/\//, key);
      assert.equal(c.fees.rates.filter((r) => r.comparison).length, 1, key);
      const cmp = c.fees.rates.find((r) => r.comparison);
      assert.equal(cmp.category, 'standard', key);
      assert.ok([9, 18].includes(cmp.holes), `${key}: comparison round is 9 or 18 holes, never converted`);
    }
    for (const m of c.media || []) {
      assert.equal(m.rights_status, 'link_only', key);
      assert.doesNotMatch(m.url, /\.(png|jpe?g|gif|webp|svg|pdf)(\?|$)/i, `${key}: links to a page, never a map file`);
    }
  }
  const statuses = courses.reduce((acc, [, c]) => ({ ...acc, [c.fees.status]: (acc[c.fees.status] || 0) + 1 }), {});
  assert.deepEqual(statuses, { not_published: 5, unverified: 4, published: 28, not_applicable: 1, private: 1, dynamic: 1 });
});

test('the driving range is classified as a practice facility with no green fee', () => {
  const c = REAL.courses['kelowna/kelowna-driving-range-mini-golf'];
  assert.equal(c.profile.course_format, 'practice_facility');
  assert.equal(c.fees.status, 'not_applicable');
  const db = loadReal();
  assert.equal(golf.isPracticeFacility(detailOf(db, 'kelowna/kelowna-driving-range-mini-golf')), true);
  assert.equal(golf.isPracticeFacility(detailOf(db, 'kelowna/black-mountain-golf-club')), false);
});

test('loader: loads once, is a no-op when unchanged, rebuilds on change, and leaves tables untouched on invalid data', () => {
  const db = freshDb();
  assert.deepEqual(golf.loadGolfData(db, REAL), { loaded: true, reason: 'changed' });
  assert.deepEqual(golf.loadGolfData(db, REAL), { loaded: false, reason: 'unchanged' });
  const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const before = { p: count('golf_course_profiles'), f: count('golf_green_fees'), m: count('golf_course_media') };
  assert.deepEqual(before, { p: 40, f: 181, m: 18 });
  const changed = clone(REAL);
  changed.courses['penticton/skaha-meadows-golf-course'].fees.rates.pop();
  assert.equal(golf.loadGolfData(db, changed).loaded, true);
  assert.equal(count('golf_green_fees'), 180);
  const bad = clone(REAL);
  bad.courses['penticton/skaha-meadows-golf-course'].fees.rates[0].amount = 0;
  const res = golf.loadGolfData(db, bad);
  assert.equal(res.reason, 'invalid');
  assert.equal(count('golf_green_fees'), 180, 'invalid data changes nothing');
});

test('validation rejects invented or unsafe data', () => {
  const cases = [
    ['two comparison rates', (d) => { d.courses['penticton/skaha-meadows-golf-course'].fees.rates[1].comparison = true; }],
    ['comparison that is not a standard rate', (d) => { const r = d.courses['penticton/skaha-meadows-golf-course'].fees.rates[0]; r.category = 'twilight'; }],
    ['a published set without a source', (d) => { delete d.courses['penticton/skaha-meadows-golf-course'].fees.source_url; }],
    ['a zero price', (d) => { d.courses['penticton/skaha-meadows-golf-course'].fees.rates[0].amount = 0; }],
    ['a bad date', (d) => { d.courses['kelowna/black-mountain-golf-club'].fees.rates[0].valid_to = 'Oct 12'; }],
    ['a map file instead of a page', (d) => { d.courses['kelowna/harvest-golf-club'].media[0].url = 'https://harvestgolf.com/files/Course%20Map.png'; }],
    ['a copied/hosted map', (d) => { d.courses['kelowna/harvest-golf-club'].media[0].rights_status = 'hosted'; }],
    ['an unknown category', (d) => { d.courses['penticton/skaha-meadows-golf-course'].fees.rates[0].category = 'vip'; }],
    ['a comparison rate on an unpublished set', (d) => { d.courses['vernon/rise-golf-course'].fees.rates[0].comparison = true; }],
  ];
  for (const [label, mutate] of cases) {
    const d = clone(REAL);
    mutate(d);
    assert.ok(golf.validateGolfData(d).length > 0, label);
  }
});

test('rows attach only to golf venues (a clubhouse restaurant with the same slug gets nothing)', () => {
  const db = loadReal();
  const key = 'penticton/penticton-golf-country-club';
  const restaurant = { id: 2, type: 'restaurant', region: 'penticton', slug: 'penticton-golf-country-club', name: 'Clubhouse' };
  assert.equal(golf.getGolfDetails(db, [restaurant]).size, 0);
  assert.equal(golf.getGolfDetails(db, [v(key)]).get(key).feeSet.status, 'published');
  assert.equal(golf.getGolfDetails(db, [v('kelowna/test-golf-course')]).size, 0, 'no data -> no entry');
});

test('freshness: current this year, clearly labelled last year, hidden after that or when verification is too old', () => {
  const set = { status: 'published', season_year: 2026, verified_at: '2026-09-26' };
  assert.equal(golf.feeFreshness(set, '2026-09-26'), 'current');
  assert.equal(golf.feeFreshness(set, '2027-05-01'), 'previous_season');
  assert.equal(golf.feeFreshness(set, '2028-01-02'), 'stale');
  assert.equal(golf.feeFreshness({ ...set, verified_at: '2025-01-01' }, '2026-09-26'), 'stale');
  assert.equal(golf.feeFreshness({ status: 'not_published' }, '2026-09-26'), 'none');
  const db = loadReal();
  const d = detailOf(db, 'kelowna/black-mountain-golf-club');
  assert.match(golf.golfCardFeeHtml(d, '2026-09-26'), /2026 rates/);
  const nextYear = golf.golfCardFeeHtml(d, '2027-05-01');
  assert.match(nextYear, /2026 rates, last published — not yet checked for 2027/);
  assert.equal(golf.comparisonCents(d, '2028-01-02'), null, 'stale rates are never sorted');
  assert.match(golf.golfCardFeeHtml(d, '2028-01-02'), /Green fees not currently verified/);
  assert.match(golf.golfFeesSectionHtml(d, '2028-01-02'), /Green fees not currently verified/);
  assert.doesNotMatch(golf.golfFeesSectionHtml(d, '2028-01-02'), /\$149/);
});

test('comparison rate: standard adult rate for the standard round; none for private, dynamic, unverified or unpublished courses', () => {
  const db = loadReal();
  const cents = (k) => golf.comparisonCents(detailOf(db, k), TODAY);
  assert.equal(cents('penticton/skaha-meadows-golf-course'), 4000);
  assert.equal(cents('osoyoos/sonora-dunes-golf-course'), 4750);
  assert.equal(cents('kelowna/gallaghers-canyon-canyon-course'), 20000);
  assert.equal(cents('kelowna/kelowna-springs-golf-club'), 4700);
  for (const k of ['kelowna/kelowna-golf-country-club', 'vernon/rise-golf-course', 'west-kelowna/shannon-lake-golf-club', 'armstrong/overlander-golf-event-centre', 'kelowna/kelowna-driving-range-mini-golf']) {
    assert.equal(cents(k), null, k);
  }
});

test('card price line: holes always stated, "from" kept, cart/range/walking and tax shown; non-published statuses say so', () => {
  const db = loadReal();
  const card = (k) => golf.golfCardFeeHtml(detailOf(db, k), TODAY);
  assert.match(card('penticton/skaha-meadows-golf-course'), /<span class="golf-fee-price">\$40<\/span> <span class="golf-fee-detail">· 9 holes<\/span>/);
  assert.match(card('osoyoos/sonora-dunes-golf-course'), /\$47\.50<\/span> <span class="golf-fee-detail">· 9 holes · plus tax/);
  assert.match(card('kelowna/gallaghers-canyon-canyon-course'), /from \$200<\/span> <span class="golf-fee-detail">· 18 holes · incl\. cart · incl\. range · plus tax/);
  assert.match(card('vernon/spallumcheen-golf-country-club-executive-course'), /\$38<\/span> <span class="golf-fee-detail">· 9 holes · walking/);
  assert.match(card('kelowna/kelowna-golf-country-club'), /Private club/);
  assert.match(card('vernon/rise-golf-course'), /Dynamic pricing/);
  assert.match(card('west-kelowna/shannon-lake-golf-club'), /not yet verified/);
  assert.match(card('armstrong/overlander-golf-event-centre'), /not published online/);
  assert.equal(card('kelowna/kelowna-driving-range-mini-golf'), '', 'practice facility: no green-fee line');
  assert.equal(golf.golfCardFeeHtml(undefined, TODAY), '');
});

test('text from the data file is escaped', () => {
  const d = clone(REAL);
  d.courses['penticton/skaha-meadows-golf-course'].fees.rates[0].time_window = '<script>alert(1)</script>';
  d.courses['kelowna/harvest-golf-club'].media[0].owner = '"><img src=x>';
  const db = freshDb();
  golf.loadGolfData(db, d);
  const skaha = detailOf(db, 'penticton/skaha-meadows-golf-course');
  for (const html of [golf.golfCardFeeHtml(skaha, TODAY), golf.golfFeesSectionHtml(skaha, TODAY)]) {
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  }
  assert.doesNotMatch(golf.golfCourseMapHtml(detailOf(db, 'kelowna/harvest-golf-club')), /<img/);
});

test('sorting: low-high and high-low by comparison rate, ties by name, unpriced last by name; recommended keeps order; name A-Z', () => {
  const db = loadReal();
  const list = [
    v('kelowna/kelowna-golf-country-club', 'Kelowna G&CC'),
    v('penticton/penticton-golf-country-club', 'Penticton G&CC'),
    v('osoyoos/sonora-dunes-golf-course', 'Sonora Dunes'),
    v('kelowna/okanagan-golf-club-quail-course', 'OGC Quail'),
    v('kelowna/gallaghers-canyon-canyon-course', "Gallagher's Canyon"),
    v('vernon/rise-golf-course', 'The Rise'),
    v('penticton/skaha-meadows-golf-course', 'Skaha Meadows'),
  ];
  const details = golf.getGolfDetails(db, list);
  const names = (s) => golf.sortGolfCourses(list, details, s, TODAY).map((x) => x.name);
  assert.deepEqual(names('price-asc'), ['Skaha Meadows', 'Sonora Dunes', 'Penticton G&CC', "Gallagher's Canyon", 'OGC Quail', 'Kelowna G&CC', 'The Rise']);
  assert.deepEqual(names('price-desc'), ["Gallagher's Canyon", 'OGC Quail', 'Penticton G&CC', 'Sonora Dunes', 'Skaha Meadows', 'Kelowna G&CC', 'The Rise']);
  assert.deepEqual(names('recommended'), list.map((x) => x.name));
  assert.deepEqual(names('name'), list.map((x) => x.name).sort((a, b) => a.localeCompare(b)));
  assert.equal(golf.hasSortablePrices(list, details, TODAY), true);
  assert.equal(golf.hasSortablePrices([v('kelowna/kelowna-golf-country-club')], details, TODAY), false);
});

test('sort parameter and sort control', () => {
  assert.equal(golf.parseGolfSort({ sort: 'price-asc' }), 'price-asc');
  assert.equal(golf.parseGolfSort({ sort: ['price-desc', 'name'] }), 'price-desc');
  for (const bad of [{}, { sort: 'cheapest' }, { sort: '<x>' }, null]) assert.equal(golf.parseGolfSort(bad), 'recommended');
  const nav = golf.golfSortNavHtml('/golf', 'price-asc');
  assert.match(nav, /<span class="category-region-selector-active" aria-current="true">Price: low to high<\/span>/);
  assert.match(nav, /<a href="\/golf" rel="nofollow">Recommended<\/a>/);
  assert.match(nav, /<a href="\/golf\?sort=price-desc" rel="nofollow">Price: high to low<\/a>/);
  assert.match(nav, /9-hole and 18-hole rounds are labelled, never converted/);
  assert.doesNotMatch(golf.golfSortNavHtml('/golf', 'recommended'), /golf-sort-note/);
});

test('venue page: green-fee table with source and date; unpublished courses point to the club instead', () => {
  const db = loadReal();
  const bm = golf.golfFeesSectionHtml(detailOf(db, 'kelowna/black-mountain-golf-club'), TODAY);
  assert.match(bm, /<h2>Green fees<\/h2>/);
  assert.match(bm, /<tr class="is-comparison">/);
  assert.match(bm, /Peak season · Apr 17–Oct 12, 2026/);
  assert.match(bm, /href="https:\/\/blackmountaingolf\.ca\/golf\/rates\/" rel="nofollow noopener" target="_blank"/);
  assert.match(bm, /checked September 26, 2026/);
  assert.match(bm, /confirm with the course before you go/);
  const ov = golf.golfFeesSectionHtml(detailOf(db, 'armstrong/overlander-golf-event-centre'), TODAY);
  assert.match(ov, /Green fees not published online\. Check current rates on/);
  assert.doesNotMatch(ov, /<table/);
  const priv = golf.golfFeesSectionHtml(detailOf(db, 'kelowna/kelowna-golf-country-club'), TODAY);
  assert.match(priv, /Private club/);
  assert.doesNotMatch(priv, /Check current rates/);
  const rise = golf.golfFeesSectionHtml(detailOf(db, 'vernon/rise-golf-course'), TODAY);
  assert.match(rise, /Dynamic pricing — regular rates not published; published fixed rates are listed below/);
  assert.equal(golf.golfFeesSectionHtml(detailOf(db, 'kelowna/kelowna-driving-range-mini-golf'), TODAY), '');
});

test('course map: a link to the club\'s own page (new tab, noopener), never an embedded image; nothing when there is no map', () => {
  const db = loadReal();
  const harvest = golf.golfCourseMapHtml(detailOf(db, 'kelowna/harvest-golf-club'));
  assert.match(harvest, /<h2>Course map<\/h2>/);
  assert.match(harvest, /<a class="cta golf-map-cta" href="https:\/\/harvestgolf\.com\/golf\/course-map-scorecard\/" rel="nofollow noopener" target="_blank">View course map ↗<\/a>/);
  assert.match(harvest, /does not copy them/);
  assert.doesNotMatch(harvest, /<img|<iframe|<embed|<object/);
  assert.match(golf.golfCourseMapHtml(detailOf(db, 'kelowna/michaelbrook-golf-course')), /<h2>Scorecard<\/h2>[\s\S]*View scorecard/);
  assert.equal(golf.golfCourseMapHtml(detailOf(db, 'armstrong/overlander-golf-event-centre')), '');
});

test('golf CSS never uses the golf card attribute selector (so the Beach/Outdoor derived themes are unaffected)', () => {
  assert.doesNotMatch(golf.GOLF_DATA_CSS, /data-venue-category/);
  assert.match(golf.GOLF_DATA_CSS, /var\(--ref-navy\)/);
  assert.match(golf.GOLF_DATA_CSS, /var\(--ref-gold\)/);
});

// ---- Okanagan Roam Value Index (2026-09-26) ----
test('value index: reproduces the approved like-for-like results exactly for all 22 rated courses', () => {
  const approved = {
    'penticton/penticton-golf-country-club': [70, 0, 15, 85, 'Excellent value'],
    'osoyoos/osoyoos-golf-club-park-meadows': [53, 15, 15, 83, 'Excellent value'],
    'osoyoos/osoyoos-golf-club-desert-gold': [49, 15, 15, 79, 'Excellent value'],
    'vernon/spallumcheen-golf-country-club-championship-course': [61, 0, 15, 76, 'Excellent value'],
    'oliver/fairview-mountain-golf-club': [60, 0, 15, 75, 'Excellent value'],
    'kelowna/gallaghers-canyon-canyon-course': [37, 15, 15, 67, 'Great value'],
    'kelowna/harvest-golf-club': [37, 15, 15, 67, 'Great value'],
    'kelowna/okanagan-golf-club-bear-course': [37, 15, 15, 67, 'Great value'],
    'kelowna/okanagan-golf-club-quail-course': [37, 15, 15, 67, 'Great value'],
    'kelowna/sunset-ranch-golf-country-club': [57, 0, 8, 65, 'Great value'],
    'kelowna/black-mountain-golf-club': [49, 10, 0, 59, 'Good value'],
    'vernon/predator-ridge-predator-course': [24, 0, 11, 35, 'Fair value'],
    'vernon/predator-ridge-ridge-course': [24, 0, 11, 35, 'Fair value'],
    'kelowna/mission-creek-golf-club': [50, 0, 4, 54, 'Good value'],
    'kelowna/michaelbrook-golf-course': [49, 0, 0, 49, 'Good value'],
    'west-kelowna/two-eagles-golf-course-academy': [37, 0, 11, 48, 'Good value'],
    'lumby/coldstream-golf-course': [70, 0, 7, 77, 'Excellent value'],
    'kelowna/gallaghers-canyon-pinnacle-course': [37, 5, 15, 57, 'Good value'],
    'osoyoos/sonora-dunes-golf-course': [42, 0, 15, 57, 'Good value'],
    'kelowna/orchard-greens-golf-club': [56, 0, 0, 56, 'Good value'],
    'penticton/skaha-meadows-golf-course': [50, 0, 4, 54, 'Good value'],
    'kaleden/st-andrews-by-the-lake-golf-resort': [48, 0, 0, 48, 'Good value'],
  };
  const db = loadReal();
  const got = {};
  for (const k of Object.keys(REAL.courses)) {
    const vi = golf.computeValueIndex(detailOf(db, k), TODAY);
    if (vi && vi.available) {
      assert.equal(vi.score, vi.price.points + vi.included.points + vi.facilities.points, k);
      got[k] = [vi.price.points, vi.included.points, vi.facilities.points, vi.score, vi.label];
    }
  }
  assert.deepEqual(got, approved);
  const dist = Object.values(got).reduce((a, r) => ({ ...a, [r[4]]: (a[r[4]] || 0) + 1 }), {});
  assert.deepEqual(dist, { 'Excellent value': 6, 'Great value': 5, 'Good value': 9, 'Fair value': 2 });
});

test('value index: like-for-like groups with fixed 2026 reference fees ($149 / $52 / $41)', () => {
  assert.deepEqual(REAL.value_index.reference_fees, { championship_18: 149, short_18: 52, nine_hole: 41 });
  const db = loadReal();
  const vi = (k) => golf.computeValueIndex(detailOf(db, k), TODAY);
  assert.equal(vi('kelowna/harvest-golf-club').price.group, 'championship_18');
  assert.equal(vi('kelowna/mission-creek-golf-club').price.group, 'short_18');
  assert.equal(vi('kelowna/michaelbrook-golf-course').price.group, 'short_18');
  assert.equal(vi('lumby/coldstream-golf-course').price.group, 'nine_hole');
  assert.equal(vi('kelowna/gallaghers-canyon-pinnacle-course').price.group, 'nine_hole', 'a 9-hole mid-length course is compared with 9-hole courses');
  assert.equal(vi('kelowna/black-mountain-golf-club').price.points, 49, 'at the reference fee: 49');
  assert.equal(golf.valueGroup({ holes: 18, course_format: null }), null, 'unknown course type: no group, no index');
});

test('value index: smooth price curve, no hard cutoff; capped at 70; never zero', () => {
  const db = loadReal();
  const base = detailOf(db, 'kelowna/black-mountain-golf-club');
  const at = (fee) => {
    const d = { ...base, rates: base.rates.map((r) => (r.is_comparison ? { ...r, amount_cents: Math.round(fee * 100) } : r)) };
    return golf.computeValueIndex(d, TODAY).price.points;
  };
  assert.equal(at(149), 49);
  assert.equal(at(223.5), 33, '1.5x the reference');
  assert.equal(at(298), 25, '2x the reference');
  assert.equal(at(447), 16, '3x the reference');
  assert.ok(at(1500) > 0 && at(900) > 0, 'expensive courses score low, never zero');
  assert.equal(at(104.3), 70, '70% of the reference earns the full 70');
  assert.equal(at(50), 70, 'capped at 70');
  let prev = 71;
  for (let fee = 60; fee <= 600; fee += 7) { const p = at(fee); assert.ok(p <= prev, `non-increasing at $${fee}`); prev = p; }
  const pred = golf.computeValueIndex(detailOf(db, 'vernon/predator-ridge-predator-course'), TODAY);
  assert.equal(pred.price.points, 24, '$300 no longer gets zero price points');
});

test('value index: no reference fee for the season means no index; invalid reference fees are rejected', () => {
  const noRef = clone(REAL);
  delete noRef.value_index;
  const db = freshDb();
  golf.loadGolfData(db, noRef);
  assert.deepEqual(golf.computeValueIndex(detailOf(db, 'kelowna/harvest-golf-club'), TODAY), { available: false });
  const other = clone(REAL);
  other.value_index.season_year = 2025;
  const db2 = freshDb();
  golf.loadGolfData(db2, other);
  assert.deepEqual(golf.computeValueIndex(detailOf(db2, 'kelowna/harvest-golf-club'), TODAY), { available: false });
  const bad = clone(REAL);
  bad.value_index.reference_fees.nine_hole = 0;
  assert.ok(golf.validateGolfData(bad).some((m) => /reference_fees\.nine_hole/.test(m)));
});

test('value index: "not documented" is never "no", earns nothing, and does not make a course ineligible', () => {
  const db = loadReal();
  const bm = golf.computeValueIndex(detailOf(db, 'kelowna/black-mountain-golf-club'), TODAY);
  assert.equal(bm.available, true);
  assert.deepEqual(bm.facilities.items.map((x) => x.status), ['not_documented', 'not_documented', 'not_documented']);
  assert.equal(bm.facilities.points, 0);
  const sunset = golf.computeValueIndex(detailOf(db, 'kelowna/sunset-ranch-golf-country-club'), TODAY);
  assert.deepEqual(sunset.facilities.items.map((x) => x.status), ['no', 'yes', 'yes'], 'a documented absence is "no"');
  const html = golf.golfValueSectionHtml(detailOf(db, 'kelowna/black-mountain-golf-club'), TODAY);
  assert.match(html, /Driving range: not documented/);
  assert.doesNotMatch(html, /Driving range: no\b/);
  assert.match(golf.golfValueSectionHtml(detailOf(db, 'kelowna/sunset-ranch-golf-country-club'), TODAY), /Driving range: no · Putting green: yes \(\+4\)/);
});

test('value index: unavailable without a published current rate or a known par; never for practice facilities or courses without data', () => {
  const db = loadReal();
  const vi = (k, today = TODAY) => golf.computeValueIndex(detailOf(db, k), today);
  for (const k of ['kelowna/kelowna-golf-country-club', 'vernon/rise-golf-course', 'west-kelowna/shannon-lake-golf-club', 'armstrong/overlander-golf-event-centre',
    'kaleden/twin-lakes-golf-course', 'kelowna/kelowna-springs-golf-club', 'summerland/summerland-golf-country-club']) {
    assert.deepEqual(vi(k), { available: false }, k);
  }
  assert.deepEqual(vi('osoyoos/osoyoos-golf-club-park-meadows', '2027-05-01'), { available: false }, 'last season’s rates are not a current value assessment');
  assert.equal(vi('kelowna/kelowna-driving-range-mini-golf'), null);
  assert.equal(golf.computeValueIndex(undefined, TODAY), null);
  assert.equal(golf.golfCardValueHtml(detailOf(db, 'vernon/rise-golf-course'), TODAY), '<p class="golf-value golf-value-none">Value index unavailable</p>');
  assert.equal(golf.golfCardValueHtml(detailOf(db, 'kelowna/kelowna-driving-range-mini-golf'), TODAY), '');
  const rated = Object.keys(REAL.courses).filter((k) => { const x = vi(k); return x && x.available; });
  assert.equal(rated.length, 22);
});

test('value index: labels, wording, basis line; no stars, no review markup', () => {
  assert.deepEqual([75, 74, 60, 59, 45, 44, 30, 29, 0].map(golf.valueLabel),
    ['Excellent value', 'Great value', 'Great value', 'Good value', 'Good value', 'Fair value', 'Fair value', 'Premium-priced', 'Premium-priced']);
  const db = loadReal();
  const d = detailOf(db, 'osoyoos/osoyoos-golf-club-park-meadows');
  assert.equal(golf.golfCardValueHtml(d, TODAY), '<p class="golf-value">Okanagan Roam Value Index: 83/100 · Excellent value</p>');
  const html = golf.golfValueSectionHtml(d, TODAY);
  for (const needle of ['Okanagan Roam Value Index: 83/100 · Excellent value', 'Price for the golf you get', 'Included in the green fee', 'Practice facilities',
    'Based on 2026 rates · Checked Sep 26, 2026', 'not a user review', '$139 for 18 holes · Compared with other 18-hole championship courses (2026 reference fee: $149)',
    '53 / 70', '15 / 15', 'compared only with courses of the same kind']) {
    assert.ok(html.includes(needle), needle);
  }
  assert.doesNotMatch(html + golf.golfCardValueHtml(d, TODAY), /★|☆|star|rating|AggregateRating/i);
});
