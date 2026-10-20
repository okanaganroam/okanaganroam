#!/usr/bin/env node
// Owner photo copies backfill (2026-10-19, round 9). Owner-uploaded photos (/images/owner/<name>.jpg) were only
// stored as their 1600px original, so phones downloaded 180-470 KB per photo. New uploads now send 480, 960 and
// 1200px copies from the browser; this script makes them for the photos uploaded before that.
//
// For each approved owner photo that is missing a copy it downloads the public original, makes the copies with
// macOS's built-in sips (free, nothing to install) and sends them to /admin/owner-photos/<id>/sizes, which stores
// them next to the original on the Railway volume. Pages list a copy only once it exists, so running this is safe at
// any time and running it twice does nothing the second time.
//
// Round 11 (2026-10-20): the server now also lists 160 and 240px copies (the gallery thumbnails), so photos that
// already have their 480/960/1200px copies get just those two small ones on the next run.
//
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/owner-photo-copies.js           # dry run: shows what it would make
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/owner-photo-copies.js --apply   # makes and uploads the copies
//
// Options: --base=https://okanaganroam.com (default), --id=<photo id> (one photo only), --quality=50 (sips JPEG
// quality, 1-100), --replace (send copies again even where one exists, e.g. after changing --quality).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const APPLY = flag('apply');
const REPLACE = flag('replace');
const BASE = String(opt('base', process.env.OKR_BASE || 'https://okanaganroam.com')).replace(/\/+$/, '');
const ONLY_ID = opt('id', null);
const QUALITY = Math.max(1, Math.min(100, Number(opt('quality', 50)) || 50));
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;

function die(msg) { console.error(msg); process.exit(1); }

async function api(pathname, init = {}) {
  const r = await fetch(BASE + pathname, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', ...(init.headers || {}) } });
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body };
}

// width x height of a JPEG file, from sips.
function dims(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return { width: Number((/pixelWidth: (\d+)/.exec(out) || [])[1]) || 0, height: Number((/pixelHeight: (\d+)/.exec(out) || [])[1]) || 0 };
}

async function main() {
  if (!TOKEN) die('Set ENRICHMENT_ADMIN_TOKEN first (Railway > Variables), e.g.\n  ENRICHMENT_ADMIN_TOKEN=... node scripts/owner-photo-copies.js');
  if (process.platform !== 'darwin') die('This script uses macOS sips to resize photos; run it on the Mac.');
  const list = await api('/admin/owner-photos/sizes');
  if (list.status !== 200 || !list.body || !Array.isArray(list.body.photos)) {
    if (list.status === 401) die(`The admin token was not accepted by ${BASE}.`);
    die(`Could not list the owner photos (${list.status}${list.body && list.body.error ? `: ${list.body.error}` : ''}). Is the deploy with /admin/owner-photos/sizes live?`);
  }
  let photos = list.body.photos.filter((p) => p.file_present);
  if (ONLY_ID) photos = photos.filter((p) => String(p.id) === String(ONLY_ID));
  const todo = photos.map((p) => ({ ...p, make: REPLACE ? list.body.sizes.filter((w) => w < (p.width || 0)) : p.needs })).filter((p) => p.make.length);
  const missing = list.body.photos.filter((p) => !p.file_present).length;
  console.log(`${list.body.photos.length} approved owner photos on ${BASE}; ${todo.length} need copies${missing ? ` (${missing} have no file on the volume and are skipped)` : ''}.`);
  if (!todo.length) return;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-owner-copies-'));
  let sent = 0, failed = 0, savedKB = 0, thumbKB = 0;
  try {
    for (const p of todo) {
      const orig = path.join(tmp, p.file);
      const r = await fetch(BASE + p.url);
      if (!r.ok) { console.log(`#${p.id} ${p.url}: download failed (${r.status}), skipped`); failed++; continue; }
      fs.writeFileSync(orig, Buffer.from(await r.arrayBuffer()));
      const d = dims(orig);
      const origKB = Math.round(fs.statSync(orig).size / 1024);
      const body = {};
      const made = [];
      for (const w of p.make) {
        if (w >= d.width) continue;
        const out = path.join(tmp, `${p.file.replace(/\.jpg$/, '')}-w${w}.jpg`);
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY), '--resampleWidth', String(w), orig, '--out', out], { stdio: 'ignore' });
        const kb = Math.round(fs.statSync(out).size / 1024);
        body[`w${w}`] = `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
        made.push(`${w}px ${kb} KB`);
        if (w === 960) savedKB += origKB - kb;
        if (w === 240) thumbKB += kb;
      }
      if (!made.length) continue;
      if (!APPLY) { console.log(`#${p.id} venue ${p.venue_id} ${p.file} (${d.width}x${d.height}, ${origKB} KB): would send ${made.join(', ')}`); continue; }
      if (REPLACE) body.replace = true;
      const res = await api(`/admin/owner-photos/${p.id}/sizes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 200) { sent++; console.log(`#${p.id} ${p.file}: sent ${made.join(', ')}; now has ${(res.body.has || []).join(', ')}`); }
      else { failed++; console.log(`#${p.id} ${p.file}: ${res.status} ${JSON.stringify(res.body)}`); }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!APPLY) console.log(`Dry run: nothing was sent.${savedKB ? ` Phones would save about ${savedKB} KB in total on the venue photos.` : ''}${thumbKB ? ` The 240px thumbnails come to ${thumbKB} KB in all.` : ''} Run again with --apply to upload.`);
  else console.log(`Done: ${sent} photos updated, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => die(err && err.stack ? err.stack : String(err)));
