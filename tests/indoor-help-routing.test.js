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
  ['en', 'we charge per room not per person', ['indoor-per-room']],
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
  // Indoor test 1 (2026-11-19; Margaret, a volunteer-run museum): every question she asked, and its French twin.
  ['en', 'we are run by volunteers, do I need to be the owner', ['not-owner']],
  ['en', 'we have summer hours and winter hours, which do I put', ['seasonal-hours', 'indoor-seasonal']],
  ['en', 'we close from christmas until the middle of january, where do I put that', ['indoor-yearly-break']],
  ['en', 'admission is by donation', ['indoor-free']],
  ['en', 'school groups by appointment only', ['indoor-groups']],
  ['en', 'upstairs is not wheelchair accessible', ['indoor-access']],
  ['en', 'I dont speak French, do I have to update the French description', ['indoor-french']],
  ['en', 'we have a small gift shop, where does that go', ['indoor-gift']],
  ['en', 'kids get in free', ['indoor-price']],
  ['en', 'I am a volunteer not the owner, can I still fill this in', ['not-owner']],
  ['en', 'can other volunteers use this too', ['not-owner']],
  ['en', 'the suggested donation is $5', ['indoor-free']],
  ['en', 'group tours by appointment', ['indoor-groups']],
  ['en', 'we do school tours by appointment', ['indoor-groups']],
  ['en', 'we are a society with a volunteer board', ['not-owner']],
  ['en', 'I am the volunteer coordinator', ['not-owner']],
  ['en', 'we take a winter break', ['indoor-yearly-break']],
  ['en', 'we are closed from Dec 24 until Jan 14 every year', ['indoor-yearly-break']],
  ['fr', 'nous sommes gérés par des bénévoles, dois-je être la propriétaire', ['not-owner']],
  ['fr', 'nous avons des heures d’été et des heures d’hiver, lesquelles mettre', ['seasonal-hours', 'indoor-seasonal']],
  ['fr', 'nous fermons de Noël jusqu’à la mi-janvier, où est-ce que je mets ça', ['indoor-yearly-break']],
  ['fr', 'l’entrée est une contribution volontaire', ['indoor-free']],
  ['fr', 'groupes scolaires sur rendez-vous seulement', ['indoor-groups']],
  ['fr', 'l’étage n’est pas accessible en fauteuil roulant', ['indoor-access']],
  ['fr', 'dois-je écrire la description en français', ['indoor-french']],
  ['fr', 'nous avons une petite boutique, où est-ce que ça va', ['indoor-gift']],
  ['fr', 'les enfants entrent gratuitement', ['indoor-price']],
  ['fr', 'je suis bénévole, pas la propriétaire, puis-je remplir ceci', ['not-owner']],
  ['fr', 'est-ce que d’autres bénévoles peuvent l’utiliser', ['not-owner']],
  ['fr', 'la contribution suggérée est de 5 $', ['indoor-free']],
  ['fr', 'visites de groupe sur rendez-vous', ['indoor-groups']],
  ['fr', 'nous prenons une pause d’hiver', ['indoor-yearly-break']],
  // Indoor test 2 (2026-11-19; Jordan, an escape room and arcade bar): every question in his help log, and its French twin.
  ['en', 'we price per room not per person', ['indoor-per-room']],
  ['en', 'escape rooms must be booked online but arcade is walk in', ['indoor-booking']],
  ['en', 'arcade is all ages until 8 then 19+', ['indoor-age']],
  ['en', 'escape rooms are 10+ with an adult, 16+ on their own', ['indoor-age']],
  ['en', 'do you list birthday party packages', ['indoor-groups']],
  ['en', 'corporate team building is a big part of what we do', ['indoor-groups']],
  ['en', 'we have a bar, can I add happy hour', ['indoor-bar']],
  ['en', 'where do I put that the arcade is walk in', ['indoor-booking']],
  ['en', 'school groups by appointment only', ['indoor-groups']],
  ['en', 'we are run by volunteers, do I need to be the owner', ['not-owner']],
  ['en', 'we close from Christmas until mid-January', ['indoor-yearly-break']],
  ['en', 'I don\'t speak French, do I have to write it in French', ['indoor-french']],
  ['en', 'kids get in free', ['indoor-price']],
  ['en', 'can my manager also edit this', ['not-owner', 'staff']],
  ['en', 'the arcade is 19+ after 8pm will that show', ['indoor-age']],
  ['en', 'how do I change the price, it says adults but we charge per room', ['indoor-per-room']],
  ['fr', 'notre prix est par salle, pas par personne', ['indoor-per-room']],
  ['fr', 'les jeux d’évasion doivent être réservés en ligne mais l’arcade est sans réservation', ['indoor-booking']],
  ['fr', 'l’arcade est pour tous les âges jusqu’à 20 h, puis 19 ans et plus', ['indoor-age']],
  ['fr', 'les jeux d’évasion sont pour les 10 ans et plus avec un adulte, 16 ans et plus seuls', ['indoor-age']],
  ['fr', 'affichez-vous les forfaits de fête d’anniversaire', ['indoor-groups']],
  ['fr', 'la consolidation d’équipe pour les entreprises est une grosse partie de ce que nous faisons', ['indoor-groups']],
  ['fr', 'nous avons un bar, puis-je ajouter un 5 à 7', ['indoor-bar']],
  ['fr', 'où est-ce que je mets que l’arcade est sans réservation', ['indoor-booking']],
  ['fr', 'groupes scolaires sur rendez-vous seulement', ['indoor-groups']],
  ['fr', 'nous sommes gérés par des bénévoles, dois-je être le propriétaire', ['not-owner']],
  ['fr', 'nous fermons de Noël jusqu’à la mi-janvier', ['indoor-yearly-break']],
  ['fr', 'je ne parle pas anglais, dois-je écrire la description en anglais', ['indoor-french']],
  ['fr', 'les enfants entrent gratuitement', ['indoor-price']],
  ['fr', 'est-ce que mon gérant peut aussi modifier ceci', ['not-owner', 'staff']],
  ['fr', 'l’arcade est 19 ans et plus après 20 h, est-ce que ça va paraître', ['indoor-age']],
  ['fr', 'comment changer le prix, ça dit adultes mais nous chargeons par salle', ['indoor-per-room']],
  // Indoor test 3 (2026-11-19; Diane, a community theatre with shows only): every question she typed (help-log.json), and
  // the same in French.
  ['en', 'we dont have regular hours, only show times', ['indoor-no-hours']],
  ['en', 'box office hours vs show times', ['indoor-no-hours']],
  ['en', 'we are closed july and august', ['indoor-closed-months']],
  ['en', 'ticket prices change every show', ['indoor-ticket-prices']],
  ['en', 'tickets online or by phone, or at the door if seats are left', ['indoor-booking']],
  ['en', 'some shows are 19+', ['indoor-age']],
  ['en', 'we have a bar in the lobby, can I add happy hour', ['indoor-bar']],
  ['en', 'tickets online but the summer camp is walk in', ['indoor-booking']],
  ['en', 'kids shows all ages but comedy is 19+', ['indoor-age']],
  ['en', 'I am the manager not the owner, can I do this?', ['not-owner', 'staff']],
  ['en', 'we have 30 shows a season, do I add them all one by one', ['indoor-season-list']],
  ['en', 'prices vary', ['indoor-ticket-prices']],
  ['fr', 'nous n’avons pas d’heures régulières, seulement des heures de spectacle', ['indoor-no-hours']],
  ['fr', 'heures de billetterie ou heures des spectacles', ['indoor-no-hours']],
  ['fr', 'nous sommes fermés en juillet et en août', ['indoor-closed-months']],
  ['fr', 'le prix des billets change à chaque spectacle', ['indoor-ticket-prices']],
  ['fr', 'billets en ligne ou par téléphone, ou à la porte s’il reste des places', ['indoor-booking']],
  ['fr', 'certains spectacles sont 19 ans et plus', ['indoor-age']],
  ['fr', 'nous avons un bar dans le hall, puis-je ajouter un 5 à 7', ['indoor-bar']],
  ['fr', 'je suis la gérante, pas la propriétaire, puis-je faire ceci?', ['not-owner', 'staff']],
  ['fr', 'pouvez-vous ajouter toute notre saison de spectacles', ['indoor-season-list']],
  // Indoor test 3's dead end, found in test 4: "our tickets are $25 to $55".
  ['en', 'our tickets are $25 to $55', ['indoor-ticket-prices']],
  ['fr', 'nos billets coûtent de 25 $ à 55 $', ['indoor-ticket-prices']],
];
// Indoor test 4 (2026-11-19; Lauren, a day spa): every question in her help log (help-log.json), and its French twin,
// asked on a spa's setup. Treatment and service prices go to Your prices; "why does my card say Adults" to the price
// answer; never the restaurant "Price range".
const SPA_ASKED = [
  ['en', 'every service has a different price', ['menu-add']],
  ['en', 'treatments are by appointment but the circuit is walk in', ['indoor-booking']],
  ['en', '16+ for massage, 19+ for the hydrotherapy', ['indoor-age']],
  ['en', 'how do I add our spa menu', ['menu-add']],
  ['en', 'is this free, what\'s the catch', ['indoor-cost']],
  ['en', 'ticket prices change every show', ['indoor-ticket-prices']],
  ['en', 'we are closed july and august', ['indoor-closed-months']],
  ['en', 'our tickets are $25 to $55', ['indoor-ticket-prices']],
  ['en', 'we only have shows, no regular hours', ['indoor-no-hours']],
  ['en', '60 min massage is $130 and 90 min is $175, where do those go', ['menu-add']],
  ['en', 'where do I put gift cards', ['indoor-gift']],
  ['en', 'why does my card say Adults $65', ['indoor-price']],
  ['en', 'where do our treatment prices go', ['menu-add']],
  ['en', 'how much is a treatment', ['indoor-price', 'menu-add']],
  ['en', 'massage prices', ['menu-add']],
  ['en', 'it says adults but it’s a spa pass', ['indoor-price']],
  ['fr', 'chaque service a un prix différent', ['menu-add']],
  ['fr', 'les soins sont sur rendez-vous mais le circuit est sans réservation', ['indoor-booking']],
  ['fr', '16 ans et plus pour les massages, 19 ans et plus pour l’hydrothérapie', ['indoor-age']],
  ['fr', 'comment ajouter notre carte des soins', ['menu-add']],
  ['fr', 'est-ce gratuit, où est l’attrape', ['indoor-cost']],
  ['fr', 'le prix des billets change à chaque spectacle', ['indoor-ticket-prices']],
  ['fr', 'nous sommes fermés en juillet et en août', ['indoor-closed-months']],
  ['fr', 'nos billets coûtent de 25 $ à 55 $', ['indoor-ticket-prices']],
  ['fr', 'nous n’avons que des spectacles, pas d’heures régulières', ['indoor-no-hours']],
  ['fr', 'le massage de 60 min est à 130 $ et celui de 90 min à 175 $, où vont-ils', ['menu-add']],
  ['fr', 'où mettre les cartes-cadeaux', ['indoor-gift']],
  ['fr', 'pourquoi ma fiche indique Adultes 65 $', ['indoor-price']],
];

test('indoor test 4: a spa’s questions (Lauren’s help log, EN + FR) land on the indoor answers, never the restaurant Price range', async () => {
  const { en, fr } = await setupFor('indoor', { name: 'Room and Pillar Spa Help', description: 'A day spa with massage and facials.' });
  const wrong = [];
  for (const [lang, q, want] of SPA_ASKED) {
    const r = (lang === 'fr' ? fr : en).best(q);
    if (!r || !want.includes(r.id)) wrong.push(`[${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (r && ['price-range', 'avg-spend'].includes(r.id)) wrong.push(`[${lang}] "${q}" -> restaurant ${r.id}`);
  }
  assert.deepEqual(wrong, []);
  // Every question in her real log lands somewhere useful, and the restaurant price topics aren't on the page at all.
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'drafts', 'fresh-eyes-indoor4-2026-11-19', 'help-log.json'), 'utf8'));
  for (const x of log) { const r = en.best(x.q); assert.ok(r && r.id && !['price-range', 'avg-spend'].includes(r.id), `${x.q} -> ${r && r.id}`); }
  assert.equal(en.topic('price-range'), undefined);
  assert.equal(en.topic('avg-spend'), undefined);
  // The answers are a spa's: its own price words and examples, no arcade, escape room or museum gift shop.
  const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Indoor test 10: before a price is typed, the example is the kind's own (a spa's $65, never $25 for every kind).
  assert.match(plain(en.topic('indoor-price').a), /put your lowest price \(a pass or your shortest treatment\)\. Your card and your page say “From \$65”/);
  assert.match(plain(en.topic('indoor-price').a), /Massage: 60 min \$130, 90 min \$175/);
  assert.match(plain(fr.topic('indoor-price').aFr), /« À partir de 65 \$ »/);
  assert.match(plain(en.topic('menu-add').a), /shows on your page as “Spa menu”/);
  assert.match(plain(fr.topic('menu-add').aFr), /« Carte des soins »/);
  assert.match(plain(en.topic('indoor-gift').a), /Gift cards for treatments and spa days/);
  assert.match(plain(en.topic('indoor-groups').a), /Couples’ packages/);
  assert.match(plain(en.topic('indoor-good-to-know').a), /Bring a swimsuit/);
  for (const id of ['indoor-price', 'indoor-booking', 'indoor-age', 'indoor-gift', 'indoor-groups', 'indoor-good-to-know', 'menu-add']) {
    const a = plain(en.topic(id).a) + plain(fr.topic(id).aFr);
    assert.doesNotMatch(a, /arcade|escape room|jeu d’évasion|gift shop|boutique|grip socks|chaussettes|Adults \$|Adultes :/i, id);
  }
});

// Indoor test 5 (2026-11-19; Chris, a climbing and trampoline park, $20, All ages): every question in his help log
// (help-log.json) and its French twin. Timed passes, toddler time, memberships and "the rest of my prices" are the price
// answers (the box, then Your prices with his kind's examples); PD-day camps are the Groups answer (its school and camp chip,
// and events for dated camps).
const CLIMB_ASKED = [
  ['en', 'closed christmas day only', ['closures']],
  ['en', 'jump passes are 60 min $22 or 90 min $28, not a day pass. what do i put', ['indoor-price']],
  ['en', 'toddler time is cheaper', ['indoor-price', 'menu-add']],
  ['en', 'waiver has to be signed online before they come', ['indoor-good-to-know']],
  ['en', 'kids under 7 need an adult inside with them', ['indoor-age']],
  ['en', 'how do I show our birthday party packages', ['indoor-groups']],
  ['en', 'memberships?', ['indoor-price', 'menu-add']],
  ['en', 'school PD day camps', ['indoor-groups']],
  ['en', 'what price do I put', ['indoor-price']],
  ['en', 'can people just walk in', ['indoor-booking']],
  ['en', 'where do i put the gift shop', ['indoor-gift']],
  ['en', 'where do the rest of my prices go', ['menu-add', 'indoor-price']],
  ['en', 'where do i put treatment prices', ['menu-add']],
  ['en', 'our service prices are per 30 minutes', ['menu-add']],
  ['en', 'where do I put our waiver link', ['indoor-good-to-know']],
  ['en', 'grip socks are extra', ['indoor-good-to-know']],
  ['en', 'kids price', ['indoor-price', 'menu-add']],
  ['fr', 'fermé le jour de Noël seulement', ['closures']],
  ['fr', 'les sauts sont 60 min 22 $ ou 90 min 28 $, pas un laissez-passer d’un jour. quoi mettre', ['indoor-price']],
  ['fr', 'le temps des tout-petits est moins cher', ['indoor-price', 'menu-add']],
  ['fr', 'la décharge se signe en ligne avant de venir', ['indoor-good-to-know']],
  ['fr', 'comment montrer nos forfaits de fête d’anniversaire', ['indoor-groups']],
  ['fr', 'abonnements?', ['indoor-price', 'menu-add']],
  ['fr', 'camps de journée pédagogique', ['indoor-groups']],
  ['fr', 'où va le reste de mes prix', ['menu-add', 'indoor-price']],
  ['fr', 'prix des enfants', ['indoor-price', 'menu-add']],
  ['fr', 'est-ce que les gens peuvent venir sans réserver', ['indoor-booking']],
];

test('indoor test 5: a climbing and trampoline park’s questions (Chris’s help log, EN + FR) land on the indoor answers, with his own price', async () => {
  const v = app.createVenue({ name: `Rock Garden Help ${++n}`, slug: `indoor-help-${n}`, region: 'vernon', type: 'indoor', latitude: 50.25, longitude: -119.26, address: `${n} 14th Ave, Vernon`, description: 'Indoor climbing gym and trampoline park.' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const ch = (changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => r.status);
  assert.ok([200, 201].includes(await ch({ indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'busy', age: 'all' } })));
  assert.ok([200, 201].includes(await ch({ indoor_price: 20 })));
  const en = helpBot(await get(`/owner/${t}/setup`)), fr = helpBot(await get(`/fr/owner/${t}/setup`));
  const wrong = [];
  for (const [lang, q, want] of CLIMB_ASKED) {
    const r = (lang === 'fr' ? fr : en).best(q);
    if (!r || !want.includes(r.id)) wrong.push(`[${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  // Every question in his real log lands somewhere ("I’m not sure" no more).
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'drafts', 'fresh-eyes-indoor5-2026-11-19', 'help-log.json'), 'utf8'));
  for (const x of log.filter((y) => !/^\[/.test(y.q))) { const r = en.best(x.q); assert.ok(r && r.id, `${x.q} -> nothing`); }
  const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // His own price, his kind's words and examples; "put your…".
  assert.match(plain(en.topic('indoor-price').a), /put your lowest adult pass \(day or timed\)\. Your card and your page say “Passes \$20”/);
  assert.match(plain(en.topic('indoor-price').a), /Gear rental \$8, 10-visit punch card \$180/);
  assert.match(plain(fr.topic('indoor-price').aFr), /indiquez votre laissez-passer adulte le moins cher \(journée ou durée\)\. Votre fiche et votre page indiquent « Laissez-passer 20 \$ »/);
  assert.doesNotMatch(plain(en.topic('indoor-price').a), /\$25/);
  assert.match(plain(en.topic('indoor-groups').a), /School and camp groups/);
  assert.match(plain(en.topic('indoor-groups').a), /Add an event/);
  assert.match(plain(fr.topic('indoor-groups').aFr), /Groupes scolaires et camps/);
});

// Indoor test 6 (2026-11-19; Priya, a pottery and paint studio in Penticton: drop-in painting all ages $25, 6-week wheel
// courses 14+, a Friday date night $95 for two, kids' camps): every question in her help log, with its French twin, on
// the setup and, for the two she asked on her prices page, on that page too. A question with no key of a topic never gets
// that topic ("date night is per couple" got the photo-position answer from « coupée »).
const CLAY_ASKED = [
  ['en', 'we have evening classes outside our normal hours, do I put those in?', ['indoor-class-nights']],
  ['en', 'evening classes outside normal hours', ['indoor-class-nights']],
  ['en', 'How do I set my hours?', ['hours']],
  ['en', 'we close over christmas for two weeks', ['setup-short-closure', 'indoor-yearly-break', 'closures']],
  ['en', 'we have drop in painting and booked classes', ['indoor-booking']],
  ['en', 'drop in is $25 plus the piece, what do I put', ['indoor-price']],
  ['en', 'all ages for painting but 14+ for the wheel', ['indoor-age']],
  ['en', 'courses run 6 weeks', ['indoor-courses']],
  ['en', 'date night is per couple', ['indoor-price-two']],
  ['en', 'how do people see our class schedule', ['menu-add']],
  ['en', 'where do I put our kids summer camps', ['indoor-groups']],
  ['en', 'what price do I put', ['indoor-price']],
  ['en', 'where do the rest of my prices go', ['menu-add']],
  ['en', 'can people just walk in', ['indoor-booking']],
  ['fr', 'nous avons des cours le soir en dehors de nos heures, est-ce que je les mets?', ['indoor-class-nights']],
  ['fr', 'cours du soir en dehors des heures', ['indoor-class-nights']],
  ['fr', 'comment changer mes heures d’ouverture?', ['hours']],
  ['fr', 'nous fermons deux semaines à Noël', ['setup-short-closure', 'indoor-yearly-break', 'closures']],
  ['fr', 'nous avons de la peinture sans réservation et des cours à réserver', ['indoor-booking']],
  ['fr', 'tous les âges pour la peinture mais 14 ans et plus pour le tour', ['indoor-age']],
  ['fr', 'les cours durent 6 semaines', ['indoor-courses']],
  ['fr', 'la soirée en amoureux est par couple', ['indoor-price-two']],
  ['fr', 'où mettre nos camps d’été pour enfants', ['indoor-groups']],
  ['fr', 'quel prix mettre', ['indoor-price']],
  ['fr', 'où vont mes autres prix', ['menu-add']],
  ['fr', 'est-ce qu’on peut venir sans réserver', ['indoor-booking']],
];
test('indoor test 6: a pottery and paint studio’s questions (Priya’s help log, EN + FR) land on the right answers; the hours answers fit a classes place; the prices answer names her real button', async () => {
  const v = app.createVenue({ name: `Clay Studio Help ${++n}`, slug: `indoor-help-${n}`, region: 'penticton', type: 'indoor', latitude: 49.48, longitude: -119.59, address: `${n} Fairview Rd, Penticton`, description: 'A pottery and paint studio.' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const ch = (changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => r.status);
  assert.ok([200, 201].includes(await ch({ indoor_info: { kinds: ['classes'], length: '2-3h', book: 'no', age: 'all' } })));
  assert.ok([200, 201].includes(await ch({ indoor_price: 25 })));
  const en = helpBot(await get(`/owner/${t}/setup`)), fr = helpBot(await get(`/fr/owner/${t}/setup`));
  const wrong = [];
  for (const [lang, q, want] of CLAY_ASKED) {
    const r = (lang === 'fr' ? fr : en).best(q);
    if (!r || !want.includes(r.id)) wrong.push(`[${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
  }
  // Her prices page (where she asked about the date night and the courses).
  const men = helpBot(await get(`/owner/${t}/menu`)), mfr = helpBot(await get(`/fr/owner/${t}/menu`));
  for (const [b, q, want] of [[men, 'date night is per couple', 'indoor-price-two'], [men, 'courses run 6 weeks', 'indoor-courses'], [mfr, 'la soirée en amoureux est par couple', 'indoor-price-two'], [mfr, 'les cours durent 6 semaines', 'indoor-courses']]) {
    const r = b.best(q); if (!r || r.id !== want) wrong.push(`[menu] "${q}" -> ${r && r.id} (want ${want})`);
  }
  assert.deepEqual(wrong, []);
  // Never photo-position from a word that only looks like « coupée »; "not sure" is fine.
  assert.notEqual(men.best('date night is per couple').id, 'photo-position');
  for (const q of ['per couple', 'the couple who own it']) assert.notEqual(men.best(q).id, 'photo-position', q);
  // Every question in her real log lands somewhere.
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'drafts', 'fresh-eyes-indoor6-2026-11-19', 'help-log.json'), 'utf8'));
  for (const x of log.filter((y) => !/^\[/.test(y.q))) { const r = (/\/menu/.test(x.hash) ? men : en).best(x.q); assert.ok(r && r.id, `${x.q} -> nothing`); }
  const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  // Class nights: open studio hours, class nights in Good to know, the wheel example (EN + FR).
  assert.match(plain(en.topic('indoor-class-nights').a), /Keep your hours as your open studio hours/);
  assert.match(plain(en.topic('indoor-class-nights').a), /Evening wheel classes Wed & Fri 6:30–9 \(book online\)/);
  assert.match(plain(fr.topic('indoor-class-nights').aFr), /heures d’atelier libre/);
  // The hours answers never name "+ Add a second time" (a classes place's day cards don't have it), nor past midnight; the
  // lunch-and-dinner answer is not offered; the hours answer says where evening classes go.
  const hours = plain(en.topic('hours').a), hoursFr = plain(fr.topic('hours').aFr);
  assert.doesNotMatch(hours, /Add a second time|past midnight/);
  assert.doesNotMatch(hoursFr, /deuxième plage|après minuit/);
  assert.match(hours, /Evening classes outside these hours\? Keep your hours as your open studio hours/);
  assert.equal(en.topic('setup-split-hours'), undefined);
  assert.doesNotMatch(plain(en.topic('indoor-swim-times').a), /Add a second time/);
  assert.doesNotMatch(plain(fr.topic('indoor-swim-times').aFr), /deuxième plage/);
  // Her prices: her button's words ("Looks good, send it!" on her link), and the Book button opens her schedule.
  assert.match(plain(en.topic('menu-add').a), /then tap Looks good, send it!/);
  assert.doesNotMatch(plain(en.topic('menu-add').a), /tap Publish/);
  assert.match(plain(en.topic('menu-add').a), /your page’s Book button opens it/);
  assert.match(plain(fr.topic('menu-add').aFr), /C’est bon, envoyer/);
  // The ages answer: the youngest age for anything she offers.
  assert.match(plain(en.topic('indoor-age').a), /youngest age anyone can come, for anything you offer/);
  // A bowling alley (second times on its day cards) keeps "+ Add a second time" in its hours answer.
  const b = app.createVenue({ name: `Lanes Help ${++n}`, slug: `indoor-help-${n}`, region: 'penticton', type: 'indoor', latitude: 49.48, longitude: -119.59, address: `${n} Main St, Penticton`, description: 'Bowling.' });
  const tb = app.createOwnerLink(b.id, {}).url.split('/owner/')[1];
  await fetch(`${base}/owner/${tb}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes: { indoor_info: { kinds: ['bowling'], length: '1-2h' } }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
  const be = helpBot(await get(`/owner/${tb}/setup`));
  assert.match(plain(be.topic('hours').a), /Add a second time/);
  assert.doesNotMatch(plain(be.topic('hours').a), /open studio hours/);
});

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
  for (const t of en.topics.filter((x) => /^indoor-/.test(x.id) && x.id !== 'indoor-bar')) assert.doesNotMatch(plain(t.a) + plain(t.aFr), /happy hour|5 [aà] 7|your tours|vos sorties/i, t.id);
  // Indoor test 2: the one answer that names happy hour says it isn't listed for indoor places, and offers Good to know.
  assert.match(plain(en.topic('indoor-bar').a), /Happy hour isn’t listed for indoor places\. Say you have a bar in Good to know/);
  assert.match(plain(fr.topic('indoor-bar').aFr), /Le 5 à 7 n’est pas affiché pour les endroits intérieurs/);
  // The mixed-booking and ages answers (indoor test 2) name only buttons the screen shows.
  assert.match(plain(en.topic('indoor-booking').a), /Pick what’s true for your main activity, and add the exception under Good to know/);
  assert.doesNotMatch(plain(en.topic('indoor-booking').a), /We don’t take bookings online/);
  assert.match(plain(en.topic('indoor-age').a), /pick the youngest age anyone can come/i);
  assert.match(plain(en.topic('indoor-age').a), /Put rules by activity or time under Good to know/);
  assert.doesNotMatch(plain(en.topic('indoor-groups').a), /\. or /);
  // Indoor test 10: it starts "Yes — you don’t need to be the owner" (Sandra, city staff: "Am I allowed to fill this in?").
  assert.match(plain(en.topic('not-owner').a), /^\s*Yes — you don’t need to be the owner; managers, staff and volunteers can use this link too/);
  assert.match(plain(fr.topic('not-owner').aFr), /^\s*Oui — pas besoin d’être le propriétaire/);
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

// Indoor test 7 (2026-11-19; Robert, a commercial art gallery in Kelowna: free entry, art for sale and shipped, a new
// exhibition every month with a First Friday opening reception 6–8 PM): every question in his help log, with its French twin.
const GALLERY_ASKED = [
  ['en', 'is there a fee for this', ['indoor-cost']],
  ['en', 'what is the catch, are you going to sell me advertising', ['indoor-cost']],
  ['en', 'is this a scam', ['indoor-cost']],
  ['en', 'are you going to upsell me', ['indoor-cost']],
  ['en', 'do you charge commission on art sales', ['indoor-cost']],
  ['en', 'first friday openings 6 to 8', ['indoor-openings']],
  ['en', 'we have an opening reception the first friday of every month from 6 to 8, where does that go?', ['indoor-openings']],
  ['en', 'opening night is outside my hours, do I change my hours?', ['indoor-openings']],
  ['en', 'vernissage', ['indoor-openings']],
  ['en', 'artist talk on saturday', ['indoor-openings']],
  ['en', 'exhibition opening', ['indoor-openings']],
  ['en', 'entry is free but the art is for sale', ['indoor-free']],
  ['en', 'entry is free, do I need to put the prices of the paintings here?', ['indoor-free']],
  ['en', 'we have a new exhibition every month', ['indoor-exhibits']],
  ['en', 'can I list our artists', ['indoor-artists']],
  ['en', 'can I put the names of the artists we represent', ['indoor-artists']],
  ['en', 'we ship art anywhere in canada', ['indoor-good-to-know']],
  ['en', 'we do shipping', ['indoor-good-to-know']],
  ['en', 'how do I change my opening hours', ['hours']],
  ['fr', 'y a-t-il des frais pour ça', ['indoor-cost']],
  ['fr', 'quelle est l’attrape, allez-vous me vendre de la publicité', ['indoor-cost']],
  ['fr', 'est-ce une arnaque', ['indoor-cost']],
  ['fr', 'vernissage le premier vendredi de 18 h à 20 h', ['indoor-openings']],
  ['fr', 'nous avons une réception le premier vendredi de chaque mois', ['indoor-openings']],
  ['fr', 'l’entrée est gratuite mais les œuvres sont à vendre', ['indoor-free']],
  ['fr', 'nouvelle exposition chaque mois', ['indoor-exhibits']],
  ['fr', 'puis-je nommer les artistes que nous représentons', ['indoor-artists']],
  ['fr', 'nous expédions partout au Canada', ['indoor-good-to-know']],
];
test('indoor test 7: a gallery’s questions (Robert’s help log, EN + FR) land on the right answers; openings are events, the free answer says Your prices can be skipped', async () => {
  const v = app.createVenue({ name: `Hambleton Help ${++n}`, slug: `indoor-help-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.89, longitude: -119.49, address: `${n} Ellis St, Kelowna`, description: 'A commercial art gallery.', cuisine: 'Art gallery' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const ch = (changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => r.status);
  assert.ok([200, 201].includes(await ch({ indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', age: 'all' }, indoor_price: 'free' })));
  const en = helpBot(await get(`/owner/${t}/setup`)), fr = helpBot(await get(`/fr/owner/${t}/setup`));
  const wrong = [];
  for (const [lang, q, want] of GALLERY_ASKED) {
    const r = (lang === 'fr' ? fr : en).best(q);
    if (!r || !want.includes(r.id)) wrong.push(`[${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  // Every question in his real log lands somewhere ("I’m not sure" no more).
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'drafts', 'fresh-eyes-indoor7-2026-11-19', 'help-log.json'), 'utf8'));
  for (const x of log.filter((y) => !/^\[/.test(y.q))) { const r = en.best(x.q); assert.ok(r && r.id, `${x.q} -> nothing`); }
  const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(plain(en.topic('indoor-openings').a), /Keep your hours as your open-door hours; add the opening as an event/);
  assert.match(plain(fr.topic('indoor-openings').aFr), /ajoutez le vernissage comme un événement/);
  assert.match(plain(en.topic('menu-add').a), /^\s*Free entry\? You can skip this\./);
  assert.match(plain(en.topic('indoor-free').a), /You can skip Your prices/);
  assert.match(plain(en.topic('indoor-cost').a), /no catch/);
});
