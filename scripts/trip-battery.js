#!/usr/bin/env node
// Build My Trip battery (2026-10-20): ~60 realistic visitor requests, EN and FR, run through runTripPlan() with a fixed
// "now", printed compactly (day / time / stop / venue / town), plus a repetition count across the plans.
//
// Usage:
//   node scripts/trip-battery.js                 # uses ./server.js and its okanagan.db
//   node scripts/trip-battery.js --app <dir>     # another checkout (e.g. a copy with a live-like okanagan.db); if <dir>
//                                                # symlinks the code, run node with --preserve-symlinks
//                                                # --preserve-symlinks-main so its own okanagan.db is used
//   node scripts/trip-battery.js --only ski      # cases whose id or text contains "ski"
//   node scripts/trip-battery.js --json out.json # also write every plan's stops as JSON
//   node scripts/trip-battery.js --quiet         # repetition summary only
//   node scripts/trip-battery.js --live          # POST each request to https://okanaganroam.com/api/trip/plan instead
//                                                # (read-only; the live site uses its own clock, not the fixed one)
//
// Read-only: it never writes to the database. The repetition summary counts, for each place, how many plans use it,
// and for each town how often the same first stop and the same lunch come back.
'use strict';
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const appDir = path.resolve(opt('--app') || path.join(__dirname, '..'));
const only = opt('--only');
const jsonOut = opt('--json');
const quiet = args.includes('--quiet');
const live = args.includes('--live');
process.chdir(appDir);
const app = live ? null : require(path.join(appDir, 'server.js'));
async function plan(text, now) {
  if (!live) return app.runTripPlan({ text }, now);
  const res = await fetch('https://okanaganroam.com/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'okr-trip-battery' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const { t3FrenchPlan } = require(path.join(appDir, 'trip-french-copy.js'));

// Tue Oct 20 2026, 10:00 and 20:30 in the Okanagan (UTC-7 on that date).
const MORNING = new Date('2026-10-20T17:00:00Z');
const EVENING = new Date('2026-10-21T03:30:00Z');

const CASES = [
  // Weekends and days in towns
  ['wk-kelowna', 'a weekend in Kelowna'],
  ['wk-penticton', 'weekend in Penticton'],
  ['wk-vernon', 'a weekend in Vernon'],
  ['wk-osoyoos', 'weekend in Osoyoos'],
  ['wk-westk', 'a weekend in West Kelowna'],
  ['wk-summerland', 'a weekend in Summerland'],
  ['day-kelowna', 'a day in Kelowna'],
  ['day-penticton', 'one day in Penticton'],
  ['day-vernon', 'a day in Vernon'],
  ['day-vernon-sat', 'Saturday in Vernon'],
  ['sat-osoyoos', 'Saturday in Osoyoos'],
  ['3d-kelowna', '3 days in Kelowna'],
  ['3d-penticton', '3 days in Penticton in November'],
  ['2d-vernon-food', '2 days in Vernon with good food and a walk'],
  ['day-peachland', 'a day in Peachland'],
  // Wine
  ['wine-naramata', 'wine tasting day in Naramata'],
  ['wine-oliver', 'a wine day in Oliver'],
  ['wine-westk', 'wine tour in West Kelowna'],
  ['wine-kelowna-dinner', 'wineries in Kelowna then dinner'],
  ['wine-osoyoos-2d', '2 day wine trip in Osoyoos and Oliver'],
  ['wine-summerland', 'Summerland wineries on Saturday'],
  // Family / budget / rain / date
  ['fam-kelowna', 'family day in Kelowna with kids'],
  ['fam-vernon-wk', 'family weekend in Vernon'],
  ['fam-penticton', 'a day in Penticton with my kids'],
  ['budget-kelowna', 'cheap day in Kelowna on a budget'],
  ['budget-penticton', 'budget weekend in Penticton'],
  ['rain-kelowna', 'rainy day in Kelowna'],
  ['rain-vernon', 'rainy day in Vernon'],
  ['rain-penticton', 'something to do in Penticton when it rains'],
  ['date-kelowna', 'date night in Kelowna'],
  ['date-penticton', 'romantic evening in Penticton'],
  ['date-westk', 'date night in West Kelowna on Friday'],
  ['dog-vernon', 'dog-friendly day in Vernon'],
  ['hike-kelowna', 'a hike and lunch in Kelowna'],
  // Ski
  ['ski-bigwhite', 'ski day at Big White on January 16 2027'],
  ['ski-silverstar', 'skiing at SilverStar Jan 9 2027'],
  ['ski-bigwhite-2d', '2 days skiing at Big White January 22-23 2027'],
  ['ski-apex', 'ski day at Apex in January'],
  // Holidays and events
  ['xmas-kelowna', 'Christmas markets in Kelowna Dec 5 2026'],
  ['xmas-penticton', 'Christmas in Penticton Dec 12-13'],
  ['xmas-vernon', 'Christmas markets in Vernon on December 5'],
  ['xmas-westk', 'Christmas market in West Kelowna Nov 28'],
  ['halloween-kelowna', 'Halloween in Kelowna October 31'],
  ['halloween-vernon', 'Halloween weekend in Vernon with kids'],
  ['concert-kelowna', 'dinner and a concert in Kelowna this weekend'],
  ['hockey-kelowna', 'dinner and a hockey game in Kelowna'],
  // Food and drink
  ['cafe-kelowna-dated', 'cafe hopping in Kelowna on October 24'],
  ['cafe-kelowna', 'cafe hopping in Kelowna'],
  ['brewery-penticton', 'brewery crawl in Penticton'],
  ['brewery-vernon', 'brewery crawl in Vernon'],
  ['brunch-kelowna', 'brunch and a walk in Kelowna on Sunday'],
  ['tonight-kelowna', 'tonight in Kelowna', EVENING],
  ['tonight-penticton', 'drinks and dinner tonight in Penticton', EVENING],
  ['afternoon-summerland', 'an afternoon in Summerland', EVENING],
  ['evening-westk-late', 'one evening in West Kelowna', EVENING],
  // Road trips
  ['road-vernon-osoyoos', 'road trip from Vernon to Osoyoos'],
  ['road-kelowna-penticton', 'drive from Kelowna to Penticton with stops'],
  ['road-3d', '3 day road trip from Vernon to Osoyoos'],
  // French
  ['fr-wk-kelowna', 'un week-end à Kelowna', MORNING, true],
  ['fr-ce-soir-penticton', 'ce soir à Penticton', EVENING, true],
  ['fr-vins-oliver', 'une journée vins à Oliver', MORNING, true],
  ['fr-apres-midi-summerland', 'un après-midi à Summerland', MORNING, true],
  ['fr-soiree-westk', 'une soirée à West Kelowna', MORNING, true],
  ['fr-noel-kelowna', 'marchés de Noël à Kelowna le 5 décembre', MORNING, true],
  ['fr-famille-vernon', 'une journée en famille à Vernon', MORNING, true],
  ['fr-ski-bigwhite', 'une journée de ski à Big White le 16 janvier 2027', MORNING, true],
  ['fr-brasseries-penticton', 'tournée des brasseries à Penticton', MORNING, true],
];

const hm = (m) => (Number.isFinite(m) ? `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` : '  ?  ');
const name = (s) => (s.venue ? s.venue.name : s.event ? `EVENT ${s.event.name}` : '(empty)');
const town = (s) => (s.venue ? s.venue.regionLabel || s.venue.region : s.event ? s.event.regionLabel || s.event.region || '' : '');
const kindOf = (s) => (s.venue ? s.venue.type : s.event ? 'event' : '');

function stopsOf(p) {
  const out = [];
  const sched = p.schedule || [];
  const row = (day, s) => sched.find((x) => (x.day == null || x.day === day) && ((s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id)));
  if ((p.days || []).length) {
    for (const d of p.days) for (const s of d.stops || []) { if (!s.venue && !s.event) continue; out.push({ day: d.day, date: d.date || null, region: d.region, s, r: row(d.day, s) }); }
  } else {
    const list = (p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [];
    for (const s of list) { if (!s.venue && !s.event) continue; out.push({ day: 1, date: null, region: s.venue ? s.venue.region : null, s, r: row(1, s) }); }
  }
  return out;
}

(async () => {
const results = [];
for (const [id, text, nowArg, french] of CASES) {
  if (only && !id.includes(only) && !text.includes(only)) continue;
  const now = nowArg || MORNING;
  let p;
  try { p = await plan(text, now); } catch (e) { results.push({ id, text, error: String(e && e.message || e) }); if (!quiet) console.log(`\n## ${id}: ${text}\n  ERROR ${e && e.message}`); continue; }
  const stops = stopsOf(p);
  results.push({ id, text, kind: p.kind, french: !!french, story: (p.story && p.story.text) || (p.experience && p.experience.text) || '', storyFr: (t3FrenchPlan(p).story || {}).text || '', untimed: stopsOf(p).filter((x) => !x.r || !Number.isFinite(x.r.startMinutes)).length, stops: stops.map((x) => ({ day: x.day, region: x.region, daypart: x.s.daypart, label: x.s.label, id: x.s.venue ? x.s.venue.id : null, eventId: x.s.event ? x.s.event.id : null, name: name(x.s), town: town(x.s), type: kindOf(x.s), start: x.r ? x.r.startMinutes : null, end: x.r ? x.r.endMinutes : null })) });
  if (quiet) continue;
  console.log(`\n## ${id}: ${text}${now === EVENING ? '  [20:30]' : ''}`);
  console.log(`  ${p.kind} | ${p.headline || ''} | ${p.summary || ''}`);
  if (p.understood && p.understood.when) console.log(`  when: ${p.understood.when}`);
  let lastDay = null;
  for (const x of stops) {
    if (x.day !== lastDay) { const d = (p.days || []).find((y) => y.day === x.day); console.log(`  D${x.day} ${(x.r && x.r.date) || (d && d.date) || ''} ${d ? d.regionLabel || d.region : ''}`); lastDay = x.day; }
    const t = x.r ? `${hm(x.r.startMinutes)}-${hm(x.r.endMinutes)}` : '     -     ';
    console.log(`    ${t} ${String(x.s.daypart || '').padEnd(9)} ${String(x.s.label || '').slice(0, 22).padEnd(22)} ${name(x.s)} (${kindOf(x.s)}, ${town(x.s)})`);
  }
  if (!stops.length && (p.recommendations || []).length) console.log(`  ideas: ${p.recommendations.slice(0, 6).map((r) => (r.venue ? r.venue.name : r.name)).join(' · ')}`);
  if (!stops.length && (p.events || []).length) console.log(`  events: ${p.events.slice(0, 6).map((e) => e.name).join(' · ')}`);
  const story = (p.story && p.story.text) || (p.experience && p.experience.text);
  if (story) console.log(`  story: ${story.slice(0, 400)}`);
  for (const n of [...(p.warnings || []), ...(p.notes || [])].slice(0, 4)) console.log(`  note: ${String(n).slice(0, 200)}`);
  if (french) {
    const f = t3FrenchPlan(p);
    console.log(`  FR: ${f.headline || ''} | ${((f.story && f.story.text) || (f.experience && f.experience.text) || '').slice(0, 400)}`);
  }
}

// Repetition: plans that use each place, the same first stop / lunch in a town, and repeated 3-stop runs.
const planUses = new Map(), firstByTown = new Map(), lunchByTown = new Map(), runs = new Map();
const bump = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
for (const r of results) {
  if (!r.stops) continue;
  for (const s of r.stops) if (s.id) bump(planUses, `${s.name} (${s.town})`, r.id);
  const days = [...new Set(r.stops.map((s) => s.day))];
  for (const d of days) {
    const ds = r.stops.filter((s) => s.day === d && s.id);
    if (ds[0]) bump(firstByTown, `${ds[0].region} :: ${ds[0].name}`, `${r.id}/D${d}`);
    const lunch = ds.find((s) => s.daypart === 'midday' && ['restaurant', 'cafe', 'pub', 'brewery', 'winery'].includes(s.type));
    if (lunch) bump(lunchByTown, `${lunch.region} :: ${lunch.name}`, `${r.id}/D${d}`);
    for (let i = 0; i + 2 < ds.length; i++) bump(runs, ds.slice(i, i + 3).map((s) => s.name).join(' → '), r.id);
  }
}
const top = (m, n, min = 2) => [...m.entries()].map(([k, v]) => [k, v.size]).filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const plans = results.filter((r) => r.stops && r.stops.length).length;
console.log(`\n==== Repetition across ${plans} plans with stops (${results.length} requests) ====`);
console.log('Places in the most plans:');
for (const [k, c] of top(planUses, 15)) console.log(`  ${String(c).padStart(2)}  ${k}`);
console.log('Same first stop of a day (town :: place):');
for (const [k, c] of top(firstByTown, 8)) console.log(`  ${String(c).padStart(2)}  ${k}`);
console.log('Same lunch (town :: place):');
for (const [k, c] of top(lunchByTown, 8)) console.log(`  ${String(c).padStart(2)}  ${k}`);
console.log('Same 3 stops in a row:');
for (const [k, c] of top(runs, 6)) console.log(`  ${String(c).padStart(2)}  ${k}`);
const all = top(planUses, 1e6, 1).map(([, c]) => c);
console.log(`Distinct places: ${all.length}; places in 4+ plans: ${all.filter((c) => c >= 4).length}; max: ${all[0] || 0}`);
if (jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(results, null, 1));
process.exit(0);
})();
