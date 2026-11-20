// Indoor test 14 sweep (2026-11-19; Helen's museum kept research's "Closed Tuesdays and Wednesdays" and a passed exhibit
// date on her page after she saved her hours). For EVERY indoor kind: research lines in Good to know, Known for, Groups, the
// Prices row and the story lead that her saved hours, price, booking or ages answer now contradict, or whose date has
// passed, are kept off the public page (display only: the research text is untouched), listed for the setup's "We also
// had: '…' Still right?" (setupStale), and flagged (never pre-filled) on the Good to know screen. Lines that still agree
// with her answers stay. Keep and Remove are remembered.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-stale-admin-token';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const NOW = new Date('2026-11-19T12:00:00-08:00');
const WEEK = (a, b, closed = []) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, closed.includes(d) ? null : [[a, b]]]));
let srv, base, ipN = 0, n = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.88.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const page = (v, lang = 'en') => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW }));
const setBox = (id, rows) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify({ rows, source_url: 'https://research.example', checked_at: '2026-10-31' }));

// The research lines each place starts with: four that her answers below contradict, one with a passed date, and the ones
// that still hold.
const STALE = {
  hours: 'Closed Mondays and Tuesdays.',
  booking: 'Booking is required for every visit.',
  ages: 'Ages 12 and up only.',
  price: 'Adult admission $18 at the door.',
  date: 'Special exhibit runs to November 9, 2026.',
  story: 'Closed Mondays.',
};
// Research's Prices row is replaced by her price answer (it is never asked about); "Open daily" holds while she opens
// every day.
const OPEN_DAILY = 'Open daily all week long.';
const FINE = ['Free parking behind the building.', 'Gift shop by the entrance.', 'Hands-on fun for everyone', OPEN_DAILY];
const KINDS = IK.INDOOR_KIND_TEXT_KINDS.filter((k) => k !== 'other');

const place = async (kind, answers) => {
  const v = app.createVenue({ name: `Stale ${kind} ${++n}`, slug: `indoor-stale-${n}`, region: 'penticton', type: 'indoor', latitude: 49.49 + n / 3000, longitude: -119.59,
    address: `${n} Main St, Penticton, BC`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WEEK('10:00', '17:00', ['mon', 'tue'])),
    description: `A place to visit in Penticton. ${STALE.story} Plenty to see inside.` });
  setBox(v.id, [
    { label: 'Prices', text: 'Adult $18, seniors $15, kids $9.' },
    { label: 'Known for', text: `${FINE[2]}. ${OPEN_DAILY}` },
    { label: 'Good to know', text: `${FINE[0]} ${STALE.hours} ${STALE.booking} ${STALE.ages} ${STALE.price} ${STALE.date} ${FINE[1]}` }]);
  const t = app.createOwnerLink(v.id, { reset: true }).url.split('/owner/')[1];
  if (answers) {
    await ok(change(t, { indoor_info: { kinds: [kind], length: '1-2h', ...answers.info }, ...(answers.price !== undefined ? { indoor_price: answers.price } : {}) }));
    if (answers.hours) await ok(change(t, { hours: answers.hours }));
    approveAll(v.id);
  }
  return { v, t };
};

test('every indoor kind: her answers (open every day, walk-ins, all ages, by donation) hide the research lines they contradict and the passed date, on the page and in the setup; the rest stay; research is untouched', async () => {
  const wrong = [];
  for (const kind of KINDS) {
    const { v, t } = await place(kind, { info: { book: 'no', age: 'all', year: 'all' }, price: 'donation', hours: WEEK('10:00', '17:00') });
    const en = page(v);
    for (const [k, line] of Object.entries(STALE)) if (en.includes(line.replace(/\.$/, ''))) wrong.push(`${kind}: page still says ${k} "${line}"`);
    for (const line of FINE) if (!en.includes(line.replace(/\.$/, ''))) wrong.push(`${kind}: page lost "${line}"`);
    const stale = app.indoorStaleResearch(app.getVenue(v.id), NOW).map((x) => x.text);
    for (const [k, line] of Object.entries(STALE)) if (!stale.includes(line)) wrong.push(`${kind}: setup not asked about ${k} "${line}" (${stale.join(' | ')})`);
    for (const line of FINE) if (stale.some((x) => x.startsWith(line.replace(/\.$/, '')))) wrong.push(`${kind}: setup asked about a line that holds "${line}"`);
    if (!/Closed Mondays and Tuesdays/.test(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info)) wrong.push(`${kind}: research changed`);
    if (/Closed Mondays/.test(app.getVenue(v.id).description) === false) wrong.push(`${kind}: description changed`);
    // The Good to know screen flags them (found online) and never pre-fills them as hers.
    if (kind === KINDS[0] || kind === 'cinema' || kind === 'pool') {
      const g = await openSetup(base, t, { hash: 'bring' });
      const box = g.doc.getElementById('suBring').value;
      for (const k of ['hours', 'booking', 'ages', 'date']) if (box.includes(STALE[k].replace(/\.$/, ''))) wrong.push(`${kind}: Good to know box pre-filled "${STALE[k]}"`);
      if (!box.includes('Free parking behind the building')) wrong.push(`${kind}: Good to know box lost the line that holds`);
      if (!g.has('#suBringClash')) wrong.push(`${kind}: no found-online flag on Good to know`);
      const s = await openSetup(base, t, { hash: 'more' });
      if (!/We also had: “Closed Mondays and Tuesdays\.” Still right\?/.test(s.text())) wrong.push(`${kind}: no "We also had" on the next screen`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('every indoor kind: answers that agree with research (closed Mon–Tue, book ahead, 12+, an $18 price) hide only what disagrees (Open daily) and the passed date; before any answer nothing is hidden', async () => {
  const wrong = [];
  for (const kind of KINDS) {
    const { v } = await place(kind, { info: { book: 'ahead', age: '12', year: 'all' }, price: 18, hours: WEEK('09:00', '18:00', ['mon', 'tue']) });
    const stale = app.indoorStaleResearch(app.getVenue(v.id), NOW).map((x) => `${x.why}:${x.text}`);
    // "Open daily all week long" contradicts closed Mondays and Tuesdays; the passed date is out of date.
    const want = ['hours:Open daily all week long.', 'date:Special exhibit runs to November 9, 2026.'];
    if (JSON.stringify(stale.sort()) !== JSON.stringify(want.sort())) wrong.push(`${kind}: ${stale.join(' | ')}`);
    const { v: u } = await place(kind, null);
    if (app.indoorStaleResearch(app.getVenue(u.id), NOW).length) wrong.push(`${kind}: hidden before any answer`);
    if (!page(u).includes('Closed Mondays and Tuesdays')) wrong.push(`${kind}: unanswered page lost research`);
  }
  assert.deepEqual(wrong, []);
});

test('Keep and Remove are remembered for every kind: Keep puts the line back on the page and stops asking; Remove keeps it off and never pre-fills it', async () => {
  const wrong = [];
  for (const kind of KINDS) {
    const { v, t } = await place(kind, { info: { book: 'no', age: 'all', year: 'all' }, price: 'donation', hours: WEEK('10:00', '17:00') });
    const key = (line) => app.indoorStaleKey(line);
    await ok(change(t, { indoor_info: { kept: [key(STALE.date)], gone: [key(STALE.hours)] } }));
    const en = page(v);
    if (!en.includes('Special exhibit runs to November 9, 2026')) wrong.push(`${kind}: kept line not back`);
    if (en.includes('Closed Mondays and Tuesdays')) wrong.push(`${kind}: removed line back`);
    const left = app.indoorStaleResearch(app.getVenue(v.id), NOW);
    if (left.some((x) => x.text === STALE.date)) wrong.push(`${kind}: kept line still asked`);
    if (!left.some((x) => x.text === STALE.hours && x.gone)) wrong.push(`${kind}: removed line not remembered`);
  }
  assert.deepEqual(wrong, []);
  // Bad keys are refused.
  const { t } = await place('museum', { info: { book: 'no' } });
  const r = await change(t, { indoor_info: { kept: ['not a key'] } });
  assert.equal(r.status, 400);
});
