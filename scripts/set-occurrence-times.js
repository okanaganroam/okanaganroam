#!/usr/bin/env node
// Sets the start and/or end time of stored event dates (occurrences) on a running site through
// PATCH /api/events/:id/occurrences/:occurrenceId (2026-10-19, round 9). Every change is logged with --reason.
//
//   node scripts/set-occurrence-times.js --event 505 --occurrences 814,815,816,817 --start 10:00 --end 11:00 \
//     --reason "Bunnicula 10 am shows run 60 minutes (organiser page)"                          # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/set-occurrence-times.js ... --apply                    # write
//
// Options: --event <id> (required), --occurrences <id,id,...> (required), --start HH:MM, --end HH:MM (at least one),
// --ends-next-day 0|1, --reason "..." (required with --apply), --batch <id> (default set-occurrence-times-<date>).
// The dry run reads the event's public dates and prints what would change; it writes nothing. Before writing, the
// current times of the dates it changes are saved to occurrence-times-backup-<time>.json in the current folder.
// OKR_BASE_URL overrides the target site.

const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') { out.apply = true; continue; }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Unknown argument: ${a}`);
    const value = m[2] !== undefined ? m[2] : argv[++i];
    if (value === undefined) throw new Error(`--${m[1]} needs a value`);
    out[m[1]] = value;
  }
  return out;
}

function plan(args) {
  const eventId = Number(args.event);
  if (!Number.isInteger(eventId) || eventId < 1) throw new Error('--event must be an event id');
  const occIds = String(args.occurrences || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  if (!occIds.length || occIds.some((n) => !Number.isInteger(n) || n < 1)) throw new Error('--occurrences must be a comma-separated list of ids');
  const times = {};
  if (args.start !== undefined) { if (!TIME_RE.test(args.start)) throw new Error('--start must be HH:MM (24 h)'); times.start_time = args.start; }
  if (args.end !== undefined) { if (!TIME_RE.test(args.end)) throw new Error('--end must be HH:MM (24 h)'); times.end_time = args.end; }
  if (args['ends-next-day'] !== undefined) {
    if (!['0', '1'].includes(args['ends-next-day'])) throw new Error('--ends-next-day must be 0 or 1');
    times.ends_next_day = Number(args['ends-next-day']);
  }
  if (!Object.keys(times).length) throw new Error('give --start and/or --end');
  return { eventId, occIds, times };
}

async function main() {
  let args, p;
  try { args = parseArgs(process.argv.slice(2)); p = plan(args); } catch (e) {
    console.error(e.message);
    console.error('Usage: node scripts/set-occurrence-times.js --event <id> --occurrences <id,...> [--start HH:MM] [--end HH:MM] --reason "..." [--apply]');
    process.exit(1);
  }
  if (args.apply && !TOKEN) { console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.'); process.exit(1); }
  if (args.apply && !(args.reason && args.reason.trim())) { console.error('--reason is required with --apply.'); process.exit(1); }

  const res = await fetch(`${BASE}/api/events/${p.eventId}/occurrences`, { headers: UA });
  if (!res.ok) { console.error(`GET event ${p.eventId} dates: ${res.status}`); process.exit(1); }
  const live = (await res.json()).occurrences || [];
  const byId = new Map(live.map((o) => [o.id, o]));
  const ready = [];
  for (const id of p.occIds) {
    const o = byId.get(id);
    if (!o) { console.log(`skip ${id}: not a listed date of event ${p.eventId}`); continue; }
    const want = { start_time: o.startTime, end_time: o.endTime, ends_next_day: o.endsNextDay, ...p.times };
    const same = want.start_time === o.startTime && want.end_time === o.endTime && want.ends_next_day === o.endsNextDay;
    console.log(`${same ? 'done' : 'change'} ${id} ${o.startDate}: ${o.startTime || '-'}–${o.endTime || '-'} -> ${want.start_time || '-'}–${want.end_time || '-'}`);
    if (!same) ready.push(o);
  }
  console.log(`\n${ready.length} to change.`);
  if (!args.apply) { console.log('Dry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN and --reason) to write.'); return; }
  if (!ready.length) return;
  const backup = path.resolve(`occurrence-times-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify({ event: p.eventId, occurrences: ready }, null, 1));
  console.log(`Backup of the current times: ${backup}`);
  const batch = args.batch || `set-occurrence-times-${new Date().toISOString().slice(0, 10)}`;
  let ok = 0, failed = 0;
  for (const o of ready) {
    const r = await fetch(`${BASE}/api/events/${p.eventId}/occurrences/${o.id}`, {
      method: 'PATCH',
      headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ ...p.times, reason: args.reason.trim(), batch_id: batch }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) { ok++; console.log(`ok ${o.id}: ${body.occurrence ? `${body.occurrence.start_time}–${body.occurrence.end_time}` : ''}`); }
    else { failed++; console.log(`failed ${o.id}: ${r.status} ${body.error || ''} ${body.detail || ''}`); }
  }
  console.log(`\n${ok} changed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { parseArgs, plan };
