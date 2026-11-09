// Owner portal, final fresh-eyes fixes (2026-11-09), restaurants. An unbiased first-time-owner test scored 7/10: things
// sent for review still looked like to-dos until a reload, ticked badges never showed as waiting, some blocks didn't say
// whether they go live, the menu page could trap the owner, and "We don't have…" gave no confirmation where tapped.
// Plus Dayton's rule: a menu link that is just the website doesn't count as a menu. This file covers what can be checked
// without a browser. Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-final-fixes-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const week = JSON.stringify({ mon: [], tue: [['11:30', '21:00']], wed: [['11:30', '21:00']], thu: [['11:30', '21:00']], fri: [['11:30', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Final Fixes ${type} ${++n}`, slug: `final-fixes-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St', phone: '250-555-0142', description: 'A fixture used only by the final fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const post = (token, changes) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const bar = async (token) => (await fetch(`${base}/owner/${token}/completeness`).then((r) => r.json())).html;
const headOf = (h) => h.slice(0, h.indexOf('op-cb-panel'));
const listOf = (html, heading) => { const a = html.indexOf(`>${heading}<`); if (a < 0) return ''; const b = html.indexOf('</ul>', a); return html.slice(a, b); };

test('menu rule (Dayton): a menu link that is just the website does not count; a real menu page or a published menu does', () => {
  assert.equal(pc.sameAddress('https://www.Copper.ca/', 'copper.ca'), true);
  assert.equal(pc.sameAddress('http://copper.ca', 'https://copper.ca//'), true);
  assert.equal(pc.sameAddress('https://copper.ca/menu', 'https://copper.ca'), false);
  assert.equal(pc.sameAddress('', 'copper.ca'), false);
  assert.equal(pc.doneMap({ menuUrl: 'https://www.copper.ca/', website: 'https://copper.ca' }).menu, false);
  assert.equal(pc.doneMap({ menuUrl: 'https://copper.ca/menu', website: 'https://copper.ca' }).menu, true);
  assert.equal(pc.doneMap({ menuUrl: 'https://copper.ca/', website: 'https://copper.ca', hasPublishedMenu: true }).menu, true, 'a published /menu page still counts');
  const r = pc.scoreCompleteness({ menuUrl: 'https://copper.ca/', website: 'https://copper.ca' }, { today });
  const menu = r.missing.find((it) => it.key === 'menu');
  assert.equal(menu.en, 'Link to your menu, or snap a photo of it', 'the item keeps its wording');
  assert.equal(menu.whyEn, 'Your menu link is the same as your website. Add the page your menu is on.');
  assert.match(menu.whyFr, /même que votre site Web/);
  const other = pc.scoreCompleteness({ menuUrl: '', website: 'https://copper.ca' }, { today }).missing.find((it) => it.key === 'menu');
  assert.doesNotMatch(other.whyEn, /same as your website/, 'only venues whose link is the website get that line');
});

test('sent for review shows as waiting straight away: GET .../completeness after a Send moves the item into the Waiting list', async () => {
  const v = mk('restaurant', { hours: week });
  const token = tokenFor(v.id);
  const before = await bar(token);
  assert.ok(!listOf(before, 'Waiting for our check'));
  const r = await post(token, { description: 'A long enough description about our lakeside room, our wood-fired oven and the local wines we pour every night of the week.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = await bar(token);
  assert.match(listOf(after, 'Waiting for our check'), /A description \(120\+ characters\)/);
  assert.match(headOf(after), /1 waiting for our check/);
  assert.doesNotMatch(after.slice(after.indexOf('id="opCbPanel"'), after.indexOf('>Waiting for our check<')), /data-cb-id="opDescription"/, 'not also listed as a to-do');
  // The page script redraws the card after a Send, after Back to the list, and after photos are sent.
  const page = await get(`/owner/${token}`);
  assert.match(page, /setListingDirty\(false\);\s*\/\/ Final fresh-eyes[^\n]*\n\s*if \(window\.opCbRefresh\) window\.opCbRefresh\(''\);/);
  assert.match(page, /refreshPhotos\(\); if \(window\.opCbRefresh\) window\.opCbRefresh\(''\);/);
  assert.match(pc.COMPLETENESS_SCRIPT, /var pk = e\.target\.closest\('\[data-pick\]'\);\s*if \(pk && !pk\.getAttribute\('data-pick'\)\) refresh\(''\);/);
});

test('ticked badges waiting for our check get their own row and count; a dietary badge also moves Dietary options to waiting', async () => {
  const v = mk('restaurant', { hours: week });
  const token = tokenFor(v.id);
  const r = await post(token, { badges: { patio: true, kid_friendly: true, vegetarian: true } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const html = await bar(token);
  const waiting = listOf(html, 'Waiting for our check');
  assert.match(waiting, /Dietary options/);
  assert.match(waiting, /<strong>Badges you ticked<\/strong><span class="op-cb-sent">[^<]*Patio[^<]*&middot; waiting for our check/);
  assert.match(waiting, /Kid/);
  assert.match(headOf(html), /2 waiting for our check/);
  // Pure: names come from the server; an unticked badge says so; nothing pending, no row.
  const s = pc.scoreCompleteness({}, { today });
  assert.match(pc.renderCompleteness(s, { pendingBadges: ['Patio', 'Dog friendly (removed)'] }), /Patio, Dog friendly \(removed\)/);
  assert.doesNotMatch(pc.renderCompleteness(s, {}), /Badges you ticked/);
  assert.match(pc.renderCompleteness(s, { fr: true, pendingBadges: ['Terrasse'] }), /Caractéristiques cochées/);
});

test('every block says whether it goes live now or is checked first (restaurants on the edit link); other types unchanged', async () => {
  const v = mk('restaurant', { hours: week });
  const page = await get(`/owner/${tokenFor(v.id)}`);
  const check = 'Sent to us to check, usually within a day. Press Send changes when you’re done.';
  const at = (id) => { const i = page.search(new RegExp(`<details class="op-fold[^"]*" id="${id}"`)); assert.ok(i > 0, id); return page.slice(i, i + 1500); };
  for (const id of ['hours', 'badges', 'specials', 'weekly-nights']) assert.ok(at(id).includes(check), `${id} says it is checked first`);
  if (page.includes('id="happy"')) assert.ok(at('happy').includes(check), 'happy hour too');
  assert.ok(at('opLinksBox').includes('Checked first, usually within a day. Press Send changes when you’re done.'), 'links are checked first');
  assert.ok(page.slice(page.indexOf('id="opDescriptionLabel"'), page.indexOf('id="opDescription"', page.indexOf('id="opDescriptionLabel"') + 30)).includes(check), 'description');
  assert.ok(at('photos').includes('Sent to us to check, usually within a day.'), 'photos');
  assert.ok(page.includes('Saves now and goes live'), 'cuisine and Plan your visit keep theirs');
  assert.match(page, /<label for="opName">Your name \(optional\)<\/label>/);
  const pub = await get(`/owner/${tokenFor(mk('pub', { hours: week }).id)}`);
  assert.ok(!pub.includes('op-save-line'), 'a pub page has none of the new lines');
  assert.match(pub, /<label for="opName">Your name<\/label>/);
  // French.
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.ok(fr.includes('Envoyé pour vérification, habituellement en moins d’une journée. Touchez Envoyer les modifications quand vous avez terminé.'));
  assert.match(fr, /Votre nom \(facultatif\)/);
});

test('"We don\'t have…" confirms where it was tapped: each button carries its Got-it text (EN + FR), the inline ones too', async () => {
  for (const k of pc.NONE_KEYS) assert.ok(pc.GOT_TEXT[k] && pc.GOT_TEXT[k].en.startsWith('Got it: ') && pc.GOT_TEXT[k].fr.startsWith('C’est noté : '), k);
  const v = mk('restaurant', { hours: week });
  const html = await bar(tokenFor(v.id));
  assert.match(html, /data-cb-none="facebook" data-cb-got="Got it: not on Facebook ✓">We’re not on Facebook</);
  assert.match(html, /data-cb-undo-text="Undo"/);
  const inline = JSON.parse(/data-cb-inline="([^"]*)"/.exec(html)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.ok(inline.find((x) => x.key === 'instagram').got === 'Got it: not on Instagram ✓');
  const fr = await (await fetch(`${base}/fr/owner/${tokenFor(v.id)}/completeness`)).json();
  assert.match(fr.html, /data-cb-got="C’est noté : pas sur Facebook ✓"/);
  // The page script builds the line in place and keeps it through the redraw.
  assert.match(pc.COMPLETENESS_SCRIPT, /function gotEl\(tag, key, text\)/);
  assert.match(pc.COMPLETENESS_SCRIPT, /inlineP\.parentNode\.replaceChild\(gotEl\('p', key, text\), inlineP\)/);
});

test('small fixes: card subtitle while open, See your page, "more quick ones" note, banner only after a save', async () => {
  const v = mk('restaurant', { hours: week });
  const html = await bar(tokenFor(v.id));
  const sub = /<span id="opCbSub" data-closed="([^"]*)" data-opened="([^"]*)">/.exec(html);
  assert.ok(sub, 'the subtitle has an open and a closed version');
  assert.match(sub[1], /Tap to start\.$/);
  assert.doesNotMatch(sub[2], /Tap to/);
  assert.match(html, /<p class="op-cb-see"><a href="https:\/\/okanaganroam\.com\/penticton\/restaurants\/final-fixes-restaurant-\d+" target="_blank" rel="noopener">See your page/);
  assert.match(html, /data-cb-quick="[a-z_ ]+" data-cb-more1="1 more quick one just came up\."/);
  assert.match(pc.COMPLETENESS_SCRIPT, /progress\('', true\);/, 'on page load the score is only remembered');
  assert.match(pc.COMPLETENESS_SCRIPT, /sb\.textContent = sb\.getAttribute\(open \? 'data-opened' : 'data-closed'\)/);
  const done = pc.renderCompleteness({ ...pc.scoreCompleteness({}, { today }), complete: true, pct: 100, missing: [], quick: [], later: [] }, {});
  assert.doesNotMatch(headOf(done), /quick/);
  // The page script has no backslashes (it is pasted into a template literal) and parses.
  assert.doesNotMatch(pc.COMPLETENESS_SCRIPT, /\\/);
  assert.doesNotThrow(() => new Function(pc.COMPLETENESS_SCRIPT));
});

test('weekly specials have visible labels and "e.g." examples; Plan your visit boxes grow; the floating bar hides while Send is on screen', async () => {
  const v = mk('restaurant', { hours: week });
  const page = await get(`/owner/${tokenFor(v.id)}`);
  const sp = page.slice(page.indexOf('id="opSpecials"'), page.indexOf('id="opSpecialsError"'));
  for (const lab of ['Days', 'Name', 'What you get', 'Price (optional)']) assert.ok(sp.includes(`<span class="op-sp-lab">${lab}</span>`), lab);
  assert.match(sp, /class="op-sp-title"[^>]*placeholder="e\.g\. Wing Wednesday"/);
  assert.match(page, /<textarea id="opVisitKnown" class="op-visit-ta" rows="1" data-visit-key="known_for" maxlength="180"/);
  assert.match(page, /body\.owner-page\.op-submit-seen \.op-unsent \{ display: none; \}/);
  assert.match(page, /new IntersectionObserver\(function\(es\)\{ es\.forEach\(function\(x\)\{ document\.body\.classList\.toggle\('op-submit-seen', x\.isIntersecting\); \}\); \}\)\.observe\(sb\)/);
  const pub = await get(`/owner/${tokenFor(mk('pub', { hours: week }).id)}`);
  assert.ok(!pub.includes('op-sp-lab') && !pub.includes('op-visit-ta'), 'pubs keep their boxes as they were');
});

test('menu page: a restaurant can just add a menu link, and gets "Save this as my menu link instead" when an import fails', async () => {
  const v = mk('restaurant', { hours: week, website: 'https://final-fixes.example' });
  const token = tokenFor(v.id);
  const page = await get(`/owner/${token}/menu`);
  assert.match(page, /"linkOk":true/);
  assert.match(page, /Just add a link to your menu/);
  assert.match(page, /Save this as my menu link instead/);
  assert.match(page, /function selectOnFocus\(id\)/, 'a pre-filled address is selected on focus, so typing replaces it');
  assert.match(page, /fetch\(C\.back \+ '\/changes'/);
  const fr = await get(`/fr/owner/${token}/menu`);
  assert.match(fr, /Ajouter seulement un lien vers votre menu/);
  const pub = await get(`/owner/${tokenFor(mk('pub', { hours: week }).id)}/menu`);
  assert.match(pub, /"linkOk":false/, 'only restaurants get the new link screen');
  // The link goes through the listing's own save: checked first like the one under "Name, address & links".
  const r = await post(token, { menu_url: 'https://final-fixes.example/menu' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.review, ['menu_url']);
  assert.match(listOf(await bar(token), 'Waiting for our check'), /Link to your menu/);
});
