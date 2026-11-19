// Indoor Help routing (2026-11-19, the indoor easy setup). Realistic questions an owner of a museum, gallery, theatre,
// spa, escape room, climbing gym, bowling centre or play centre asks while setting up, in English and French, asked
// through the same matcher the widget uses (window.__ohbBest) with the real indoor setup page config. Each must land on
// one of the listed topics, and never on a happy hour, menu-for-food or tour answer.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-help-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
let n = 0;
const setupFor = async (type, o = {}) => {
  const v = app.createVenue({ name: `Indoor Help ${++n}`, slug: `indoor-help-${n}`, region: 'kelowna', type, latitude: 49.88, longitude: -119.49, address: `${n} Water St, Kelowna`, description: 'A fixture.', ...o });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  return { en: helpBot(await get(`/owner/${t}/setup`)), fr: helpBot(await get(`/fr/owner/${t}/setup`)) };
};

// [language, the owner's question, topics it should land on]
const ASKED = [
  // Do I have to do all of this?
  ['en', 'do i have to fill all of this out', ['indoor-fill-all']],
  ['en', 'is all of this required? we are a tiny volunteer museum', ['indoor-fill-all']],
  ['en', 'so many questions, can i skip some', ['indoor-fill-all']],
  ['fr', 'est-ce que je dois tout remplir', ['indoor-fill-all']],
  ['fr', 'trop de questions, c’est obligatoire?', ['indoor-fill-all']],
  // Kinds
  ['en', 'we do axe throwing, its not on the list', ['indoor-kinds-other']],
  ['en', 'where is yoga', ['indoor-kinds-other']],
  ['en', 'we are a cat cafe, what kind do i pick', ['indoor-kinds-other', 'indoor-kinds-many']],
  ['en', 'we are a museum and gallery, which kinds do i pick', ['indoor-kinds-many']],
  ['en', 'we have bowling and an arcade and laser tag and a restaurant, can i pick more than 3', ['indoor-kinds-many']],
  ['fr', 'le lancer de hache n’est pas dans la liste', ['indoor-kinds-other']],
  ['fr', 'nous sommes un musée et une galerie, quels genres choisir', ['indoor-kinds-many']],
  // Price
  ['en', 'what price do i put, we have adult child and senior prices', ['indoor-price']],
  ['en', 'kids are $12 and adults $18, where does the kids price go', ['indoor-price']],
  ['en', 'we charge per room not per person', ['indoor-price']],
  ['en', 'we have memberships and a family pass', ['indoor-price', 'indoor-gift']],
  ['en', 'admission is by donation', ['indoor-free']],
  ['en', 'we are free to visit', ['indoor-free']],
  ['fr', 'quel prix mettre, nous avons un prix enfant et un prix adulte', ['indoor-price']],
  ['fr', 'l’entrée est gratuite', ['indoor-free']],
  ['fr', 'contribution volontaire', ['indoor-free']],
  // Booking
  ['en', 'do people need to book or can they walk in', ['indoor-booking']],
  ['en', 'walk ins are fine on weekdays but weekends we fill up', ['indoor-booking']],
  ['en', 'we sell tickets on eventbrite', ['indoor-booking']],
  ['fr', 'faut-il réserver ou peut-on venir sans réservation', ['indoor-booking']],
  ['fr', 'nous vendons des billets en ligne', ['indoor-booking']],
  // Hours
  ['en', 'we only open for shows, we have no set hours', ['indoor-no-hours']],
  ['en', 'box office hours or show times?', ['indoor-no-hours']],
  ['en', 'public swim times change every day', ['indoor-swim-times']],
  ['en', 'we are only open in summer', ['indoor-seasonal']],
  ['fr', 'nous n’avons pas d’heures fixes, seulement des spectacles', ['indoor-no-hours']],
  ['fr', 'ouvert seulement l’été', ['indoor-seasonal']],
  // Ages
  ['en', 'kids under 12 need a parent with them', ['indoor-age']],
  ['en', 'we are 19+ only (casino)', ['indoor-age']],
  ['en', 'our play area is for kids 0 to 12', ['indoor-age']],
  ['fr', 'les enfants de moins de 12 ans doivent être avec un adulte', ['indoor-age']],
  // Groups and parties
  ['en', 'we do birthday parties, where do i put that', ['indoor-groups']],
  ['en', 'school field trips and team building', ['indoor-groups']],
  ['fr', 'nous faisons des fêtes d’anniversaire', ['indoor-groups']],
  // Good to know
  ['en', 'grip socks are required, where do i say that', ['indoor-good-to-know']],
  ['en', 'everyone has to sign a waiver', ['indoor-good-to-know']],
  ['en', 'we have lockers and towels', ['indoor-good-to-know']],
  ['fr', 'les chaussettes antidérapantes sont obligatoires', ['indoor-good-to-know']],
  // Visit length
  ['en', 'how long does a visit take, it depends', ['indoor-visit-length']],
  // Access
  ['en', 'we have an elevator but no ramp', ['indoor-access']],
  ['en', 'is there somewhere to say we are wheelchair accessible', ['indoor-access']],
  ['fr', 'nous avons un ascenseur et des toilettes accessibles', ['indoor-access']],
  // Exhibitions and events
  ['en', 'our exhibitions change every month', ['indoor-exhibits']],
  ['fr', 'nos expositions changent chaque mois', ['indoor-exhibits']],
  // Prices list and the site
  ['en', 'how do i add all my prices and packages', ['menu-add']],
  ['en', 'is this really free, whats the catch', ['indoor-cost']],
  ['fr', 'est-ce vraiment gratuit?', ['indoor-cost']],
];

test('every indoor owner question lands on the right indoor topic (EN + FR)', async () => {
  const { en, fr } = await setupFor('indoor', { cuisine: '' });
  const wrong = [];
  for (const [lang, q, want] of ASKED) {
    const r = (lang === 'fr' ? fr : en).best(q);
    if (!r || !want.includes(r.id)) wrong.push(`[${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
});

test('indoor answers never talk about happy hour, menus of food or tours; the fill-all answer says only the 7 essentials matter', async () => {
  const { en, fr } = await setupFor('indoor');
  const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const t of en.topics.filter((x) => /^indoor-/.test(x.id))) assert.doesNotMatch(plain(t.a) + plain(t.aFr), /happy hour|5 [aà] 7|your tours|vos sorties/i, t.id);
  assert.match(plain(en.topic('indoor-fill-all').a), /Only the 7 essentials matter/);
  assert.match(plain(fr.topic('indoor-fill-all').aFr), /Seuls les 7 essentiels comptent/);
  assert.equal(en.topics.some((x) => /happy hour/i.test(x.q)), false);
});

test('other types keep their own help: no indoor topics on a tour or a restaurant', async () => {
  const tour = await setupFor('tour', { cuisine: 'Boat tours' });
  const rest = await setupFor('restaurant', { cuisine: 'Canadian' });
  for (const id of ['indoor-fill-all', 'indoor-price', 'indoor-booking', 'indoor-groups']) { assert.equal(tour.en.topic(id), undefined, id); assert.equal(rest.en.topic(id), undefined, id); }
  assert.equal(rest.en.best('price range').id, 'price-range');
});
