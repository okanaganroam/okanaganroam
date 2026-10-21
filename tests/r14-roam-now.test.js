// Round 14 (2026-10-20), Roam Now (/map): comedy no longer reads a jazz set's "improvisation" (or "laughs" in a
// description) as comedy; the empty Events list suggests a bigger distance only when one has events; and the
// events after this week load on demand from /map/ahead.json (New Year's Eve, Christmas markets, nothing this week).
// Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');

const TODAY = app.todayLocal();
const day = (n) => app.addLocalDays(TODAY, n);
const YEAR = Number(TODAY.slice(0, 4));
// A Dec 31 more than a week away (next year's when this year's is within the week).
const NYE = day(8) > `${YEAR}-12-31` ? `${YEAR + 1}-12-31` : `${YEAR}-12-31`;
const EVENTS = [
  // [name, description, categories, date]
  ['R14 Okanagan Sax Live', 'An early-evening set from Okanagan Sax in the wine lounge, moving from soulful ballads to energetic jazz improvisation. Admission is free.', ['live-music', 'wineries-wine-events'], day(2)],
  ['R14 Crystal Gong Concert', 'Two sets of improvised sound music on planet gongs and crystal bowls.', ['live-music'], day(3)],
  ['R14 Blue Brunch', 'A first-Sunday drag brunch with plenty of laughs.', ['nightlife'], day(3)],
  ['R14 Laugh Riot', 'Three stand-up comedians on one bill.', ['arts-culture', 'nightlife'], day(2)],
  ['R14 Improv Night', 'Improv games with the crowd.', ['arts-culture'], day(4)],
  ['R14 Magic & Illusion', 'A magician performs close-up magic and an interactive stage show of mind reading, illusions and comedy.', ['arts-culture'], day(4)],
  ['R14 Late Comedy Night', 'Stand-up comedy from touring comics.', ['nightlife'], day(20)],
  ['R14 New Years Eve Gala', 'Ring in the new year with a band and a midnight toast.', ['nightlife', 'holiday-seasonal'], NYE],
  ['R14 Far Future Fair', 'A craft fair.', ['community-events'], day(120)],
];
for (const [name, description, cats, d] of EVENTS) {
  const eid = db.prepare('INSERT INTO events (name, slug, region, description, start_datetime, venue_name_text) VALUES (?, ?, ?, ?, ?, ?)').run(name, app.slugify(name), 'kelowna', description, `${d} 19:00:00`, 'Prospera Place').lastInsertRowid;
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(eid, d, d, '19:00', '21:00');
  cats.forEach((c, i) => db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(eid, c, i));
}

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  srv.closeAllConnections();
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => {
  const res = await fetch(base + p);
  assert.equal(res.status, 200, `${p} -> ${res.status}`);
  return { text: await res.text(), headers: res.headers };
};
const json = async (p) => JSON.parse((await get(p)).text);
const kindsIn = (data, n) => ((data.e.find((e) => e[0] === n) || [])[12]) || [];

// ---------- 1. Comedy ----------

test('comedy: a jazz set’s "improvisation", "improvised" music and "laughs" in a description are not comedy', () => {
  const kind = (name, description = '', categories = []) => app.searchShowKind({ name, description, categories });
  assert.equal(kind('Okanagan Sax Live', EVENTS[0][1], ['live-music']), 'music', 'jazz improvisation is music');
  assert.equal(kind('Crystal Journey Halloween Concert', 'Two sets of improvised sound music on gongs.', ['live-music']), 'music');
  assert.notEqual(kind('Blue Girl Brunch', 'A drag brunch with plenty of laughs.'), 'comedy');
  // The real comedy signals still count, in the name or the description.
  assert.equal(kind('Hungry for Laughs Comedy Tour'), 'comedy');
  assert.equal(kind('Maple Laughs'), 'comedy', '"Laughs" in a show’s name');
  assert.equal(kind('Improv Night', 'Improv games.'), 'comedy');
  assert.equal(kind('Friday Night', 'An evening of improvised comedy.'), 'comedy');
  assert.equal(kind('Ron James: The Noise Between Our Ears', 'Ron James brings his new stand-up show to the theatre.'), 'comedy');
  assert.equal(kind('Sergei Putinski', 'A viral character comic and comedian.'), 'comedy');
  // A magic show billed with comedy stays in comedy, as the site search has listed it.
  assert.equal(kind('The Art of Magic & Illusion', EVENTS[5][1]), 'comedy');
  assert.equal(kind('Stand Up Paddle Tour'), null);
});

test('/map: the comedy kind skips the sax set, the gong concert and the drag brunch, and keeps the comedy shows', async () => {
  const data = await json('/map/data.json');
  for (const n of ['R14 Okanagan Sax Live', 'R14 Crystal Gong Concert', 'R14 Blue Brunch']) assert.ok(!kindsIn(data, n).includes('comedy'), `${n}: ${kindsIn(data, n)}`);
  for (const n of ['R14 Laugh Riot', 'R14 Improv Night', 'R14 Magic & Illusion']) assert.ok(kindsIn(data, n).includes('comedy'), n);
});

// ---------- 2 + 3. The weeks ahead, and the empty list ----------

test('/map/data.json keeps this week only; /map/ahead.json holds the weeks after it (to 90 days), noindex', async () => {
  const data = await json('/map/data.json');
  for (const e of data.e) assert.ok(e[6] <= day(7), `${e[0]} ${e[6]} in data.json`);
  const page = (await get('/map')).text;
  const conf = JSON.parse(page.match(/CONF = (\{.*?\});/)[1]);
  assert.match(conf.ah, /^\/map\/ahead\.json\?v=[0-9a-f]{12}$/);
  const ahead = await get(conf.ah);
  assert.equal(ahead.headers.get('x-robots-tag'), 'noindex');
  assert.match(ahead.headers.get('cache-control'), /max-age=86400/);
  const later = JSON.parse(ahead.text);
  const names = later.e.map((e) => e[0]);
  assert.ok(names.includes('R14 Late Comedy Night'));
  assert.ok(kindsIn(later, 'R14 Late Comedy Night').includes('comedy'));
  assert.ok(kindsIn(later, 'R14 New Years Eve Gala').includes('new_years'), JSON.stringify(kindsIn(later, 'R14 New Years Eve Gala')));
  assert.ok(!names.includes('R14 Far Future Fair'), 'beyond What’s On’s 90 days');
  assert.ok(!names.includes('R14 Laugh Riot'), 'this week’s events stay in data.json only');
  for (const e of later.e) assert.ok(e[6] > day(7), `${e[0]} ${e[6]}`);
  assert.match((await get('/robots.txt')).text, /^Disallow: \/map\/ahead\.json$/m);
  // Not a page for the sitemap.
  assert.ok(!(await get('/sitemap.xml')).text.includes('ahead.json'));
});

// The page's own functions, run with a fixed state.
async function mapFns(lang) {
  const html = (await get(lang === 'fr' ? '/fr/map' : '/map')).text;
  const grab = (re) => { const m = html.match(re); assert.ok(m, String(re)); return m[0]; };
  const T = (() => {
    const ctx = { FR: lang === 'fr', hrefAttr: (h) => `href="${h}"` };
    vm.runInNewContext(`this.T = ${html.slice(html.indexOf('var T = FR ?') + 'var T = '.length, html.indexOf('  var TYPES = CONF.t'))}`, ctx);
    return ctx.T;
  })();
  return { html, T, src: `${grab(/function evGroup\(e, today, nowMin\)\{[^\n]*\}/)}\n${grab(/function noEventsText\(\)\{[\s\S]*?\n  \}/)}` };
}
function emptyText(fns, state) {
  const ctx = { T: fns.T, okToday: () => '2026-10-20', okanaganClock: () => ({ minutes: 600 }), eventGroup: (e) => (e.sd <= '2026-10-27' ? 'week' : null),
    evHit: (e) => e.tp.includes('new_years'), me: null, radiusKm: 5, evTerm: '', evKinds: [], aheadOn: false, aheadState: null, events: [], ...state };
  vm.runInNewContext(`${fns.src}\nthis.out = noEventsText();`, ctx);
  return ctx.out;
}

test('/map + /fr/map: an empty Events list says "bigger distance" only when a bigger distance has events', async () => {
  for (const lang of ['en', 'fr']) {
    const fns = await mapFns(lang);
    const bigger = lang === 'fr' ? /plus grande distance/ : /bigger distance/;
    const here = { lat: 49.88, lng: -119.49 };
    // « réveillon » in October: nothing in the week the map holds, a 5 km distance: no distance hint.
    const nye = emptyText(fns, { me: here, evKinds: ['new_years'], events: [{ sd: '2026-10-22', ed: '2026-10-22', tp: ['comedy'] }] });
    assert.doesNotMatch(nye, bigger, `${lang}: ${nye}`);
    assert.equal(nye, lang === 'fr' ? 'Aucun événement de ce genre sur la carte cette semaine.' : 'No events like that on the map this week.');
    // The weeks ahead loaded and still none.
    const soon = emptyText(fns, { me: here, evKinds: ['new_years'], aheadOn: true, aheadState: true, events: [] });
    assert.doesNotMatch(soon, bigger);
    assert.match(soon, lang === 'fr' ? /semaines à venir/ : /coming weeks/);
    // A New Year's Eve event further than the distance: the hint stays.
    const far = emptyText(fns, { me: here, evKinds: ['new_years'], aheadOn: true, aheadState: true, events: [{ sd: '2026-12-31', ed: '2026-12-31', tp: ['new_years'], ah: true }] });
    assert.match(far, bigger, `${lang}: ${far}`);
    // This week's events, none within the distance: the hint stays; without a location there is no distance to change.
    assert.match(emptyText(fns, { me: here, events: [{ sd: '2026-10-22', ed: '2026-10-22', tp: [] }] }), bigger);
    assert.doesNotMatch(emptyText(fns, { me: null, events: [] }), bigger);
    // Before the weeks ahead are in, the New Year's Eve notice still says the map holds 7 days; after, it says what it found.
    assert.match(fns.T.nyeEvents(0, '/x', false), lang === 'fr' ? /7 prochains jours/ : /next 7 days/);
    assert.match(fns.T.nyeEvents(2, '/x', true), lang === 'fr' ? /réveillon à venir/ : /Upcoming New Year’s Eve events/);
    assert.match(fns.T.eventsSoon(3, 5), lang === 'fr' ? /^3 événements à moins de 5 km à venir$/ : /^3 events within 5 km coming up$/);
    assert.equal(fns.T.ahead, lang === 'fr' ? 'À venir' : 'Coming up');
  }
});

test('/map: New Year’s Eve, Christmas markets and an events search with nothing this week load /map/ahead.json, once', async () => {
  const { html } = await mapFns('en');
  assert.match(html, /aheadOn = !!\(nyeAsk \|\| xmasMarket \|\| \(\(evTerm \|\| evKinds\.length\) && !events\.some\(/);
  assert.match(html, /if \(aheadOn\) loadAhead\(\);/);
  assert.match(html, /if \(aheadState === true \|\| aheadState === 'loading' \|\| !CONF\.ah\) return;/);
  // The first load is still data.json alone.
  assert.equal((html.match(/fetch\(CONF\.ah/g) || []).length, 1);
  assert.match(html, /fetch\(CONF\.src, /);
  for (const s of html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
});
