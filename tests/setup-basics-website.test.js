// Easy setup step 1 (2026-11-10): "Is this your address, phone and website?" for restaurants and pubs, in English and
// French. The website is shown as a plain domain (or "No website yet"); the change screen has a Website box that
// takes "example.com" without https://, and "We don't have a website". A website change is checked first, as today
// (Sent ✓ within a day); "We don't have a website" with none on file is the existing not-offered answer (live).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'setup-basics-website-admin-token';
const app = require('../server.js');
const strings = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Basics Site ${type} ${++n}`, slug: `basics-site-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  address: '1 Main St, Kelowna', phone: '250-555-0100', description: 'A fixture used only by the setup website test.', ...o });
const tokens = new Map();
const token = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.41.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const cfgOf = async (p) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(await fetch(base + p).then((r) => r.text()))[1]);
const venueSite = (id) => app.getVenue(id).website || null;

test('step 1 asks for the website too, for restaurants and pubs, in English and French', async () => {
  for (const type of ['restaurant', 'pub']) {
    const v = mk(type, { website: 'https://www.tapside.example/' });
    const en = await cfgOf(`/owner/${token(v.id)}/setup`);
    assert.equal(en.cur.website, 'https://www.tapside.example/', `${type}: the current website reaches the setup`);
    assert.equal(en.t.basicsQ, 'Is this your address, phone and website?');
    assert.equal(en.t.noWebsiteYet, 'No website yet');
    assert.equal(en.t.noWebsiteBtn, 'We don’t have a website');
    assert.equal(en.t.labels.basics, 'Address, phone and website');
    const fr = await cfgOf(`/fr/owner/${token(v.id)}/setup`);
    assert.equal(fr.t.basicsQ, 'Est-ce bien votre adresse, votre téléphone et votre site Web?');
    assert.equal(fr.t.noWebsiteBtn, 'Nous n’avons pas de site Web');
  }
  for (const lang of ['en', 'fr']) for (const k of ['website', 'noWebsiteYet', 'noWebsiteSaid', 'websiteLabel', 'websiteEx', 'noWebsiteBtn', 'websiteBad']) assert.ok(strings[lang][k], `${lang}.${k}`);
});

test('the page script shows the domain, has a Website box that takes "example.com", and a "We don\'t have a website" choice', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(src, /field\('suSite', T\.websiteLabel, [^\n]*\{ mode: 'url', max: 300 \}\)/, 'type=text, inputmode=url');
  assert.match(src, /'basicsNoSite'/);
  // The helpers, run as written: plain domain, ok without https://, refused when it isn't a web address.
  const grab = (name) => new Function(`return ${/function (siteDomain|siteOk)\(u\)\{[^\n]*\}/.exec(src.slice(src.indexOf(`function ${name}(u)`)))[0]}`)();
  const siteDomain = grab('siteDomain');
  global.siteDomain = siteDomain;
  const siteOk = grab('siteOk');
  assert.equal(siteDomain('https://www.tapside.example/'), 'tapside.example');
  assert.equal(siteDomain('http://tapside.example/menu/'), 'tapside.example/menu');
  assert.ok(siteOk('example.com'));
  assert.ok(siteOk('www.example.com/menu'));
  assert.ok(!siteOk('Copper Pot Kitchen'));
  assert.ok(!siteOk('example'));
  delete global.siteDomain;
});

test('a website typed without https:// is checked first (Sent ✓ within a day), for a restaurant and a pub', async () => {
  for (const type of ['restaurant', 'pub']) {
    const v = mk(type);
    const r = await change(token(v.id), { website: 'tapside.example' });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    assert.deepEqual(r.body.review, ['website'], `${type}: the website waits for our check`);
    assert.deepEqual(r.body.live, []);
    assert.equal(venueSite(v.id), null, `${type}: not live until approved`);
    const pending = app.pendingOwnerChange(v.id);
    assert.equal(app.getOwnerChange(pending.id).changes.website, 'https://tapside.example', 'the server adds https://');
  }
});

test('"We don\'t have a website": the not-offered answer when none is on file (live); a removal is checked first', async () => {
  for (const type of ['restaurant', 'pub']) {
    const none = mk(type);
    const r = await change(token(none.id), { not_offered: ['website'] });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    assert.ok(r.body.live.includes('not_offered'), `${type}: the answer is live`);
    assert.deepEqual(app.venueNotOffered(none.id), ['website']);
    const cfg = await cfgOf(`/owner/${token(none.id)}/setup`);
    assert.deepEqual(cfg.cur.not_offered, ['website'], 'the setup sees the answer next time (shown as "You don\'t have a website")');
    // Adding a website later goes through review as before.
    const add = await change(token(none.id), { website: 'tapside.example' });
    assert.deepEqual(add.body.review, ['website']);
  }
  const has = mk('pub', { website: 'https://tapside.example/' });
  const refused = await change(token(has.id), { not_offered: ['website'] });
  assert.ok(refused.status >= 400, 'a website on the page can\'t be "not offered" until it is removed (existing rule)');
  const removal = await change(token(has.id), { website: '' });
  assert.deepEqual(removal.body.review, ['website'], 'removing the website is checked first');
  assert.equal(venueSite(has.id), 'https://tapside.example/');
});
