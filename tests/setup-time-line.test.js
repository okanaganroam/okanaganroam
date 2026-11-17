// Easy setup time line (2026-11-10): the green "Set up your page" card, the start screen and the help topic all say
// the same thing (pub test 6, 2026-11-10): "About 15 to 30 minutes. You can stop any time and carry on later.", in English and French, for
// restaurants and pubs. Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'setup-time-line-admin-token';
const app = require('../server.js');
const strings = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

let n = 0;
const mk = (type) => app.createVenue({ name: `Time Line ${type} ${++n}`, slug: `time-line-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  address: '1 Main St, Kelowna', phone: '250-555-0100', description: 'A fixture used only by the setup time line test.' });
const token = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const card = async (p) => (/id="opSetupCard"[^>]*>([\s\S]*?)<\/a>/.exec(await fetch(base + p).then((r) => r.text())) || [])[1] || '';
// Pub test 6 (2026-11-10): the honest line, the same everywhere.
const EN = /About 15 to 30 minutes\. You can stop any time and carry on later\./;
const FR = /Environ 15 à 30 minutes\. Vous pouvez arrêter à tout moment et continuer plus tard\./;

test('the card says the same time as the start screen, for restaurants and pubs, in English and French', async () => {
  for (const type of ['restaurant', 'pub']) {
    const t = token(mk(type).id);
    assert.match(await card(`/owner/${t}`), EN, `${type} card (EN)`);
    assert.match(await card(`/fr/owner/${t}`), FR, `${type} card (FR)`);
  }
});

test('every start screen and the help topic use the same line; no shorter version is left anywhere', () => {
  const all = JSON.stringify(strings);
  assert.doesNotMatch(all, /10 to 15 minutes|about 10 minutes/, 'no old time promise left');
  assert.doesNotMatch(all, /10 à 15 minutes|environ 10 minutes/);
  for (const lang of ['en', 'fr']) {
    const leads = [strings[lang].hiLead, strings[lang].pub && strings[lang].pub.hiLead].filter(Boolean);
    assert.ok(leads.length >= 2, `${lang}: restaurant and pub start screens`);
    for (const l of leads) assert.match(l, lang === 'en' ? EN : FR);
  }
  const topic = app.OWNER_HELP_TOPICS.find((x) => x.id === 'easy-setup');
  assert.match(topic.a, EN);
  assert.match(topic.aFr, FR);
});
