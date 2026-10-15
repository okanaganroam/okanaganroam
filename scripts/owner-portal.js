#!/usr/bin/env node
// Owner portal admin: make private edit links for venues and review the changes owners send.
//
//   node scripts/owner-portal.js link <venue id> [owner email]     # make a link (shown once)
//   node scripts/owner-portal.js link <venue id> --reset           # replace a lost or leaked link
//   node scripts/owner-portal.js revoke <venue id>                 # turn a link off
//   node scripts/owner-portal.js list [pending|approved|rejected|all]
//   node scripts/owner-portal.js approve <request id> [field,field] # all fields, or only some
//   node scripts/owner-portal.js reject <request id> "reason"
//
// Needs ENRICHMENT_ADMIN_TOKEN in the environment. OKR_BASE_URL overrides the target site.
// Venue ids are in each listing's data (or ask Claude); request ids come from `list`.

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const REVIEWER = process.env.OKR_REVIEWER || 'dayton';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function usage() {
  console.error('Usage: node scripts/owner-portal.js link|revoke|list|approve|reject ... (see the top of this file)');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'okanaganroam-owner-portal/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) {
    console.error(`Failed (HTTP ${res.status}): ${data.error || 'unknown error'}${data.detail ? ` (${data.detail})` : ''}`);
    process.exit(1);
  }
  return data;
}

function weekText(json) {
  if (!json) return '(none)';
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  return DAYS.map((d) => `${d[0].toUpperCase()}${d.slice(1)} ${o[d] && o[d].length ? o[d].map((w) => `${w[0]}-${w[1]}`).join(', ') : 'closed'}`).join(' | ');
}

function valueText(field, value) {
  if (field === 'hours' || field === 'happy_hour') return weekText(value);
  if (value == null || value === '') return '(none)';
  return String(value);
}

function printRequest(r) {
  console.log(`\n#${r.id}  ${r.venue_name}  [${r.status}]  sent ${r.submitted_at}${r.contact_name ? ` by ${r.contact_name}` : ''}`);
  console.log(`    ${r.listing_url}`);
  for (const [field, value] of Object.entries(r.changes)) {
    if (field === 'badges') {
      for (const [b, on] of Object.entries(value)) console.log(`    badge ${b}: ${r.previous.badges[b] ? 'yes' : 'no'} -> ${on ? 'yes' : 'no'}`);
      continue;
    }
    console.log(`    ${field}:`);
    console.log(`      was: ${valueText(field, r.previous[field])}`);
    console.log(`      new: ${valueText(field, value)}`);
  }
  if (r.note) console.log(`    note: ${r.note}`);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) usage();
  if (!TOKEN) {
    console.error('ENRICHMENT_ADMIN_TOKEN is not set. Paste it first with:');
    console.error('  read -s "ENRICHMENT_ADMIN_TOKEN?Paste your admin token and press Enter: "; export ENRICHMENT_ADMIN_TOKEN; echo');
    process.exit(1);
  }
  if (cmd === 'link') {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) usage();
    const email = args.find((a) => a.includes('@'));
    const r = await call('POST', '/admin/owner-links', { venue_id: id, ...(email ? { contact_email: email } : {}), ...(args.includes('--reset') ? { reset: true } : {}) });
    console.log(`${r.replaced ? 'New link (the old one no longer works)' : 'Edit link'} for venue ${id}:\n\n  ${r.url}\n`);
    console.log('Send this to the owner. It is shown only now; if it is lost, run this again with --reset.');
  } else if (cmd === 'revoke') {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) usage();
    const r = await call('POST', '/admin/owner-links/revoke', { venue_id: id });
    console.log(r.revoked ? `Link for venue ${id} turned off.` : `Venue ${id} had no link.`);
  } else if (cmd === 'list') {
    const r = await call('GET', `/admin/owner-changes?status=${encodeURIComponent(args[0] || 'pending')}`);
    if (!r.requests.length) console.log(`No ${r.status} requests.`);
    r.requests.forEach(printRequest);
  } else if (cmd === 'approve') {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) usage();
    const fields = args[1] ? args[1].split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const r = await call('POST', `/admin/owner-changes/${id}/approve`, { reviewer: REVIEWER, ...(fields ? { fields } : {}) });
    console.log(`Approved #${id}: ${r.applied.join(', ')} now live on ${r.listing}`);
  } else if (cmd === 'reject') {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) usage();
    await call('POST', `/admin/owner-changes/${id}/reject`, { reviewer: REVIEWER, reason: args[1] || '' });
    console.log(`Rejected #${id}. Nothing on the listing changed.`);
  } else {
    usage();
  }
})();
