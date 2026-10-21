#!/usr/bin/env node
// Runs the weekly enrichment audit (weekly-audit.js) and saves the report.
//
//   AUDIT_READ_TOKEN=... node scripts/weekly-audit.js                       # asks the live site (GET /admin/audit)
//   node scripts/weekly-audit.js --db path/to/okanagan.db                   # reads a database file directly, read-only
//
//   --out <folder>   where the report goes (default drafts/weekly-audit)
//   --date YYYY-MM-DD  the date to audit as (default: today in Pacific time); with --db only
//
// It writes <out>/<date>.json (everything, for the research step) and <out>/<date>.md (the report) and prints the
// "needs attention" list. Read-only: it never writes to the site or the database. OKR_BASE_URL overrides the site.
// The token is only sent to the site and is never printed or saved.

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const outDir = path.resolve(flag('--out') || 'drafts/weekly-audit');
const dbPath = flag('--db');
const pacificToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function load() {
  if (dbPath) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.resolve(dbPath), { readOnly: true });
    return require('../weekly-audit').buildAudit(db, { today: flag('--date') || pacificToday() });
  }
  const token = process.env.AUDIT_READ_TOKEN || process.env.ENRICHMENT_ADMIN_TOKEN;
  if (!token) throw new Error('Set AUDIT_READ_TOKEN (or use --db <file> to read a database directly).');
  const res = await fetch(`${BASE}/admin/audit`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'okanaganroam-audit/1.0' } });
  if (res.status === 401) throw new Error('The site refused the token (401).');
  if (res.status === 503) throw new Error('The site has no AUDIT_READ_TOKEN set (503): add it in the hosting variables first.');
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  return res.json();
}

(async () => {
  const audit = await load();
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, audit.generated_for);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(`${base}.md`, require('../weekly-audit').renderAuditMarkdown(audit));
  console.log(`Weekly audit for ${audit.generated_for}: ${audit.summary.items} things need attention`);
  for (const line of audit.summary.lines) console.log(`  - ${line}`);
  console.log(`Saved ${path.relative(process.cwd(), `${base}.md`)} and ${path.relative(process.cwd(), `${base}.json`)}`);
})().catch((err) => {
  console.error(`Audit failed: ${err.message}`);
  process.exit(2);
});
