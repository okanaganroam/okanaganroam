#!/usr/bin/env node
'use strict';
// "See live prices" (2026-11-20): which places to stay the Stay22 Maps embed can open on, for review before it shows.
//
// Why: the box's "See live prices" button opens Stay22's map around the stay (stay-booking-links.js stay22MapUrl: the
// town, a small box around the stay and a star pin with its name). Stay22 can limit the map to one hotel only with
// onlyhcids=<Booking.com hotel id>, and we do not have those ids: Booking.com's hotel pages answer a plain request with a
// bot check (we never get past those), and Stay22's own hotel lookup is its Direct Travel API, which needs an API key.
// Stay22 answers "404 - Stay22.com" for some places it can't find (seen 2026-11-20 for many exact coordinates and street
// addresses, whatever aid is used); the button must never open that page, so only the stays checked here as loading
// show it. This checks the exact URL the button uses, without dates.
//
// Usage (read-only: GET requests to stay22.com, one every 1.5 s; writes only the output file, never the database):
//   node scripts/stay22-map-check.js <stays.json> [--out data/stay22-maps.json] [--aid <id>]
//   stays.json: [{ "id": 1994, "name": "...", "regionLabel": "Kelowna", "latitude": 49.89, "longitude": -119.49 }, ...]
// Then review the file and commit it; the server reads data/stay22-maps.json at start.

const fs = require('fs');
const { stay22MapUrl } = require('../stay-booking-links');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input) { console.error('Usage: node scripts/stay22-map-check.js <stays.json> [--out data/stay22-maps.json] [--aid <id>]'); process.exit(1); }
const out = path.resolve(opt('--out', path.join(__dirname, '..', 'data', 'stay22-maps.json')));
const aid = opt('--aid', process.env.STAY_AFFILIATE_ID || 'demo_affiliate_id');
const UA = 'roam-stay22-map-check/1.0';

const round = (n) => Math.round(Number(n) * 1e6) / 1e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(s) {
  const built = stay22MapUrl(s, null, { env: { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: aid }, checks: { [String(s.id)]: { ok: true } } });
  if (!built) return { status: 0, ok: false, error: 'no url (missing town or location)' };
  const u = built.url;
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const text = await r.text();
    return { status: r.status, ok: r.status === 200 && !/<title>404 - Stay22/i.test(text) };
  } catch (e) { return { status: 0, ok: false, error: e.message }; }
}

(async () => {
  const stays = JSON.parse(fs.readFileSync(input, 'utf8'));
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { stays: {} };
  const result = { checked_at: new Date().toISOString().slice(0, 10), how: 'GET the See live prices URL (stay22MapUrl, no dates); ok = 200 and not the 404 page', stays: { ...(prev.stays || {}) } };
  let n = 0, good = 0;
  for (const s of stays) {
    const lat = round(s.latitude), lng = round(s.longitude);
    if (!Number.isInteger(s.id) || !Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) continue;
    const r = await check({ ...s, latitude: lat, longitude: lng });
    result.stays[String(s.id)] = { name: s.name || null, lat, lng, ok: r.ok, status: r.status };
    n++; if (r.ok) good++;
    process.stdout.write(`${r.ok ? 'ok ' : 'NO '} ${r.status} ${s.id} ${s.name || ''}\n`);
    await sleep(1500);
  }
  fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`Checked ${n}: ${good} load, ${n - good} do not. Wrote ${out}`);
})();
