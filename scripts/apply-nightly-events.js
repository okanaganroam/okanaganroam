#!/usr/bin/env node
// Applies one evening's reviewed event plan (drafts/nightly-events/<date>.json)
// to the live site. The nightly review writes the plan; Dayton runs this.
//
//   node scripts/apply-nightly-events.js drafts/nightly-events/2026-10-15.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-nightly-events.js <plan.json> --apply
//
// A plan may hold:
//   submissions:        [{ id, action: 'approve'|'reject', venue_id?, type?, source_type?,
//                          reviewed_duplicates?, overrides?, reason?, why }]
//   create:             [{ ...event fields (name, region, occurrences, categories...), reviewed_duplicates?, why }]
//   update:             [{ id, expect: { field: currentValue }, set: { field: newValue }, why }]
//   add_occurrences:    [{ id, occurrences: [...], why }]
//   occurrence_status:  [{ event_id, occurrence_id, expect_status, status, why }]
//
// Every write goes through the site's own event API, so the duplicate gate,
// category and occurrence rules and the change log all apply. Updates are
// compare-and-set: an event is only changed when its live values still match
// `expect`, so nothing edited since the plan was made is overwritten. Before
// the first write, the live state of every event about to change is saved to
// nightly-events-backup-<time>.json in the current folder. OKR_BASE_URL
// overrides the target site.

const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) {
  console.error('Usage: node scripts/apply-nightly-events.js <plan.json> [--apply]');
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };
const REVIEWER = plan.reviewed_by || 'Dayton';
const meta = { reason: plan.reason || `Nightly event review ${plan.date || ''}`.trim(), batch_id: plan.batch_id || `nightly-${plan.date || 'events'}` };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function getEvent(id) {
  const res = await fetch(`${BASE}/api/events/${id}`, { headers: UA });
  return res.ok ? res.json() : null;
}
async function write(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  let out = null;
  try { out = await res.json(); } catch (e) { out = { error: `HTTP ${res.status}` }; }
  return { ok: res.ok, status: res.status, out };
}
const short = (o) => JSON.stringify(o).slice(0, 300);

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const steps = [];
  const backup = [];

  for (const s of plan.submissions || []) {
    if (s.action === 'approve') {
      const body = { reviewer: REVIEWER };
      for (const k of ['venue_id', 'type', 'source_type', 'reviewed_duplicates', 'overrides']) if (s[k] !== undefined) body[k] = s[k];
      steps.push({ label: `approve submission #${s.id}${s.why ? ` (${s.why})` : ''}`, run: () => write('POST', `/admin/event-submissions/${s.id}/approve`, body) });
    } else if (s.action === 'reject') {
      steps.push({ label: `reject submission #${s.id}: ${s.reason || ''}`, run: () => write('POST', `/admin/event-submissions/${s.id}/reject`, { reviewer: REVIEWER, reason: s.reason }) });
    } else {
      console.log(`skip submission #${s.id}: unknown action ${s.action}`);
    }
  }

  for (const c of plan.create || []) {
    const { why, ...data } = c;
    steps.push({ label: `create "${c.name}" (${c.region})${why ? ` -- ${why}` : ''}`, run: () => write('POST', '/api/events', { ...data, ...meta, reviewed_by: REVIEWER }) });
  }

  for (const u of plan.update || []) {
    const live = await getEvent(u.id);
    if (!live) { console.log(`skip update #${u.id}: event not found`); continue; }
    const changed = Object.keys(u.expect || {}).filter((k) => !same(live[k], u.expect[k]));
    if (changed.length) { console.log(`skip update #${u.id} ${live.name}: ${changed.join(', ')} changed since the plan was made`); continue; }
    if (Object.keys(u.set || {}).every((k) => same(live[k], u.set[k]))) { console.log(`done already: update #${u.id} ${live.name}`); continue; }
    backup.push(live);
    steps.push({ label: `update #${u.id} ${live.name}: ${Object.keys(u.set).join(', ')}${u.why ? ` -- ${u.why}` : ''}`, run: () => write('PUT', `/api/events/${u.id}`, { ...u.set, ...meta, reviewed_by: REVIEWER }) });
  }

  for (const a of plan.add_occurrences || []) {
    const live = await getEvent(a.id);
    if (!live) { console.log(`skip add dates #${a.id}: event not found`); continue; }
    backup.push(live);
    steps.push({ label: `add ${a.occurrences.length} date(s) to #${a.id} ${live.name}${a.why ? ` -- ${a.why}` : ''}`, run: () => write('POST', `/api/events/${a.id}/occurrences`, { occurrences: a.occurrences, ...meta, reviewed_by: REVIEWER }) });
  }

  for (const o of plan.occurrence_status || []) {
    const live = await getEvent(o.event_id);
    const occ = live && (live.occurrences || []).find((x) => Number(x.id) === Number(o.occurrence_id));
    if (!occ) { console.log(`skip status #${o.event_id}/${o.occurrence_id}: not found`); continue; }
    if (occ.status === o.status) { console.log(`done already: #${o.event_id} ${live.name} ${occ.startDate} is ${o.status}`); continue; }
    if (o.expect_status && occ.status !== o.expect_status) { console.log(`skip status #${o.event_id}: it is ${occ.status}, plan expected ${o.expect_status}`); continue; }
    backup.push(live);
    steps.push({ label: `mark #${o.event_id} ${live.name} on ${occ.startDate} as ${o.status}${o.why ? ` -- ${o.why}` : ''}`, run: () => write('PATCH', `/api/events/${o.event_id}/occurrences/${o.occurrence_id}`, { status: o.status, ...meta, reviewed_by: REVIEWER }) });
  }

  console.log(`\n${steps.length} change(s) in ${path.basename(fileArg)}:`);
  for (const s of steps) console.log(`  - ${s.label}`);
  if (!APPLY) {
    console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to make these changes.');
    return;
  }
  if (!steps.length) return;
  if (backup.length) {
    const file = path.resolve(`nightly-events-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));
    console.log(`\nBackup of the events about to change: ${file}`);
  }
  let ok = 0, failed = 0;
  for (const s of steps) {
    const r = await s.run();
    if (r.ok) { ok += 1; console.log(`OK     ${s.label}`); }
    else { failed += 1; console.log(`FAILED ${s.label}: ${r.status} ${short(r.out)}`); }
  }
  console.log(`\nDone: ${ok} applied${failed ? `, ${failed} failed (see above)` : ''}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
