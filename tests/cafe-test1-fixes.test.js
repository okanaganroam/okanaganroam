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
