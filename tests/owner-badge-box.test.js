// "Show visitors you're on Okanagan Roam" (2026-11-20): the portal home has a small card with the badge, the code to
// paste (the venue's absolute public page, no tracking tags) and a Copy button; the French portal says it in French.
// The portal stays noindex. Runs on a throwaway database; restore okanagan.db afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-badge-box-admin-token';
const app = require('../server.js');
const siteEvents = require('../site-events.js');

const v = app.createVenue({ name: 'Badge Bistro & Bar', slug: 'badge-bistro', region: 'kelowna', type: 'restaurant', latitude: 49.886, longitude: -119.49,
  rating: 4.4, address: '10 Test St', phone: '250-555-0101', description: 'A fixture used only by the portal badge test.', image_url: '/images/venues/15-park-bistro-2610.jpg' });
const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ html: await r.text(), robots: r.headers.get('x-robots-tag') || '' }));
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#58;/g, ':').replace(/&amp;/g, '&');

test('portal home: badge card with the venue\'s absolute page URL, the badge image and a Copy button; still noindex', async () => {
  const { html } = await get(`/owner/${token}`);
  assert.match(html, /<meta name="robots" content="noindex/i, 'portal stays noindex');
  assert.match(html, /<section class="op-badge" id="opBadge" data-task="home all"/);
  assert.match(html, /Show visitors you’re on Okanagan Roam/);
  assert.match(html, /<img src="\/badges\/featured-on-okanagan-roam\.svg"/, 'preview of the badge');
  const ta = html.match(/<textarea id="opBadgeCode" readonly[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(ta, 'read-only code box');
  const code = decode(ta[1]);
  assert.equal(code, '<a href="https://okanaganroam.com/kelowna/restaurants/badge-bistro" target="_blank" rel="noopener" title="Badge Bistro &amp; Bar on Okanagan Roam"><img src="https://okanaganroam.com/badges/featured-on-okanagan-roam.svg" alt="Featured on Okanagan Roam" width="240" height="72" style="border:0"></a>');
  assert.doesNotMatch(code, /utm_/);
  assert.match(html, /<button type="button" class="op-btn" id="opBadgeCopy"[^>]*>Copy code<\/button>/);
  assert.match(html, /navigator\.clipboard/);
  assert.match(html, /Paste it in your website footer or your happy hour page; it links to your page here\./);
});

test('French portal: the same card in French, with the same code', async () => {
  const { html } = await get(`/fr/owner/${token}`);
  assert.match(html, /<meta name="robots" content="noindex/i);
  assert.match(html, /Montrez à vos visiteurs que vous êtes sur Okanagan Roam/);
  assert.match(html, />Copier le code<\/button>/);
  assert.match(html, /Collez-le dans le pied de page de votre site Web ou sur votre page 5 à 7/);
  const code = decode(html.match(/<textarea id="opBadgeCode" readonly[^>]*>([\s\S]*?)<\/textarea>/)[1]);
  assert.match(code, /^<a href="https:\/\/okanaganroam\.com\/kelowna\/restaurants\/badge-bistro" /);
  assert.doesNotMatch(html, /Show visitors you’re on Okanagan Roam/);
});

test('"badge code copied" is a known portal event name', () => {
  assert.ok(siteEvents.EVENTS.has('portal_badge_copy'));
});
