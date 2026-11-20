// Indoor test 17 (2026-11-19; Megan, owner of a bouldering gym in Kelowna: a day pass $22, walk-ins, All ages with "Kids
// under 14 need an adult on the mats" in Good to know, birthday parties and team events in Groups, an old research line
// "Wednesday … opens at 2:30 PM", a waiver link). Each fix from her report, checked with the real setup page script and
// real taps (tests/setup-sim.js), the public page (EN + FR), search, Build My Trip and the trip page script; and the five
// general fixes (G1–G5) as loops over EVERY indoor kind, so a fix made for one kind can't miss the next one:
//   G1 the price typer's first line, every kind × every price unit
//   G2 owner text vs research in Groups and Good to know, every path (chip tap, size tap, typing after research or chips)
//   G3 stale research time statements after an hours change, every kind (also tests/indoor-stale-research.test.js)
//   G4 adult rules from the owner's own text, every kind and age answer (also tests/indoor-kids-matrix.test.js)
//   G5 plain activity words read as the kind (also tests/indoor-planner-matrix.test.js)
// Her Help questions are in the Help matrix (tests/indoor-help-matrix.test.js).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test17-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
// Megan's hours: 10 to 10 weekdays, 9 to 8 weekends (Wednesday too: route-setting moved).
const MEGAN = { ...DAY('10:00', '22:00'), sat: [['09:00', '20:00']], sun: [['09:00', '20:00']] };
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T17 Fixture ${++n}`, slug: `indoor-t17-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.884 + n / 3000, longitude: -119.4228,
  address: `${400 + n} Banks Rd, Kelowna, BC`, phone: '778-555-0117', website: 'https://example.com', hours: JSON.stringify(DAY('10:00', '20:00')), rating: 4.5, reviews: 100,
  description: 'A local place in Kelowna.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.117.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); };
const rowsOf = (id) => JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id).info);
const menuCfg = async (t, lang = 'en') => { const h = await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/menu`); const m = /"firstItem":\{"name":"([^"]*)","price":"([^"]*)"\}/.exec(h); return { first: m ? m[1] : null, price: m ? m[2] : null, html: h }; };

// G1. The words that may only appear in a first line when the kind and the place's own words say them.
const FOREIGN = [
  [/\bjump/i, (k, own) => k === 'climbing' && /trampolin|jump/i.test(own)], [/\bmassage/i, (k, own) => k === 'spa' && /massage/i.test(own)],
  [/\bVR\b|réalité virtuelle/i, (k, own) => k === 'games' && /\bvr\b|virtual/i.test(own)], [/\bwheel\b|\btour\b/i, (k, own) => k === 'classes' && /wheel/i.test(own)],
  [/toddler|tout-petits/i, (k, own) => k === 'kids' && /toddler/i.test(own)], [/\bplayer\b|\bjoueur\b/i, (k) => k === 'escape'],
  [/\bshow\b|spectacle/i, () => false], [/\bworkshop\b|\batelier\b/i, () => false], [/learn to curl|initiation/i, (k, own) => k === 'curling' && /learn to curl/i.test(own)],
];
const UNIT_RE = { room: /^One room$|^Une salle$/, lane: /^One lane$|^Une allée$/, game: /^One game$|^Une partie$/, group: /^One group$|^Un groupe$/ };
test('G1. The price typer: for EVERY kind and EVERY price unit (per person, per room / lane / game / group, free, by donation) the first line is a true name for that unit; a kind-specific example word only when the place\'s own words say it (EN + FR)', async () => {
  const bad = [];
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    for (const own of ['A local place in Kelowna.', 'Trampolines, a jump zone, a massage room, VR games, a pottery wheel, a toddler area and learn to curl nights.']) {
      for (const unit of ['person', 'room', 'lane', 'game', 'group', 'free', 'donation']) {
        const v = mk({ name: `G1 ${k} ${unit} ${n + 1}`, description: own });
        const t = tokenFor(v.id);
        const info = { kinds: [k], length: '1-2h', age: 'all', year: 'all', ...(UNIT_RE[unit] ? { per: unit } : {}) };
        await ok(change(t, { indoor_info: info, indoor_price: unit === 'free' ? 'free' : unit === 'donation' ? 'donation' : 22 }));
        for (const lang of ['en', 'fr']) {
          const m = await menuCfg(t, lang);
          const ph = (/"namePh":"([^"]*)"/.exec(m.html) || [])[1] || '';
          const where = `${k} ${unit} ${lang} own=${own.slice(0, 12)}`;
          if (!ph) bad.push(`${where}: no example`);
          if (unit === 'free' || unit === 'donation') { if (m.first) bad.push(`${where}: a first line with no price (${m.first})`); }
          else if (!m.first) bad.push(`${where}: no first line`);
          else if (UNIT_RE[unit] && !UNIT_RE[unit].test(m.first)) bad.push(`${where}: ${m.first}`);
          else if (unit === 'person' && /\b(?:rooms?|salles?|groups?|groupes?|lanes?|allées?|private|privée?|party|parties|fêtes?)\b/i.test(m.first)) bad.push(`${where}: a unit word in ${m.first}`);
          for (const text of unit === 'person' ? [m.first, ph] : [ph]) for (const [re, okFor] of FOREIGN) if (re.test(text || '') && !okFor(k, own) && !(UNIT_RE[unit] && unit !== 'person')) bad.push(`${where}: "${text}" says ${re}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
  // Megan: a climbing gym's first line is "Day pass" (« Laissez-passer d’un jour »); a trampoline park's is the jump pass.
  const g = mk({ name: 'Gneiss T17 Typer', description: 'A bouldering-focused climbing gym with regularly reset problems and training areas.' });
  const tg = tokenFor(g.id);
  await ok(change(tg, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 22 }));
  assert.deepEqual([(await menuCfg(tg)).first, (await menuCfg(tg)).price], ['Day pass', '22']);
  assert.equal((await menuCfg(tg, 'fr')).first, 'Laissez-passer d’un jour');
  const j = mk({ name: 'Bounce T17', description: 'An indoor trampoline park with a dodgeball court.' });
  const tj = tokenFor(j.id);
  await ok(change(tj, { indoor_info: { kinds: ['climbing'], length: '1-2h', age: 'all', year: 'all' }, indoor_price: 22 }));
  assert.equal((await menuCfg(tj)).first, '60-min jump pass');
});

// G2. Research's Groups and Good to know lines, as research left them on Megan's real listing.
const RES_GROUPS = 'Kids birthday parties: 1.5 hours, up to 16 kids, private mezzanine room and a staff climbing coach.';
const RES_GTK = 'Wednesday is route-setting day at OG Banks: opens at 2:30 PM. Chalk and shoes for rent at the front desk; bring water.';
const HER_GROUPS = 'Weekend kids birthday parties (1.5 hrs, up to 16 kids). Team building events. Youth climbing teams.';
const HER_GTK = 'Waiver to sign before you climb: sign it online first. Kids under 14 need an adult on the mats. Free lockers by the front desk. Grip socks for the kids zone. Bring a water bottle. Chalk bags for sale. Youth team practice Tuesday and Thursday evenings.';
const withResearch = (o = {}) => {
  const v = mk({ name: `Gneiss T17 Research ${n + 1}`, description: 'A bouldering-focused climbing gym with regularly reset problems and training areas.', great_groups: 1, kid_friendly: 1, ...o });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Known for', text: 'Bouldering gym with walls up to 15 ft.' }, { label: 'Groups', text: RES_GROUPS }, { label: 'Good to know', text: RES_GTK }], source_url: 'https://example.com', checked_at: '2026-10-31' }));
  return v;
};
const lineOf = (id, label) => { const i = rowsOf(id); const r = (i.rows || []).concat(i.owner_dropped || []).find((x) => x.label === label); return r ? r.text : ''; };
const sentences = (x) => String(x).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
test('G2. Groups and Good to know: over the limit, research\'s words are trimmed first and the owner\'s typed words and taps are never cut, on every path (typing after research, a chip tap, a size tap, typing after chips); her own words alone over the limit keep the whole sentences that fit and say so', async () => {
  for (const [hash, box, save, key, label, her, max] of [['groups', 'suGroupsLine', 'brewGroupsSave', 'groups', 'Groups', HER_GROUPS, 180], ['bring', 'suBring', 'bringSave', 'good_to_know', 'Good to know', HER_GTK, 320]]) {
    // Path 1: typing after research's line (her words added at the end of the box).
    {
      const v = withResearch(); const t = tokenFor(v.id);
      await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
      const s = await openSetup(base, t, { hash });
      const b = s.doc.getElementById(box);
      assert.ok(b, `${hash}: ${s.acts().join(' | ')}`);
      assert.ok(String(b.value).includes(sentences(label === 'Groups' ? RES_GROUPS : RES_GTK)[0].replace(/\.$/, '')), `${hash}: the box starts with research: ${b.value}`);
      await s.type(box, `${b.value.trim()} ${her}`);
      await s.click(save);
      const got = lineOf(v.id, label);
      for (const x of sentences(her)) assert.ok(got.includes(x.replace(/\.$/, '')), `${hash} typed: her "${x}" kept in "${got}"`);
      assert.ok(got.length <= max, got);
    }
    // Path 2: a chip tap after research, then her words.
    {
      const v = withResearch(); const t = tokenFor(v.id);
      await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
      const s = await openSetup(base, t, { hash });
      const chip = s.doc.getElementById('suScreen').querySelectorAll('[data-quick]').find((c) => c.getAttribute('data-box') === box && c.getAttribute('aria-pressed') !== 'true');
      assert.ok(chip, `${hash}: a chip`);
      await s.click(`[data-quick="${chip.getAttribute('data-quick')}"]`);
      const tapped = chip.getAttribute('data-quick');
      await s.type(box, `${s.doc.getElementById(box).value.trim()} ${her}`);
      await s.click(save);
      const got = lineOf(v.id, label);
      assert.ok(got.includes(tapped.replace(/\.$/, '')), `${hash} chip: her tap "${tapped}" kept in "${got}"`);
      for (const x of sentences(her)) assert.ok(got.includes(x.replace(/\.$/, '')), `${hash} chip: her "${x}" kept in "${got}"`);
    }
    // Path 3 (Groups): a size tap after research, then her words.
    if (hash === 'groups') {
      const v = withResearch(); const t = tokenFor(v.id);
      await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
      const s = await openSetup(base, t, { hash });
      await s.click('[data-bgroup="10"]');
      await s.type(box, `${s.doc.getElementById(box).value.trim()} ${her}`);
      await s.click(save);
      const got = lineOf(v.id, label);
      assert.match(got, /Groups of 10 or more: please book ahead/);
      for (const x of sentences(her)) assert.ok(got.includes(x.replace(/\.$/, '')), `size: her "${x}" kept in "${got}"`);
    }
    // Path 4: no research, her chips then her words, over the limit on her own: the whole sentences that fit, and a message.
    {
      const v = mk({ name: `Gneiss T17 Own ${n + 1}`, great_groups: 1 }); const t = tokenFor(v.id);
      await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
      const s = await openSetup(base, t, { hash });
      const long = `${her} ${her.replace(/\.$/, '')} again on Sundays.`;
      await s.type(box, long);
      await s.click(save);
      const shown = s.doc.getElementById(box) ? s.doc.getElementById(box).value : '';
      assert.ok(shown.length <= max && shown.length > 0, shown);
      assert.ok(/[.!?]$/.test(shown.trim()), `whole sentences: ${shown}`);
      assert.ok(long.startsWith(shown.trim().replace(/[.!?]$/, '')), shown);
      assert.match(s.text(), /\d+|characters|caract/, 'it says so');
      await s.click(save);
      assert.equal(lineOf(v.id, label), shown.trim());
    }
  }
});

// Megan's gym as she left it: climbing, walk-ins, All ages, a day pass, her Good to know with the under-14 rule, her waiver
// link and her hours; closed on Christmas Day.
const meganGym = async (o = {}) => {
  const v = withResearch({ name: `Gneiss Climbing T17 ${n + 1}`, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 22 }));
  await ok(change(t, { hours: MEGAN }));
  await ok(change(t, { visit_rows: { good_to_know: 'Waiver to sign before you climb. Kids under 14 need an adult on the mats.' } }));
  await ok(change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }] }));
  return { v, t };
};

test('1. Kind label: a bouldering-only gym is "Climbing gym" (« Salle d’escalade ») on its card, page, setup and every plan; a trampoline park is "Trampoline park"; both say both; spa and pool labels show only the parts their words say', async () => {
  const { v, t } = await meganGym();
  assert.equal(app.getVenue(v.id).cuisine, 'Climbing gym');
  assert.match(plain(page(v, 'fr')), /Salle d’escalade/);
  assert.doesNotMatch(plain(page(v)), /Climbing & trampoline/);
  const s = await openSetup(base, t, { hash: 'more' });
  assert.equal(s.cfg.indoorKindWords.climbing, 'Climbing gym');
  const sf = await openSetup(base, t, { hash: 'more', lang: 'fr' });
  assert.equal(sf.cfg.indoorKindWords.climbing, 'Salle d’escalade');
  for (const q of ['climbing gym in Kelowna', 'rainy day with a 10 year old in Kelowna', 'kids birthday party Kelowna Saturday', 'team building Kelowna']) {
    const stop = itemsOf(app.runTripPlan({ text: q }, NOW)).find((x) => x.venue.id === v.id);
    if (stop) { assert.equal(stop.venue.typeLabel, 'Climbing gym', q); assert.equal(stop.venue.typeLabelFr, 'Salle d’escalade', q); }
  }
  const tr = mk({ name: 'Bounce Park T17', description: 'An indoor trampoline park with a dodgeball court.' });
  await ok(change(tokenFor(tr.id), { indoor_info: { kinds: ['climbing'], length: '1-2h', age: 'all', year: 'all' } }));
  assert.equal(app.getVenue(tr.id).cuisine, 'Trampoline park');
  const both = mk({ name: 'Rock & Bounce T17', description: 'A climbing gym with bouldering and a trampoline park.' });
  await ok(change(tokenFor(both.id), { indoor_info: { kinds: ['climbing'], length: '1-2h', age: 'all', year: 'all' } }));
  assert.equal(app.getVenue(both.id).cuisine, 'Climbing & trampoline');
  // Every multi-part label: only the parts its words say.
  for (const [kind, desc, want] of [['spa', 'A day spa with massage and facials.', 'Spa'], ['spa', 'A floating sauna on the lake.', 'Sauna'], ['spa', 'A spa with massage and a sauna.', 'Spa & sauna'],
    ['pool', 'An indoor swimming pool with lane swim.', 'Swimming pool'], ['pool', 'A rec centre with a pool and a gym.', 'Pool & rec centre']]) {
    const x = mk({ name: `Label T17 ${n + 1}`, description: desc });
    await ok(change(tokenFor(x.id), { indoor_info: { kinds: [kind], length: '1-2h', age: 'all', year: 'all' } }));
    assert.equal(app.getVenue(x.id).cuisine, want, desc);
  }
});

test('3. Search with a holiday ("climbing christmas day kelowna", « escalade noël kelowna »): the places are listed, hers saying "Closed Dec 25", never "No places match"', async () => {
  const { v } = await meganGym({ name: 'Gneiss T17 Holiday' });
  const other = mk({ name: 'Crux Climbing Gym T17', description: 'Full-service indoor climbing gym with bouldering.', hours: JSON.stringify(DAY('12:00', '22:00')) });
  const h = await getText(`/search?q=${encodeURIComponent('climbing christmas day kelowna')}`);
  assert.doesNotMatch(plain(h), /No places match/);
  const cardOf = (html, name) => { const i = html.indexOf(`data-venue-name="${name}"`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('</li>', i)); };
  assert.match(cardOf(h, v.name), /data-fd-day="1">Closed Dec 25</);
  assert.match(cardOf(h, other.name), /data-fd-day="1">Dec 25 · 12 PM–10 PM \(usual Friday hours\)</);
  assert.ok(h.indexOf(`data-venue-name="${other.name}"`) < h.indexOf(`data-venue-name="${v.name}"`), 'open that day first');
  const fr = await getText(`/fr/search?q=${encodeURIComponent('escalade noël kelowna')}`);
  assert.match(cardOf(fr, v.name), /Fermé le 25 déc\./);
  // A weekday still reads as before; no holiday: no day line.
  assert.match(await getText(`/search?q=${encodeURIComponent('climbing monday kelowna')}`), /Open Mondays/);
  assert.doesNotMatch(await getText(`/search?q=${encodeURIComponent('climbing kelowna')}`), /data-fd-day="1"/);
});

test('4. Polish: the waiver chip says the kind\'s verb (climb, jump, play); a walk-in place\'s card is "Before you go"; a day plan has one place of each kind unless asked; the booking screen says what the page\'s button will say for the link in the box', async () => {
  const { v, t } = await meganGym({ name: 'Gneiss T17 Polish' });
  const g = await openSetup(base, t, { hash: 'bring' });
  const chips = g.doc.getElementById('suScreen').querySelectorAll('[data-quick]').map((c) => c.getAttribute('data-quick'));
  assert.ok(chips.includes('Waiver to sign before you climb'), chips.join(' | '));
  assert.ok(!chips.some((c) => /before you play/.test(c)));
  const gf = await openSetup(base, t, { hash: 'bring', lang: 'fr' });
  assert.ok(gf.doc.getElementById('suScreen').querySelectorAll('[data-quick]').some((c) => c.getAttribute('data-quick') === 'Décharge à signer avant de grimper'));
  const IKw = IK.indoorWaiverVerb;
  assert.deepEqual(IKw(['climbing'], 'An indoor trampoline park.'), ['jump', 'sauter']);
  assert.deepEqual(IKw(['kids'], ''), ['play', 'jouer']);
  // Before you go: walk-ins welcome, with a waiver link as her button.
  await ok(change(t, { booking_url: 'https://smartwaiver.example.com/portal/sw/gneiss' }));
  approveAll(v.id);
  const en = page(v);
  assert.match(en, /<p class="gb-eyebrow">Walk-ins welcome<\/p><h2>Before you go<\/h2>/);
  assert.doesNotMatch(en, /Book your visit/);
  assert.match(plain(en), /Sign the waiver/);
  // A place that books ahead keeps "Book your visit".
  const e2 = mk({ name: 'Escape T17 Ahead', description: 'Three escape rooms.' });
  const te = tokenFor(e2.id);
  await ok(change(te, { indoor_info: { kinds: ['escape'], length: '1-2h', book: 'ahead', age: 'all', year: 'all' } }));
  await ok(change(te, { booking_url: 'https://example.com/book' }));
  approveAll(e2.id);
  assert.match(page(e2), /<h2>Book your visit<\/h2>/);
  // The booking screen: what the button says for the link (her waiver link stays "Sign the waiver").
  const b = await openSetup(base, t, { hash: 'booking' });
  assert.match(b.doc.getElementById('suBookShows').textContent, /Your page’s button: Sign the waiver/);
  await b.type('suBookUrl', 'https://gneiss.example.com/birthday-parties');
  assert.match(b.doc.getElementById('suBookShows').textContent, /Your page’s button: Book a party/);
  await b.type('suBookUrl', 'https://gneiss.example.com/visit');
  assert.match(b.doc.getElementById('suBookShows').textContent, /Your page’s button: Book a visit/);
  // One climbing gym a day (her kids' birthday day planned two); "two escape rooms" keeps two.
  for (const nm of ['Crux Gym T17 A', 'Boulder Barn T17 B']) {
    const c = mk({ name: nm, region: 'peachland', latitude: 49.77, longitude: -119.74, description: 'An indoor climbing gym with bouldering.', kid_friendly: 1, great_groups: 1 });
    await ok(change(tokenFor(c.id), { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
  }
  for (const nm of ['Peach Burgers T17', 'Lakeside Pizza T17']) mk({ name: nm, region: 'peachland', type: 'restaurant', cuisine: 'Pizza', latitude: 49.771, longitude: -119.74, description: 'Pizza and burgers for families.', kid_friendly: 1 });
  const day = app.runTripPlan({ text: 'kids birthday party in Peachland Saturday' }, NOW);
  const gyms = (day.days || []).flatMap((d) => d.stops || []).filter((x) => x.venue && x.venue.type === 'indoor');
  const kindsOfDay = gyms.map((x) => x.venue.typeLabel);
  assert.equal(new Set(kindsOfDay).size, kindsOfDay.length, kindsOfDay.join(' | '));
});

// Her real listing: six research rows, so her answers fill the box and research's Groups and Good to know lines are set
// aside (owner_dropped) and offered back in her boxes (groupsFound, gtkFound).
test('G2 + G3 with a full box (her real listing): research\'s Groups line offered back in her box is trimmed first when she adds her words; its "Wednesday … opens at 2:30 PM" line is asked about and flagged, never pre-filled as hers', async () => {
  const v = mk({ name: 'Gneiss Full Box T17', description: 'A bouldering-focused climbing gym with regularly reset problems and training areas.', great_groups: 1, kid_friendly: 1 });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [
    { label: 'Known for', text: 'Bouldering gym with walls up to 15 ft, a kids zone with auto belays and speed tracks, and a training area.' },
    { label: 'Prices', text: 'Adult day pass $20, youth (11 to 17) $16, kids (3 to 10) $11.50. Shoes $5. Plus tax.' },
    { label: 'Booking', text: 'Drop in for climbing; sign the online waiver first.' },
    { label: 'Ages', text: 'Kids area with auto belays for ages 3 and up.' },
    { label: 'Groups', text: RES_GROUPS },
    { label: 'Good to know', text: 'Wednesday is route-setting day at OG Banks: opens at 2:30 PM.' }], source_url: 'https://example.com', checked_at: '2026-10-31' }));
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 22 }));
  await ok(change(t, { hours: MEGAN }));
  const stale = app.indoorStaleResearch(app.getVenue(v.id), NOW).map((x) => x.text);
  assert.ok(stale.includes('Wednesday is route-setting day at OG Banks: opens at 2:30 PM.'), stale.join(' | '));
  const m = await openSetup(base, t, { hash: 'more' });
  assert.match(m.text(), /We also had: “Wednesday is route-setting day at OG Banks: opens at 2:30 PM\.” Still right\?/);
  const b = await openSetup(base, t, { hash: 'bring' });
  assert.doesNotMatch(b.doc.getElementById('suBring').value, /route-setting/);
  assert.ok(b.has('#suBringClash'), 'flagged as found online');
  const g = await openSetup(base, t, { hash: 'groups' });
  const box = g.doc.getElementById('suGroupsLine');
  assert.equal(box.value.trim(), RES_GROUPS);
  await g.type('suGroupsLine', `${box.value.trim()} ${HER_GROUPS}`);
  await g.click('brewGroupsSave');
  assert.equal(lineOf(v.id, 'Groups'), HER_GROUPS);
});
