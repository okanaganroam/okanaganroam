#!/usr/bin/env node
// Checks that every clickable link on every winery (or, with --category, Outdoors / Sports) page goes where its words say. Read-only: it only fetches pages.
//
//   node scripts/check-winery-links.js                       # https://okanaganroam.com, internal links only
//   node scripts/check-winery-links.js --external            # also opens each outside link (needs network access to winery sites)
//   node scripts/check-winery-links.js --category outdoors   # the Outdoors pages (or: sports); the default is wineries
//   node scripts/check-winery-links.js http://localhost:3001 --limit 20
//
// Finds the winery pages from /sitemap.xml, then for each page's own content (not the site header or footer):
//   - in-page jumps (#...) land on an element that exists;
//   - links to other pages on the site load (200) and, for a venue link, the page's heading is the name the link shows;
//   - the Website button is the winery's own address (the page's structured data "sameAs"), the Call button is its phone;
//   - outside links (Book, Menu, Instagram, ...) load, with --external. A site that blocks robots (403 / 429 / 999) is
//     listed as "could not be checked", not as broken.
// Exit status 1 when anything is broken.

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const EXTERNAL = args.includes('--external');
const LIMIT = Number(flag('--limit')) || Infinity;
const CATEGORY = flag('--category') || 'wineries';
if (!/^[a-z]+$/.test(CATEGORY)) { console.error('--category must be a word like wineries, outdoors or sports'); process.exit(2); }
const UA = { 'User-Agent': 'okanaganroam-link-check/1.0' };
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 15000);
  try { return await fetch(url, { headers: UA, redirect: 'follow', signal: ctl.signal }); } finally { clearTimeout(timer); }
}
async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

(async () => {
  const sitemap = await (await get(BASE + '/sitemap.xml')).text();
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''))
    .filter((p) => new RegExp('^/[a-z-]+/' + CATEGORY + '/[a-z0-9-]+$').test(p)).slice(0, LIMIT);
  if (!pages.length) { console.error('No ' + CATEGORY + ' pages found in ' + BASE + '/sitemap.xml'); process.exit(2); }
  console.log(`Checking ${pages.length} ${CATEGORY} pages on ${BASE}${EXTERNAL ? ' (outside links too)' : ''}`);

  const problems = [], unchecked = [];
  const internalCache = new Map(), externalCache = new Map();
  const internal = (path) => {
    if (!internalCache.has(path)) internalCache.set(path, get(BASE + path).then(async (r) => ({ status: r.status, url: r.url, html: r.ok ? await r.text() : '' })).catch((e) => ({ status: 0, error: String(e.message || e) })));
    return internalCache.get(path);
  };
  const external = (url) => {
    if (!externalCache.has(url)) externalCache.set(url, get(url).then((r) => ({ status: r.status })).catch((e) => ({ status: 0, error: String(e.message || e) })));
    return externalCache.get(url);
  };

  await pool(pages, 6, async (path) => {
    const res = await internal(path);
    if (res.status !== 200) { problems.push(`${path}: the page itself answered ${res.status || res.error}`); return; }
    const html = res.html;
    const start = Math.max(html.indexOf('<div class="fd-layout">'), html.indexOf('<div id="klLayout"'));
    if (start < 0) { problems.push(`${path}: not on the new layout`); return; }
    const body = html.slice(start, html.indexOf('<footer', start) < 0 ? undefined : html.indexOf('<footer', start));
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const sameAs = (/"sameAs":"([^"]+)"/.exec(html) || [])[1] || '';
    const anchors = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: decode((/href="([^"]*)"/.exec(m[1]) || [])[1] || ''), label: text(m[2]) })).filter((a) => a.href);
    const seen = new Set();
    for (const a of anchors) {
      const key = a.href + '|' + a.label;
      if (seen.has(key)) continue; seen.add(key);
      const where = `${path}: "${a.label}" -> ${a.href}`;
      if (a.href.startsWith('#')) { if (!ids.has(a.href.slice(1))) problems.push(where + ' (nothing on the page has that id)'); continue; }
      if (a.href.startsWith('tel:')) { if (!/^tel:\+?[\d\s().-]{7,}$/.test(a.href)) problems.push(where + ' (not a phone number)'); continue; }
      if (a.href.startsWith('mailto:')) continue;
      const isInternal = a.href.startsWith('/') || a.href.startsWith(BASE + '/');
      if (isInternal) {
        const p = a.href.startsWith('/') ? a.href : a.href.slice(BASE.length);
        if (/^\/(map|claim|owner|fr)\b/.test(p) || /^\/(sitemap|robots)/.test(p)) continue;
        const r = await internal(p.replace(/#.*$/, ''));
        if (r.status !== 200) { problems.push(where + ` (answered ${r.status || r.error})`); continue; }
        const venueLink = /^\/[a-z-]+\/[a-z-]+\/[a-z0-9-]+$/.test(p.replace(/[?#].*$/, ''));
        if (venueLink && !/^(More|Explore|See|Show|Back)/.test(a.label)) {
          const h1 = text((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(r.html) || [])[1] || '');
          if (h1 && !a.label.toLowerCase().includes(h1.toLowerCase()) && !h1.toLowerCase().includes(a.label.toLowerCase())) problems.push(where + ` (that page is "${h1}")`);
        }
        continue;
      }
      if (!/^https?:\/\//.test(a.href)) { problems.push(where + ' (not a web address)'); continue; }
      if (/^Website\b|^Visit Website/.test(a.label) && sameAs) {
        const norm = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
        if (norm(a.href) !== norm(sameAs)) problems.push(where + ` (the winery's recorded website is ${sameAs})`);
      }
      if (!/rel="[^"]*noopener/.test(a.attrs)) problems.push(where + ' (outside link without rel="noopener")');
      if (EXTERNAL) {
        const r = await external(a.href);
        if (r.status >= 200 && r.status < 400) continue;
        if ([401, 403, 429, 999].includes(r.status) || r.status === 0) unchecked.push(where + ` (${r.status || r.error})`);
        else problems.push(where + ` (answered ${r.status})`);
      }
    }
  });

  console.log(`\nChecked ${pages.length} ${CATEGORY} pages, ${internalCache.size} on-site addresses${EXTERNAL ? `, ${externalCache.size} outside addresses` : ''}.`);
  if (unchecked.length) console.log(`\nCould not be checked (${unchecked.length}; the site blocks robots or did not answer):\n  ` + unchecked.sort().join('\n  '));
  if (problems.length) { console.log(`\nPROBLEMS (${problems.length}):\n  ` + problems.sort().join('\n  ')); process.exit(1); }
  console.log('\nEvery link checked goes where its words say.');
})().catch((e) => { console.error('Link check failed: ' + (e.message || e)); process.exit(2); });
