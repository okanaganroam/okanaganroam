// Indoor Help matrix (2026-11-19, after indoor test 8: Gary's 5-pin bowling centre got "I'm not sure" for 6 of his 8 bowling
// questions). For every indoor kind in indoor-kinds.js, the questions an owner of that kind really asks, in their own words
// (lowercase, typos, short), in English, with French twins for about half: the price model and its extras (per game, lane,
// hour, class, show, pass, membership, shoe rental), busy or limited times (leagues, school groups, matinees, member
// hours), theme nights and repeating events (cosmic bowling, trivia, open mic, first Friday), ages, the bar or lounge (it's
// not happy hour), parties, waivers and rentals, seasonal programs, and "do I have to fill all this out". Each is asked
// through the same matcher the widget uses (window.__ohbBest) with the real setup page config of a place of that kind, and
// must land on one of the listed topics. Every question in the 8 indoor fresh-eyes help logs lands somewhere too.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-help-matrix-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const IK = require('../indoor-kinds.js');
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
const plain = (h) => String(h && typeof h === 'object' ? h.link || h.out : h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
let n = 0;
const PRICE = { gallery: 'free', library: 'free', casino: 'free', museum: 12, theatre: 25, cinema: 14, spa: 89, pool: 6.5, climbing: 22, games: 15, escape: 30, bowling: 6.5, kids: 12, classes: 25, curling: 30, yoga: 20, other: 15 };
const bots = {};
const botsFor = async (kind) => {
  if (bots[kind]) return bots[kind];
  const v = app.createVenue({ name: `Matrix ${kind} ${++n}`, slug: `indoor-matrix-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.88, longitude: -119.49, address: `${n} Water St, Kelowna`, description: 'A fixture.' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const r = await fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes: { indoor_info: { kinds: [kind], length: '1-2h', book: 'busy', age: 'all' }, indoor_price: PRICE[kind] }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
  assert.ok([200, 201].includes(r.status), kind);
  bots[kind] = { v, en: helpBot(await get(`/owner/${t}/setup`)), fr: helpBot(await get(`/fr/owner/${t}/setup`)), men: helpBot(await get(`/owner/${t}/menu`)), mfr: helpBot(await get(`/fr/owner/${t}/menu`)) };
  return bots[kind];
};

const pageOf = (v) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: new Date('2026-11-19T12:00:00-08:00') }).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
// Topic ids, short.
const P = 'indoor-price', F = 'indoor-free', R = 'indoor-per-room', X = 'indoor-extras', B = 'indoor-bar', BK = 'indoor-booking', BZ = 'indoor-busy-times',
  TH = 'indoor-theme-nights', A = 'indoor-age', G = 'indoor-groups', GTK = 'indoor-good-to-know', S = 'indoor-seasonal', FA = 'indoor-fill-all', M = 'menu-add',
  E = 'indoor-exhibits', O = 'indoor-openings', CN = 'indoor-class-nights', C = 'indoor-courses', NH = 'indoor-no-hours', TP = 'indoor-ticket-prices', SW = 'indoor-swim-times',
  GF = 'indoor-gift', CM = 'indoor-closed-months', YB = 'indoor-yearly-break', AR = 'indoor-artists';
const CLOSE = [YB, 'setup-short-closure', 'closures'];
// Indoor test 15: a camp on set dates leads with Add an event (indoor-camps), then the Groups chip.
const CAMP = 'indoor-camps';

// kind -> [language, question, topics it may land on]
const MATRIX = {
  bowling: [
    ['en', 'price is per game but lanes can be booked by the hour', [X]],
    ['en', 'shoe rental extra', [X]],
    ['en', 'shoes are $3 extra where does that go', [X]],
    ['en', 'leagues use most lanes weeknights', [BZ]],
    ['en', 'open bowling is limited after 6 mon to thu because of leagues', [BZ]],
    ['en', 'cosmic bowling friday and saturday nights', [TH]],
    ['en', 'glow bowling on saturdays', [TH]],
    ['en', 'we have a licensed lounge', [B]],
    ['en', 'kids bday parties with pizza', [G]],
    ['en', 'do i have to fill all this out', [FA]],
    ['fr', 'location de souliers en extra', [X]],
    ['fr', 'les ligues prennent les allées en semaine', [BZ]],
    ['fr', 'quilles cosmiques vendredi et samedi soir', [TH]],
    ['fr', 'nous avons un salon avec permis d’alcool', [B]],
    ['fr', 'fêtes d’anniversaire pour enfants', [G]],
  ],
  games: [
    ['en', 'game cards are $20 for 100 credits, what price do i put', [P]],
    ['en', 'vr is per 30 min and laser tag per round', [P, M, X]],
    ['en', 'busy friday nights, book vr ahead', [BZ, BK]],
    ['en', 'retro arcade night every thursday', [TH]],
    ['en', 'arcade is all ages but 19+ after 9', [A]],
    ['en', 'we have a bar with beer on tap', [B]],
    ['en', 'laser tag birthday packages', [G]],
    ['en', 'do players sign a waiver for vr', [GTK]],
    ['fr', 'tous les âges mais 19 ans et plus après 21 h', [A]],
    ['fr', 'soirée rétro chaque jeudi', [TH]],
    ['fr', 'forfaits d’anniversaire laser tag', [G]],
    ['fr', 'est-ce que je dois tout remplir', [FA]],
  ],
  escape: [
    ['en', 'we charge per room 2-6 players', [R]],
    ['en', 'price is per person but min 2 players', [P, R, 'indoor-min-players']],
    ['en', 'weekends book up fast', [BZ, BK]],
    ['en', 'kids under 12 need an adult', [A]],
    ['en', 'halloween horror room in october only', [E, TH, S]],
    ['en', 'corporate team building', [G]],
    ['en', 'gift cards', [GF]],
    ['en', 'do i need to answer all of it', [FA]],
    ['fr', 'prix par salle de 2 à 6 joueurs', [R]],
    ['fr', 'les fins de semaine sont pleines', [BZ, BK]],
    ['fr', 'consolidation d’équipe pour entreprises', [G]],
    ['fr', 'cartes-cadeaux', [GF]],
  ],
  theatre: [
    ['en', 'tickets are 25 to 55 depending on the show', [TP]],
    ['en', 'season pass and student rush tickets', [P, M, TP]],
    ['en', 'school matinees on weekday mornings', [G, BZ]],
    ['en', 'open mic every wednesday at 7', [TH]],
    ['en', 'some shows are 19+', [A]],
    ['en', 'bar in the lobby, can i add happy hour', [B]],
    ['en', 'we rent the hall for weddings', [G]],
    ['en', 'dark in july and august', [CM]],
    ['en', 'no set hours only shows', [NH]],
    ['fr', 'soirée micro ouvert chaque mercredi', [TH]],
    ['fr', 'certains spectacles sont 19 ans et plus', [A]],
    ['fr', 'bar dans le hall', [B]],
    ['fr', 'location de la salle pour mariages', [G]],
  ],
  cinema: [
    ['en', 'cheap tuesdays all tickets $8', [TH, M, P]],
    ['en', 'adult ticket 14, kids and seniors 10', [P]],
    ['en', 'opening weekends sell out', [BZ, BK]],
    ['en', 'pg13 and r rated, what age do i pick', [A]],
    ['en', 'we serve beer and wine during movies', [B]],
    ['en', 'private screenings for birthdays', [G]],
    ['en', 'showtimes change every week, what hours do i put', [NH]],
    ['en', 'do i have to do all of these', [FA]],
    ['fr', 'mardis à prix réduit', [TH, M, P]],
    ['fr', 'projections privées pour anniversaires', [G]],
    ['fr', 'les horaires des films changent chaque semaine', [NH]],
    ['fr', 'nous servons de la bière et du vin', [B]],
  ],
  spa: [
    ['en', '60 min massage 130, where do the rest go', [M]],
    ['en', 'day pass 89, treatments extra', [P, M, X]],
    ['en', 'weekends book up 2 weeks ahead', [BZ, BK]],
    ['en', 'ladies night thursdays', [TH]],
    ['en', '16+ for treatments, 19+ circuit', [A]],
    ['en', 'can guests drink wine in the lounge', [B]],
    ['en', 'bridal parties and couples packages', [G]],
    ['en', 'robe and towel included, bring a swimsuit', [GTK]],
    ['fr', 'les fins de semaine se réservent deux semaines d’avance', [BZ, BK]],
    ['fr', 'soirée des dames le jeudi', [TH]],
    ['fr', 'peignoir et serviette fournis, apportez un maillot', [GTK]],
    ['fr', 'fêtes de mariage', [G]],
  ],
  pool: [
    ['en', 'public swim times change every day', [SW]],
    ['en', 'adult drop in 6.50, 10 visit pass', [P]],
    ['en', 'lane swim only early mornings, busy with lessons after school', [BZ, SW]],
    ['en', 'family swim with the inflatable saturdays', [TH]],
    ['en', 'kids under 8 must have a parent in the water', [A]],
    ['en', 'party room for birthdays', [G]],
    ['en', 'swim lessons register for the fall session', [C, E, M, S]],
    ['en', 'lockers need a quarter', [GTK]],
    ['en', 'closed 2 weeks in september for maintenance', CLOSE],
    ['fr', 'le bain libre change chaque jour', [SW]],
    ['fr', 'enfants de moins de 8 ans avec un parent dans l’eau', [A]],
    ['fr', 'salle de fête pour anniversaires', [G]],
    ['fr', 'casiers avec un 25 cents', [GTK]],
  ],
  climbing: [
    ['en', 'day pass 22, gear rental extra', [X]],
    ['en', 'shoe and harness rental', [X]],
    ['en', 'busy weeknights 5 to 8', [BZ]],
    ['en', 'ladies climb night wednesdays', [TH]],
    ['en', 'everyone signs a waiver online', [GTK]],
    ['en', 'under 14 with an adult', [A]],
    ['en', 'kids climbing camps in summer', [CAMP]],
    ['en', 'punch cards and memberships', [P, GF]],
    ['fr', 'location d’équipement en extra', [X]],
    ['fr', 'tout le monde signe une décharge', [GTK]],
    ['fr', 'soirée d’escalade pour femmes le mercredi', [TH]],
    ['fr', 'camps d’escalade l’été', [CAMP]],
  ],
  kids: [
    ['en', 'kids 12, adults free', [P]],
    ['en', 'toddler time is cheaper', [P]],
    ['en', 'grip socks required, $3 to buy', [GTK]],
    ['en', 'busy on rainy weekends', [BZ]],
    ['en', 'toddler mornings tue and thu', [TH, P]],
    ['en', 'kids 0 to 12 only, parents stay', [A]],
    ['en', 'party packages with a party room', [G]],
    ['en', 'pd day camps', [CAMP]],
    ['fr', 'les chaussettes antidérapantes sont obligatoires', [GTK]],
    ['fr', 'temps des tout-petits mardi et jeudi matin', [TH, P]],
    ['fr', 'forfaits de fête avec salle', [G]],
    ['fr', 'camps pendant la relâche', [CAMP]],
    // Indoor test 9 (Melissa's play centre): her Help log, EN + FR.
    ['en', 'socks required, $3 if you forget', [GTK]],
    ['en', 'kids under 1 are cheaper how do i show that', [P]],
    ['fr', 'chaussettes obligatoires, 3 $ si vous oubliez', [GTK]],
    ['fr', 'les bébés de moins d’un an paient moins cher', [P]],
    ['fr', 'nous vendons des cartes de 10 entrées', [P]],
    ['fr', 'le bouton devrait dire réserver une fête', [BK]],
    ['fr', 'nous sommes pour les enfants de 0 à 10 ans', [A]],
    ['fr', 'heure adaptée aux besoins sensoriels chaque mardi', [GTK]],
  ],
  classes: [
    ['en', 'drop in is 25 plus the piece', [P]],
    ['en', 'courses run 6 weeks', [C]],
    ['en', 'evening classes outside our hours', [CN]],
    ['en', 'paint night every friday', [TH]],
    ['en', 'all ages painting but 14+ wheel', [A]],
    ['en', 'byob for paint and sip', [B]],
    ['en', 'team building workshops', [G]],
    ['en', 'kids summer art camps', [CAMP]],
    ['fr', 'les cours durent 6 semaines', [C]],
    ['fr', 'soirée peinture chaque vendredi', [TH]],
    ['fr', 'apportez votre vin', [B]],
    ['fr', 'camps d’art pour enfants l’été', [CAMP]],
  ],
  curling: [
    ['en', 'learn to curl is 30 a person, ice rental 150 a sheet', [P, X, M]],
    ['en', 'leagues have the ice mon to thu', [BZ]],
    ['en', 'learn to curl nights fridays', [TH]],
    ['en', 'ages 8 and up', [A]],
    ['en', 'we have a licensed lounge upstairs', [B]],
    ['en', 'corporate curling parties', [G]],
    ['en', 'season is october to march', [S]],
    ['en', 'bring clean shoes', [GTK]],
    ['fr', 'les ligues occupent la glace en semaine', [BZ]],
    ['fr', 'salon avec permis d’alcool à l’étage', [B]],
    ['fr', 'la saison va d’octobre à mars', [S]],
    ['fr', 'événements de curling pour entreprises', [G]],
  ],
  yoga: [
    ['en', 'drop in 20, 10 class pass 180', [P]],
    ['en', 'mat rental $2', [X]],
    ['en', 'evening classes fill up', [BZ, CN]],
    ['en', 'candlelight yoga fridays', [TH]],
    ['en', '16 and up', [A]],
    ['en', 'private group classes and corporate', [G]],
    ['en', 'bring your own mat or rent one', [X, GTK]],
    ['en', 'do i have to fill everything', [FA]],
    ['fr', 'location de tapis 2 $', [X]],
    ['fr', 'les cours du soir sont pleins', [BZ, CN]],
    ['fr', 'yoga aux chandelles le vendredi', [TH]],
    ['fr', '16 ans et plus', [A]],
  ],
  casino: [
    ['en', 'free to get in', [F]],
    ['en', '19+ with id', [A]],
    ['en', 'busiest friday and saturday night', [BZ]],
    ['en', 'live music in the lounge saturdays', [TH, B]],
    ['en', 'we have a bar and restaurant, can i add happy hour', [B]],
    ['en', 'bus tour groups', [G]],
    ['en', 'poker tournaments every tuesday', [TH]],
    ['en', 'do i need to fill all this', [FA]],
    ['fr', 'entrée gratuite', [F]],
    ['fr', '19 ans et plus avec pièce d’identité', [A]],
    ['fr', 'tournoi de poker chaque mardi', [TH]],
    ['fr', 'voyages en autocar', [G]],
  ],
  library: [
    ['en', 'its free, library cards are free', [F]],
    ['en', 'story time saturdays at 10:30', [TH]],
    ['en', 'quiet study hours in the morning', [BZ, GTK]],
    ['en', 'kids programs register online', [BK, E]],
    ['en', 'class visits', [G]],
    ['en', 'meeting rooms to book', [G]],
    ['en', 'summer reading club', [E, TH, S]],
    ['en', 'do i have to fill this all out, we are a small branch', [FA]],
    ['fr', 'l’heure du conte le samedi', [TH]],
    ['fr', 'c’est gratuit', [F]],
    ['fr', 'visites de classes', [G]],
    ['fr', 'club de lecture d’été', [E, TH, S]],
  ],
  museum: [
    ['en', 'adults 12, seniors 10, kids under 6 free', [P]],
    ['en', 'by donation, suggested $5', [F]],
    ['en', 'school groups most weekday mornings', [BZ, G]],
    ['en', 'family sundays with crafts', [TH]],
    ['en', 'members get in free', [P, GF]],
    ['en', 'guided tours by appointment', [G]],
    ['en', 'summer only, may to september', [S]],
    ['en', 'no flash photos', [GTK]],
    ['fr', 'groupes scolaires la plupart des matins de semaine', [BZ, G]],
    ['fr', 'dimanches en famille avec bricolage', [TH]],
    ['fr', 'ouvert seulement l’été', [S]],
    ['fr', 'pas de photos avec flash', [GTK]],
  ],
  gallery: [
    ['en', 'free entry, art for sale', [F]],
    ['en', 'first friday openings 6 to 8', [O]],
    ['en', 'new exhibition every month', [E]],
    ['en', 'can i list our artists', [AR]],
    ['en', 'we ship art', [GTK]],
    ['en', 'wine at the openings, do i say licensed', [B, O]],
    ['en', 'private events after hours', [G]],
    ['en', 'art classes for kids on saturdays', [G, CN, E, TH]],
    ['fr', 'vernissage le premier vendredi', [O]],
    ['fr', 'entrée gratuite, œuvres à vendre', [F]],
    ['fr', 'nous expédions les œuvres', [GTK]],
    ['fr', 'événements privés après les heures', [G]],
  ],
  other: [
    ['en', 'what price do i put', [P]],
    ['en', 'equipment rental extra', [X]],
    ['en', 'busy on weekends', [BZ, BK]],
    ['en', 'theme nights every friday', [TH]],
    ['en', 'all ages', [A]],
    ['en', 'we have a bar', [B]],
    ['en', 'birthday parties', [G]],
    ['en', 'waiver required', [GTK]],
    ['fr', 'quel prix mettre', [P]],
    ['fr', 'soirées à thème chaque vendredi', [TH]],
    ['fr', 'fêtes d’anniversaire', [G]],
    ['fr', 'décharge obligatoire', [GTK]],
  ],
};

test('the Help matrix covers every indoor kind with 8–10 English questions and French twins', () => {
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const rows = MATRIX[k] || [];
    const en = rows.filter((r) => r[0] === 'en').length, fr = rows.filter((r) => r[0] === 'fr').length;
    assert.ok(en >= 8 && en <= 10, `${k}: ${en} English questions`);
    assert.ok(fr >= 4, `${k}: ${fr} French questions`);
  }
});

test('every indoor kind’s owner questions land on the right answer (EN + FR)', async () => {
  const wrong = [];
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const b = await botsFor(k);
    for (const [lang, q, want] of MATRIX[k]) {
      const r = (lang === 'fr' ? b.fr : b.en).best(q);
      if (!r || !want.includes(r.id)) wrong.push(`${k} [${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    }
  }
  assert.deepEqual(wrong, []);
});

// Indoor test 8 (Gary): the routes his report asked for, on the setup and on his prices page, and what they say.
test('indoor test 8: leagues are Good to know, cosmic bowling is Known for plus a weekly event, shoe rental and lanes by the hour are Your prices (never Per room or group)', async () => {
  const b = await botsFor('bowling');
  for (const bot of [b.en, b.men]) {
    for (const q of ['price is per game but lanes can be booked by the hour', 'shoe rental extra']) assert.equal(bot.best(q).id, X, q);
  }
  for (const q of ['leagues use most lanes weeknights', 'open bowling is limited after 6 mon to thu because of leagues']) assert.equal(b.en.best(q).id, BZ, q);
  assert.equal(b.en.best('cosmic bowling friday and saturday nights').id, TH);
  const busy = plain(b.en.topic(BZ).a), theme = plain(b.en.topic(TH).a), extras = plain(b.en.topic(X).a);
  assert.match(busy, /Keep your hours as your open-door hours/);
  assert.match(busy, /Good to know/);
  assert.match(busy, /Leagues use most lanes Mon–Thu after 6, call ahead/);
  assert.match(theme, /Known for/);
  assert.match(theme, /Cosmic bowling Fri & Sat 9 PM–midnight/);
  assert.match(theme, /Add an event/);
  assert.match(theme, /every Friday and Saturday/);
  assert.match(extras, /Your prices/);
  assert.match(extras, /per game|one game/i);
  assert.match(extras, /Shoes \$3, lane \$45 an hour/);
  assert.doesNotMatch(extras, /Per room or group/);
  assert.doesNotMatch(busy + theme + extras, /happy hour/i);
  // French twins.
  assert.match(plain(b.fr.topic(BZ).aFr), /Les ligues occupent la plupart des allées du lun\. au jeu\. après 18 h, appelez avant/);
  assert.match(plain(b.fr.topic(TH).aFr), /Connu pour/);
  assert.doesNotMatch(plain(b.fr.topic(X).aFr), /Par salle ou groupe/);
  // Each kind reads its own examples.
  const spa = await botsFor('spa');
  assert.doesNotMatch(plain(spa.en.topic(BZ).a) + plain(spa.en.topic(TH).a), /bowling|lanes/i);
});

// Indoor test 10 (2026-11-19; Sandra, communications coordinator for a city aquatic centre): every question in her Help
// log, with where it belongs, and a French twin of each.
const OWNER = ['not-owner', 'staff'], PR = 'photo-rights', CC = 'closures-count', AO = 'indoor-also-offer', AC = 'indoor-access';
const SANDRA = [
  ['I work for the city, not the owner. Am I allowed to fill this in?', OWNER, 'je travaille pour la ville, pas le propriétaire. Ai-je le droit de remplir ceci?'],
  ['annual maintenance shutdown in August', [YB], 'fermeture annuelle pour entretien en août'],
  ['we close 2 weeks every August for maintenance, the dates change a bit each year', [YB], 'nous fermons 2 semaines chaque mois d’août pour l’entretien, les dates changent un peu chaque année'],
  ['prices for adult youth child family', [P], 'prix pour adulte, jeune, enfant et famille'],
  ['can we link our schedule PDF', [SW], 'peut-on mettre un lien vers notre horaire en PDF'],
  ['swim times change every season', [SW], 'les heures des bains changent selon la saison'],
  ['kids under 8 must be with an adult in the water, where does that go', [A], 'les enfants de moins de 8 ans doivent être avec un adulte dans l’eau'],
  ['the photos belong to the City of Vernon, not me. Can I still tick this?', [PR], 'les photos appartiennent à la Ville de Vernon, pas à moi. Puis-je quand même cocher la case?'],
  ['we are closed on all stat holidays, every year', CLOSE, 'nous sommes fermés tous les jours fériés, chaque année'],
  ['it says you can list up to 20 closures but I only picked 12', [CC], 'on indique jusqu’à 20 fermetures mais j’en ai choisi seulement 12'],
  ['I work for the city, not the owner', OWNER, 'je travaille pour la ville, je ne suis pas le propriétaire'],
  ['where do I put our weight room and fitness classes', [AO], 'où mettre notre salle de musculation et nos cours de mise en forme'],
  ['accessible change rooms and a pool lift', [AC], 'vestiaires accessibles et lève-personne pour la piscine'],
  ['10 visit passes and memberships', [P], 'cartes de 10 entrées et abonnements'],
  ['how do I change the photos order', ['photo-order'], 'comment changer l’ordre des photos'],
  ['the shutdown dates change a bit every year', [YB], 'les dates de l’arrêt pour entretien changent un peu chaque année'],
];
const SANDRA_WANT = Object.fromEntries(SANDRA.map(([q, want]) => [q, want]));
test('indoor test 10: Sandra\'s Help questions (a city pool) land on the right answer, in English and in French', async () => {
  const b = await botsFor('pool');
  const wrong = [];
  for (const [q, want, qFr] of SANDRA) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  // What the answers say.
  assert.match(plain(b.en.topic(PR).a), /Yes, if you’re allowed to share them/);
  assert.match(plain(b.en.topic(CC).a), /counts once, even with This year and next/);
  assert.match(plain(b.en.topic(SW).a), /Swim times change by season, see our website/);
  assert.match(plain(b.en.topic(SW).a), /Website button links to it/);
  assert.match(plain(b.en.topic(YB).a), /dates change a bit each year/);
  assert.match(plain(b.en.topic(AO).a), /Known for/);
  assert.match(plain(b.fr.topic(PR).aFr), /Oui, si vous avez le droit de les partager/);
  assert.match(plain(b.en.topic(P).a), /Adult drop-in \$6\.50/); // indoor test 12: a pool's drop-in is one exact price, as the page says it
  assert.doesNotMatch(plain(b.en.topic(P).a), /\$25/);
});

// Indoor test 11 (2026-11-19; Kim, staff at a non-profit science centre): every question in her Help log, with where it
// belongs, and a French twin of each.
const HO = 'indoor-holiday-open', SD = 'indoor-summer-daily', LO = 'indoor-local-owned', FRN = 'indoor-french';
const KIM = [
  ['school field trips by booking', [BK, G], 'sorties scolaires sur réservation'],
  ['we\'re a non-profit, does locally owned apply', [LO], 'nous sommes un organisme sans but lucratif, la propriété locale s’applique-t-elle?'],
  ['the photos belong to the science centre not me, can I tick this', [PR], 'les photos appartiennent au centre des sciences, pas à moi, puis-je cocher la case?'],
  ['science saturdays demos at 11 and 2', [TH], 'démonstrations scientifiques chaque samedi à 11 h et 14 h'],
  ['summer and spring break camps', [CAMP], 'camps d’été et de la relâche'],
  ['we do a free demo every saturday at 11am and 2pm, where does that go', [TH], 'nous faisons une démonstration gratuite chaque samedi à 11 h et 14 h, où la mettre?'],
  ['we open extra on long weekend mondays', [HO], 'nous ouvrons aussi les lundis des longues fins de semaine'],
  ['open daily in july and august', [SD], 'ouvert tous les jours en juillet et août'],
  ['we\'re a non-profit, staff not owner', OWNER, 'nous sommes un organisme sans but lucratif, je suis employée, pas propriétaire'],
  ['family pass price', [P], 'prix du laissez-passer familial'],
  ['where do memberships go', [P, GF], 'où mettre les abonnements'],
  ['we open on long weekend mondays', [HO], 'nous ouvrons les lundis des longues fins de semaine'],
  ['open on family day and thanksgiving monday', [HO], 'ouvert le jour de la Famille et le lundi de l’Action de grâce'],
  ['planetarium shows need booking', [BK, GTK], 'les spectacles du planétarium se réservent'],
  ['weight room and fitness classes', [AO], 'salle de musculation et cours de mise en forme'],
  ['shutdown dates change every year', [YB], 'les dates de fermeture changent chaque année'],
  ['our schedule is a pdf on our website', [SW, GTK], 'notre horaire est un PDF sur notre site'],
  ['will my page be in french', [FRN], 'ma page sera-t-elle en anglais aussi?'],
  ['is it ok to say wheelchair accessible if the planetarium is upstairs', [AC], 'puis-je dire accessible en fauteuil roulant si le planétarium est à l’étage?'],
  ['summer camps and spring break camps', [CAMP], 'camps d’été et camps de la relâche'],
  // Her other words for the same things.
  ['open stat holidays', [HO], 'ouvert les jours fériés'],
  ['long weekend mondays', [HO], 'les lundis des longues fins de semaine'],
  ['open on thanksgiving monday', [HO], 'ouvert le lundi de l’Action de grâce'],
  ['open every day in july and august', [SD], 'ouverts tous les jours en juillet et en août'],
  ['open 7 days in summer', [SD], 'ouvert 7 jours sur 7 l’été'],
];
const KIM_WANT = Object.fromEntries(KIM.map(([q, want]) => [q, want]));
test('indoor test 11: Kim\'s Help questions (a science centre) land on the right answer, in English and in French; open daily in some months is never "We\'re closed part of the year"', async () => {
  const b = await botsFor('museum');
  const wrong = [];
  for (const [q, want, qFr] of KIM) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  // The opposite guard: being open more in some months never goes to the closed-months answer, for every kind; being
  // closed in some months still does.
  const OPEN_MORE = ['open daily in july and august', 'open every day in summer', 'we are open 7 days a week in july', 'open daily during spring break', 'ouvert tous les jours en juillet et août', 'ouvert 7 jours sur 7 l’été'];
  const CLOSED = ['we are closed july and august', 'closed for the summer', 'nous sommes fermés en juillet et août'];
  for (const kind of ['museum', 'pool', 'gallery', 'kids', 'bowling', 'theatre']) {
    const bk = await botsFor(kind);
    for (const q of OPEN_MORE) { const r = (/[éû’]|ouvert/.test(q) ? bk.fr : bk.en).best(q); if (!r || r.id === CM || r.id === 'setup-season' || r.id === 'indoor-seasonal') wrong.push(`${kind} "${q}" -> ${r && r.id}`); }
    for (const q of CLOSED) { const r = (/[éû’]/.test(q) ? bk.fr : bk.en).best(q); if (!r || r.id !== CM) wrong.push(`${kind} closed "${q}" -> ${r && r.id}`); }
  }
  assert.deepEqual(wrong, []);
  // What the answers say.
  const ho = plain(b.en.topic(HO).a), hoFr = plain(b.fr.topic(HO).aFr);
  assert.match(ho, /Open on holidays \(stat holidays and Christmas week\)/);
  assert.match(ho, /Open this holiday/);
  assert.match(ho, /Family Day and Thanksgiving/);
  assert.match(hoFr, /Ouvrir ce jour férié/);
  const sd = plain(b.en.topic(SD).a);
  assert.match(sd, /Different hours in summer or winter\? , then No, different in summer/);
  assert.match(sd, /Open this day/);
  assert.match(sd, /Don’t tap We’re closed part of the year/);
  assert.match(plain(b.en.topic(LO).a), /non-profits, societies, co-ops and community groups count when they’re run locally/);
  assert.match(plain(b.en.topic(FRN).a), /^ ?Your page has a French version\. We write the French for your own lines, usually within a day\./);
  const th = plain(b.en.topic(TH).a);
  assert.match(th, /Known for/);
  assert.match(th, /Add an event/);
  // The price answers say the page's own words: "Admission $12" (no "from") before any lower typed price.
  // Indoor test 12: the page's own words, "from" included, so the owner side and the page agree.
  // Indoor test 18 (THE PRICE RULE): a museum's adult admission is exact: "Adult admission $12".
  assert.match(plain(b.en.topic(P).a), /“Adult admission \$12”/);
  assert.match(plain(pageOf(b.v)), /Adult admission \$12\./);
});

// Indoor test 12 (2026-11-19; Jess, a hot yoga and Pilates studio open only around its classes): every question in her Help
// log, with where it belongs, and a French twin of each.
const CH = 'indoor-class-hours';
const JESS = [
  ['we\'re only open around class times', [CH], 'nous ouvrons seulement autour des cours'],
  ['class schedule changes weekly', [CH], 'l’horaire des cours change chaque semaine'],
  ['online booking required, classes fill up', [BK], 'la réservation en ligne est obligatoire, les cours sont pleins'],
  ['intro offer 2 weeks for $49', [P, M], 'offre d’introduction 2 semaines pour 49 $'],
  ['mat rental $3', [X], 'location de tapis 3 $'],
  ['we have about 30 classes a week from 6am to 8pm, what hours do I put', [CH], 'nous avons environ 30 cours par semaine de 6 h à 20 h, quelles heures mettre?'],
  ['intro offer: 2 weeks unlimited for $49 where does that go', [P, M], 'offre d’introduction : 2 semaines illimitées pour 49 $, où la mettre?'],
  ['how do I add my class schedule', [M, CH], 'comment ajouter notre horaire des cours'],
  ['will my page be in French', [FRN], 'ma page sera-t-elle en français?'],
  ['we\'re locally owned, does that badge apply', [LO], 'nous sommes une entreprise locale, ce badge s’applique-t-il?'],
  ['we run a free community class every Sunday at 9', [TH, 'event-repeat'], 'nous offrons un cours communautaire gratuit chaque dimanche à 9 h'],
  ['can kids come', [A], 'les enfants peuvent-ils venir?'],
  ['do I need to update my hours every week', [CH], 'dois-je mettre à jour mes heures chaque semaine?'],
  ['we\'re open daily in July and August', [SD], 'nous sommes ouverts tous les jours en juillet et août'],
  // Her other words for the same things.
  ['booking is required', [BK], 'la réservation est obligatoire'],
  ['you must book online', [BK], 'il faut réserver en ligne'],
  ['new student special', [P, M], 'offre pour les nouveaux élèves'],
  ['what hours for classes', [CH], 'quelles heures pour les cours?'],
];
const JESS_WANT = Object.fromEntries(JESS.map(([q, want]) => [q, want]));
test('indoor test 12: Jess\'s Help questions (a hot yoga studio) land on the right answer, in English and in French; the class-times answer says what to put', async () => {
  const b = await botsFor('yoga');
  const wrong = [];
  for (const [q, want, qFr] of JESS) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  assert.match(plain(b.en.topic(CH).a), /put your first class start to your last class end\. Or tap We don’t have set hours : your Book link shows the schedule/);
  assert.match(plain(b.en.topic(CH).a), /You never need to update hours weekly/);
  assert.match(plain(b.en.topic(BK).a), /Tap No, please book ahead and paste your booking link/);
  // No "Free entry?" line on a paid studio's prices answer; the class kinds have the class-times answer, the others don't.
  assert.doesNotMatch(plain(b.en.topic(M).a), /Free entry\?/);
  assert.ok((await botsFor('classes')).en.topic(CH));
  for (const k of ['museum', 'pool', 'bowling', 'theatre']) assert.equal((await botsFor(k)).en.topic(CH), undefined, k);
});

// Indoor test 13 (2026-11-19; Dan, a 2-screen cinema with shows only): his Help log, EN and FR twins, with where each belongs.
const DAN = [
  ['doors open half an hour before first show', [NH], 'les portes ouvrent une demi-heure avant la première séance'],
  ['showtimes change every week', [NH], 'les horaires des films changent chaque semaine'],
  ['cheap tuesdays $8', [P], 'mardis à prix réduit 8 $'],
  ['popcorn is extra', [X], 'le maïs soufflé est en extra'],
  ['we have beer and wine, is that happy hour', [B], 'nous avons de la bière et du vin, est-ce un 5 à 7?'],
  ['can people rent the theatre', [G], 'peut-on louer la salle?'],
  // His other words for the same things.
  ['doors open before the show', [NH], 'les portes ouvrent avant le spectacle'],
  ['private screening', [G], 'projection privée'],
  ['can we do a buyout', [G], 'peut-on privatiser la salle?'],
];
const DAN_WANT = Object.fromEntries(DAN.map(([q, want]) => [q, want]));
test('indoor test 13: Dan\'s Help questions (a cinema) land on the right answer, in English and in French; the answers say what his page says and drop the open-door hours', async () => {
  const b = await botsFor('cinema');
  const wrong = [];
  for (const [q, want, qFr] of DAN) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  assert.match(plain(b.en.topic(NH).a), /Doors open 30 minutes before the first show/);
  assert.match(plain(b.en.topic(P).a), /like Cheap Tuesdays \$8 \? Type it as one of Your prices , and say it in your Known for line too/);
  assert.doesNotMatch(plain(b.en.topic(TH).a), /open-door hours|Add an event/);
  assert.match(plain(b.en.topic(BK).a), /Showtimes & tickets/);
  assert.doesNotMatch(plain(b.en.topic(BK).a), /Book a party/);
  // A kind with set hours (bowling) keeps the weekly event and its open-door hours.
  assert.match(plain((await botsFor('bowling')).en.topic(TH).a), /Add an event.*open-door hours/);
});

// Indoor test 14 (2026-11-19; Helen, executive director of a history museum): her Help log, EN and FR twins, with where
// each belongs. Doors open before a talk is an event (she has set hours); late summer Thursdays are summer hours; her family
// Saturday is Good to know plus an event, said in her own pattern.
const DO = 'indoor-doors-open', SL = 'indoor-summer-late', FD = 'indoor-family-day', LOC = 'indoor-local-owned';
const HELEN = [
  ['I am the executive director, not the owner. can I still do this', ['not-owner', 'staff'], 'je suis la directrice générale, pas la propriétaire. puis-je quand même le faire?'],
  ['we are open late thursdays in summer, till 8', [SL], 'nous sommes ouverts tard le jeudi l’été, jusqu’à 20 h'],
  ['we close from christmas to new years', ['closures', 'setup-closures', 'setup-short-closure', YB], 'nous fermons de noël au jour de l’an'],
  ['admission is by donation, suggested $5', [F], 'l’entrée est à contribution volontaire, 5 $ suggérés'],
  ['school groups need to book ahead but everyone else can walk in', [BK, G], 'les groupes scolaires doivent réserver mais les autres peuvent venir sans réserver'],
  ['we are a non-profit society, do I tick locally owned', [LOC], 'nous sommes une société sans but lucratif, est-ce que je coche propriété locale?'],
  ['monthly lecture series', ['event-repeat', FD], 'série de conférences mensuelle'],
  ['free family saturdays first saturday of the month', [FD], 'samedis en famille gratuits le premier samedi du mois'],
  ['doors open half an hour before the lecture starts', [DO], 'les portes ouvrent une demi-heure avant la conférence'],
  ['can people rent the museum for weddings or events', [G], 'peut-on louer le musée pour des mariages ou des événements?'],
  ['is the gift shop worth mentioning', [GF, GTK], 'est-ce que la boutique vaut la peine d’être mentionnée?'],
  ['how do I add our monthly lecture series to my page', ['event-repeat', 'event-add', FD], 'comment ajouter notre série de conférences mensuelle à ma page?'],
  ['we are closed sundays and mondays', ['hours', 'setup-hours-here'], 'nous sommes fermés le dimanche et le lundi'],
  // Her other words for the same things.
  ['open late in july', [SL], 'ouvert plus tard en juillet'],
  ['summer evenings we stay open later', [SL], 'les soirs d’été nous restons ouverts plus tard'],
  ['first sunday of each month is free', [FD], 'le premier dimanche de chaque mois est gratuit'],
];
const HELEN_WANT = Object.fromEntries(HELEN.map(([q, want]) => [q, want]));
test('indoor test 14: Helen\'s Help questions (a museum) land on the right answer, in English and in French; doors open is an event for a museum and the no-set-hours answer for a cinema; her pattern is echoed; locally owned names Who can come?', async () => {
  const b = await botsFor('museum');
  const wrong = [];
  for (const [q, want, qFr] of HELEN) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  assert.match(plain(b.en.topic(DO).a), /^ ?Add the talk or show as an event with its start time; say doors open 30 minutes early in its description\./);
  assert.match(plain(b.en.topic(LOC).a), /Who can come\?/);
  assert.doesNotMatch(plain(b.en.topic(LOC).a), /What you offer/);
  assert.match(plain(b.fr.topic(LOC).aFr), /Qui peut venir ?\?/);
  // Show and class kinds keep the no-set-hours answer for doors open (no doors-open topic for them).
  for (const k of ['cinema', 'theatre', 'yoga', 'classes']) { const c = await botsFor(k); assert.equal(c.en.topic(DO), undefined, k); assert.equal(c.en.best('doors open half an hour before the show').id, NH, k); }
  for (const k of ['museum', 'gallery', 'bowling', 'pool', 'library']) assert.equal((await botsFor(k)).en.best('doors open half an hour before the talk').id, DO, k);
});
// Indoor test 15 (2026-11-19; Aaron, staff at a free public art gallery): his Help log, EN and FR twins, with where each
// belongs. Closed on stat holidays is the closures answer (never "Open on holidays"); renting the gallery is Groups and
// parties; a summer camp leads with Add an event; a run of months is one event with its first and last day.
const LE = 'indoor-long-event', CLOSED_HOL = ['closures', 'setup-closures'];
const AARON = [
  ["I'm staff not the owner", ['not-owner', 'staff'], 'je suis employé, pas le propriétaire'],
  ['we close on stat holidays', CLOSED_HOL, 'nous fermons les jours fériés'],
  ['admission is free but classes cost', [F], 'l’entrée est gratuite mais les cours sont payants'],
  ['our adult art classes you register online, where do I put that', [BK], 'on s’inscrit en ligne à nos cours d’art pour adultes, où le mettre?'],
  ['exhibitions change every few months', [E], 'nos expositions changent tous les quelques mois'],
  ['the gallery can be rented for events', [G], 'on peut louer la galerie pour des événements'],
  ['our exhibition runs 3 months, it says an event can span at most 31 days', [LE], 'notre exposition dure 3 mois, on dit qu’un événement peut durer au plus 31 jours'],
  ['kids art camps in summer', [CAMP], 'camps d’art pour enfants l’été'],
  ['we have a gift shop selling local art', [GF, GTK], 'nous avons une boutique qui vend de l’art local'],
  ['first friday opening reception every month', [O], 'vernissage le premier vendredi de chaque mois'],
  ['open late thursdays in summer', [SL], 'ouvert tard le jeudi l’été'],
  ['doors open at 10 for the opening', [DO, O], 'les portes ouvrent à 10 h pour le vernissage'],
  ['how do I get to 100%', ['page-complete'], 'comment arriver à 100 %'],
  ['where do our class prices go', [M, X, P, F], 'où vont les prix de nos cours'],
  ['is it ok to say no dogs, service dogs are allowed', [AC], 'puis-je dire pas de chiens, mais les chiens d’assistance sont acceptés'],
  ['we are closed on all stat holidays, is there one button', CLOSED_HOL, 'nous sommes fermés tous les jours fériés, y a-t-il un seul bouton?'],
  // His other words for the same things.
  ['event longer than a month', [LE], 'un événement de plus d’un mois'],
  ['exhibition runs 3 months', [LE], 'l’exposition dure trois mois'],
  ['it says at most 31 days', [LE], 'on dit au plus 31 jours'],
  ['we rent the gallery for events', [G], 'nous louons la galerie pour des événements'],
  ['venue rental', [G], 'location de salle'],
  ['rented for weddings and parties', [G], 'louée pour des mariages et des fêtes'],
  ['kids camps in summer', [CAMP], 'camps pour enfants l’été'],
  ['closed on stat holidays', CLOSED_HOL, 'fermé les jours fériés'],
];
const AARON_WANT = Object.fromEntries(AARON.map(([q, want]) => [q, want]));
test('indoor test 15: Aaron\'s Help questions (a free gallery) land on the right answer, in English and in French; closed on holidays is never "Open on holidays"; rentals name Private events and rentals; camps lead with Add an event; no dogs names a real button', async () => {
  const b = await botsFor('gallery');
  const wrong = [];
  for (const [q, want, qFr] of AARON) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  // Closed on stat holidays, for every kind and in French: never the open-on-holidays answers.
  for (const kind of ['gallery', 'museum', 'pool', 'bowling', 'library']) {
    const bk = await botsFor(kind);
    for (const q of ['we close on stat holidays', 'closed all stat holidays', 'we are closed on holidays']) { const r = bk.en.best(q); assert.ok(r && CLOSED_HOL.includes(r.id), `${kind} "${q}" -> ${r && r.id}`); }
    const f = bk.fr.best('nous sommes fermés les jours fériés'); assert.ok(f && CLOSED_HOL.includes(f.id), `${kind} fr -> ${f && f.id}`);
    assert.equal(bk.en.best('open on stat holidays').id, HO, kind);
  }
  const groups = plain(b.en.topic(G).a), groupsFr = plain(b.fr.topic(G).aFr);
  assert.match(groups, /Rent out your space for private events\? Tap Private events and rentals in Groups and parties/);
  assert.match(groupsFr, /Touchez Événements privés et location dans Groupes et fêtes/);
  const camp = plain(b.en.topic(CAMP).a), campFr = plain(b.fr.topic(CAMP).aFr);
  assert.match(camp, /^ ?A camp on set dates .* tap Add an event and give its first and last day/);
  assert.ok(camp.indexOf('Add an event') < camp.indexOf('Groups and parties'), 'Add an event first');
  assert.match(camp, /tap School groups welcome and add a line of your own/);
  assert.match(campFr, /touchez Ajouter un événement/);
  const acc = plain(b.en.topic(AC).a), accFr = plain(b.fr.topic(AC).aFr);
  assert.match(acc, /Tap No dogs allowed : your page shows “No dogs \(service dogs welcome\)”/);
  assert.doesNotMatch(acc, /tick Wheelchair accessible[^.]*and Service dogs welcome/);
  assert.match(accFr, /Touchez Chiens non admis : votre page indique « Pas de chiens \(chiens d’assistance bienvenus\) »/);
  const le = plain(b.en.topic(LE).a);
  assert.match(le, /End date \(multi-day\)/);
  assert.match(le, /up to 120 days/);
  assert.match(le, /Repeats or other dates\?/);
  assert.match(plain(b.fr.topic(LE).aFr), /jusqu’à 120 jours/);
  // The closures answer (not "Open on holidays") is what "we close on stat holidays" opens.
  const cl = b.en.best('we close on stat holidays');
  assert.doesNotMatch(plain(b.en.topic(cl.id).a).slice(0, 80), /Open on holidays/);
});
// Indoor test 16 (2026-11-19; Tyler, an escape room: $35 per player, 2 players minimum, everyone books ahead, 8+ with an adult):
// his Help log, EN and FR twins, with where each belongs. "can I say 2 player minimum" (it was "I'm not sure") is the
// minimum-players answer; closed Monday and Tuesday is the hours answer, which names the screen's real button (Next).
const MP = 'indoor-min-players';
const TYLER = [
  ['price per person but you can book the whole room', [R, X, P], 'prix par personne mais on peut réserver toute la salle'],
  ['booking only online by time slot', [BK], 'réservation seulement en ligne par plage horaire'],
  ['12+ or 8+ with an adult', [A], '12 ans et plus ou 8 ans et plus avec un adulte'],
  ['team building packages', [G], 'forfaits de consolidation d’équipe'],
  ['closed christmas day', CLOSED_HOL.concat(['setup-short-closure']), 'fermé le jour de Noël'],
  ['closed mon and tue', ['hours'], 'fermé lundi et mardi'],
  ['we close on stat holidays', CLOSED_HOL, 'nous fermons les jours fériés'],
  ['can people rent a room for a private party', [G], 'peut-on louer une salle pour une fête privée'],
  ['kids camps in summer', [CAMP], 'camps pour enfants l’été'],
  ['no dogs, service dogs are allowed', [AC], 'pas de chiens, les chiens d’assistance sont acceptés'],
  ['how do I add a team building package', [G, M], 'comment ajouter un forfait de consolidation d’équipe'],
  ['birthday party packages', [G], 'forfaits de fête d’anniversaire'],
  ['can I say 2 player minimum', [MP], 'puis-je dire minimum 2 joueurs'],
  // His other words for the same things.
  ['minimum 2 players', [MP], 'minimum de 2 joueurs'],
  ['minimum players per booking', [MP], 'nombre minimum de joueurs'],
  ['minimum age to book', [A], 'âge minimum pour réserver'],
];
const TYLER_WANT = Object.fromEntries(TYLER.map(([q, want]) => [q, want]));
test('indoor test 16: Tyler\'s Help questions (an escape room) land on the right answer, in English and in French; a minimum number of players is typed after the price; the hours answer names Next', async () => {
  const b = await botsFor('escape');
  const wrong = [];
  for (const [q, want, qFr] of TYLER) {
    const r = b.en.best(q), f = b.fr.best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  const mp = plain(b.en.topic(MP).a), mpFr = plain(b.fr.topic(MP).aFr);
  assert.match(mp, /In Price , type it after your price, like 35 per person, min 2 players : your page says “From \$35 per player \(2-player minimum\)”/);
  assert.match(mpFr, /minimum 2 joueurs/);
  const hours = plain(b.en.topic('hours').a), hoursFr = plain(b.fr.topic('hours').aFr);
  assert.match(hours, /Tap Next :/);
  assert.doesNotMatch(hours, /Save my hours/);
  assert.match(hoursFr, /Suivant/);
  assert.doesNotMatch(hoursFr, /Enregistrer mes heures/);
  // The ages answer shows the with-an-adult wording Tyler's Ages line now reads.
  assert.match(plain(b.en.topic(A).a), /Ages 12 and up \(8\+ with an adult\)/);
});
// Indoor test 17 (2026-11-19; Megan, a bouldering gym: a day pass, walk-ins, All ages with kids under 14 with an adult, a
// waiver link): her Help log, EN and FR twins, with where each belongs ([page, question, topics, French twin]). "plus tax"
// is Your prices' extras answer ("plus tax" after the price); "corporate team events" the Groups answer that names the
// Team building chip; "the wednesday line is old" the old-line answer (Remove, or delete it from Good to know); "what goes
// in the first line" the price typer's first line; "intro class price" Your prices, with Add an event only for set dates.
const TL17 = 'indoor-typer-first', OL = 'indoor-old-line', IC = 'indoor-intro-class';
const MEGAN = [
  ['setup', 'shoe rental extra', [X], 'location de souliers en extra'],
  ['setup', 'plus tax', [X], 'plus taxes'],
  ['setup', 'waiver online before you climb', [GTK], 'décharge en ligne avant de grimper'],
  ['setup', 'is the waiver link my booking link', [BK], 'le lien de la décharge est-il mon lien de réservation'],
  ['setup', 'kids under 14 need an adult', [A], 'les moins de 14 ans doivent être avec un adulte'],
  ['menu', 'what goes in the first line', [TL17], 'que mettre dans la première ligne'],
  ['menu', 'intro class price', [IC], 'prix du cours d’initiation'],
  ['setup', 'intro classes tuesdays and thursdays at 6', [IC, TH], 'cours d’initiation mardi et jeudi à 18 h'],
  ['setup', 'the wednesday line is old, we open at 10 now', [OL], 'la ligne du mercredi est vieille, on ouvre à 10 h maintenant'],
  ['setup', 'birthday parties weekends only', [G], 'fêtes d’anniversaire la fin de semaine seulement'],
  ['setup', 'corporate team events', [G], 'événements d’entreprise'],
  ['setup', 'that line is wrong', [OL], 'cette ligne est fausse'],
];
const MEGAN_WANT = Object.fromEntries(MEGAN.map(([, q, want]) => [q, want]));
test('indoor test 17: Megan\'s Help questions (a bouldering gym) land on the right answer, in English and in French; the answers say "plus tax", name the Team building chip, Remove for an old line, the first line\'s Day pass, and Add an event only for set dates', async () => {
  const b = await botsFor('climbing');
  const wrong = [];
  for (const [pg, q, want, qFr] of MEGAN) {
    const r = (pg === 'menu' ? b.men : b.en).best(q), f = (pg === 'menu' ? b.mfr : b.fr).best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en ${pg} "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr ${pg} "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  assert.match(plain(b.en.topic(X).a), /Write “plus tax” after the price in Your prices , like Day pass \$22 plus tax/);
  assert.match(plain(b.fr.topic(X).aFr), /plus taxes/);
  assert.match(plain(b.en.topic(G).a), /Team building and private bookings/);
  assert.match(plain(b.en.topic(G).a), /Corporate or team events/);
  assert.match(plain(b.en.topic(OL).a), /Tap Remove/);
  assert.match(plain(b.en.topic(OL).a), /Good to know/);
  assert.match(plain(b.men.topic(TL17).a), /Day pass \$22/);
  assert.match(plain(b.mfr.topic(TL17).aFr), /Laissez-passer d’un jour 22 \$/);
  assert.match(plain(b.men.topic(IC).a), /Your prices/);
  assert.match(plain(b.men.topic(IC).a), /On set dates only\? Also add each date with Add an event/);
});
// Indoor test 18 (2026-11-19; Natalie, a day spa: a $95 facial as her main price, a $70 pedicure, couples' packages,
// please book ahead, 16+): her Help log, EN and FR twins, with where each belongs ([page, question, topics, French twin]).
// A cancellation policy is a Good to know line; on Your prices (the menu page), a couples' package is a price for two,
// prices that vary per item are one line each, gift certificates are the gift answer, "the list said massage $95 but that
// was my facial price" is the first line's answer, and an intro offer for a first massage is Your prices (indoor-intro-class).
const PT = 'indoor-price-two', PV = 'indoor-price-varies';
const NATALIE = [
  ['setup', 'each treatment is a different price', [P, PV], 'chaque soin a un prix différent'],
  ['setup', 'by appointment only', [BK], 'sur rendez-vous seulement'],
  ['menu', 'couples massage package', [PT], 'forfait massage en couple'],
  ['menu', 'pedicures are different prices for each kind', [PV], 'les pédicures : chaque sorte a son prix'],
  ['menu', 'gift certificates', [GF], 'certificats cadeaux'],
  ['setup', '24 hour cancellation policy', [GTK], 'politique d’annulation de 24 heures'],
  ['setup', 'gift certificates', [GF], 'certificats cadeaux'],
  ['setup', 'couples massage package', [G, PT], 'forfait massage en couple'],
  ['setup', 'cancellation policy', [GTK], 'politique d’annulation'],
  ['setup', 'we are by appointment only, no walk ins', [BK], 'sur rendez-vous seulement, sans réservation non'],
  ['setup', 'prices plus tax', [X], 'prix plus taxes'],
  ['setup', 'it said just the number for my price', [P], 'il a dit juste le chiffre pour mon prix'],
  ['setup', 'clients must be 16 or older', [A], 'les clients doivent avoir 16 ans ou plus'],
  ['setup', 'how do I add gift certificates to my prices', [GF], 'comment ajouter des certificats cadeaux à mes tarifs'],
  ['setup', 'what goes in the first line of my prices', ['indoor-typer-first'], 'que mettre dans la première ligne de mes tarifs'],
  ['setup', 'the price list said massage $95 but that was my facial price', ['indoor-typer-first'], 'la liste disait massage 95 $ mais c’était mon prix de soin du visage'],
  ['menu', 'the price list said massage $95 but that was my facial price', ['indoor-typer-first'], 'la liste disait massage 95 $ mais c’était mon prix de soin du visage'],
  ['setup', 'corporate team events', [G], 'événements d’entreprise'],
  ['setup', 'there is an old line on my page that is wrong', [OL], 'une vieille ligne sur ma page est fausse'],
  ['setup', 'intro offer price for first massage', [IC], 'offre d’introduction pour un premier massage'],
  ['menu', 'intro offer price for first massage', [IC], 'offre d’introduction pour un premier massage'],
  ['setup', 'can I say walk-ins for pedicures but massages by appointment', [BK], 'sans réservation pour les pédicures mais les massages sur rendez-vous'],
  ['setup', 'do you need a price for the couples package', [PT], 'faut-il un prix pour le forfait pour couples'],
  ['setup', 'no show fee', [GTK], 'frais d’absence'],
];
const NATALIE_WANT = Object.fromEntries(NATALIE.filter(([pg]) => pg === 'setup').map(([, q, want]) => [q, want]));
test('indoor test 18: Natalie\'s Help questions (a day spa) land on the right answer, in English and in French, on the setup and price list pages; the answers name the cancellation line, packages, one line per price, words with the number and a first massage offer', async () => {
  const b = await botsFor('spa');
  const wrong = [];
  for (const [pg, q, want, qFr] of NATALIE) {
    const r = (pg === 'menu' ? b.men : b.en).best(q), f = (pg === 'menu' ? b.mfr : b.fr).best(qFr);
    if (!r || !want.includes(r.id)) wrong.push(`en ${pg} "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    if (!f || !want.includes(f.id)) wrong.push(`fr ${pg} "${qFr}" -> ${f && f.id} (want ${want.join(' or ')})`);
  }
  assert.deepEqual(wrong, []);
  assert.match(plain(b.en.topic(GTK).a), /cancellation policy goes here too/);
  assert.match(plain(b.fr.topic(GTK).aFr), /politique d’annulation va ici aussi/);
  assert.match(plain(b.men.topic(PT).a), /Couples’ massage package/);
  assert.match(plain(b.men.topic(PV).a), /each one on its own line/);
  assert.match(plain(b.men.topic(GF).a), /Gift cards/);
  assert.match(plain(b.en.topic(IC).a), /First massage, new clients \$79/);
  assert.match(plain(b.en.topic(IC).a), /never becomes your card’s price/);
  assert.match(plain(b.en.topic(P).a), /Just a number is enough/);
  assert.match(plain(b.men.topic('indoor-typer-first').a), /Shortest treatment \$89/);
  // Happy hour is never offered for an indoor place, on either page.
  for (const bot of [b.en, b.men]) assert.ok(!bot.topics.some((x) => /happy/i.test(x.id)), bot.topics.map((x) => x.id).filter((x) => /happy/i.test(x)).join(','));
});
// Every question in the 8 indoor help logs lands on an answer, on the page where it was asked, for the kind of place it was.
const LOG_KINDS = { 1: 'museum', 2: 'escape', 3: 'theatre', 4: 'spa', 5: 'climbing', 6: 'classes', 7: 'gallery', 8: 'bowling', 9: 'kids', 10: 'pool', 11: 'museum', 12: 'yoga', 13: 'cinema', 14: 'museum', 15: 'gallery', 16: 'escape', 17: 'climbing', 18: 'spa' };
// The misrouted ones, with where they belong.
const LOG_WANT = {
  'we price per room not per person': [R], 'how do I change the price, it says adults but we charge per room': [R],
  'school groups by appointment only': [G], 'kids get in free': [P], 'I dont speak French, do I have to update the French description': ['indoor-french'],
  'we have a small gift shop, where does that go': [GF, GTK], '60 min massage is $130 and 90 min is $175, where do those go': [M],
  'why does my card say Adults $65': [P], 'school PD day camps': [CAMP], 'what is the catch, are you going to sell me advertising': ['indoor-cost'],
  'we have a new exhibition every month': [E], 'opening night is outside my hours, do I change my hours?': [O], 'date night is per couple': ['indoor-price-two'],
  'leagues use most lanes weeknights': [BZ], 'open bowling is limited after 6 mon to thu because of leagues': [BZ], 'cosmic bowling friday and saturday nights': [TH],
  'price is per game but lanes can be booked by the hour': [X], 'shoe rental extra': [X], 'we have a licensed lounge': [B], 'how do i add cosmic bowling as a weekly event': [TH, 'event-repeat'],
  // Indoor test 9 (Melissa): socks and sensory hours are Good to know (with the weekly event in its answer), cheaper little
  // ones and passes are Your prices, the Book button's words are Booking, her 0 to 10 is the ages answer.
  'socks required, $3 if you forget': [GTK], 'we have a sensory friendly hour tuesdays': [GTK], 'how do i add our sensory hour as a weekly thing': [GTK],
  'kids under 1 are cheaper how do i show that': [P], 'we sell 10 visit passes': [P], 'the book button should say book a party': [BK],
  'the age thing only goes up to all ages but we are 0 to 10': [A], 'price is per kid, parents are free': [P], 'party rooms book online but play is drop in': [BK],
  'grip socks are mandatory where does that go': [GTK],
  // Indoor test 10 (Sandra, a city pool): her five "I'm not sure"s and the ones that need a better answer.
  ...SANDRA_WANT,
  // Indoor test 11 (Kim, a science centre).
  ...KIM_WANT,
  // Indoor test 12 (Jess, a hot yoga studio).
  ...JESS_WANT,
  // Indoor test 13 (Dan, a cinema).
  ...DAN_WANT,
  // Indoor test 14 (Helen, a museum).
  ...HELEN_WANT,
  // Indoor test 15 (Aaron, a gallery).
  ...AARON_WANT,
  // Indoor test 16 (Tyler, an escape room).
  ...TYLER_WANT,
  // Indoor test 17 (Megan, a bouldering gym).
  ...MEGAN_WANT,
  // Indoor test 18 (Natalie, a day spa).
  ...NATALIE_WANT,
};
test('every question in the 8 indoor help logs lands on an answer (the misrouted ones on the right one)', async () => {
  const wrong = [];
  for (const [i, kind] of Object.entries(LOG_KINDS)) {
    const f = path.join(__dirname, '..', '..', '..', 'drafts', `fresh-eyes-indoor${i}-2026-11-19`, 'help-log.json');
    if (!fs.existsSync(f)) continue;
    for (const x of JSON.parse(fs.readFileSync(f, 'utf8')).filter((y) => y.q && !/^\[/.test(y.q))) {
      // Indoor test 13's log also rechecks Jess's yoga studio (its "reg-yoga" shots): those are asked of a yoga studio.
      const b = await botsFor(/reg-yoga/.test(x.shot || '') ? 'yoga' : kind);
      const r = (/\/menu/.test(x.hash) ? b.men : b.en).best(x.q);
      if (!r || !r.id) wrong.push(`log ${i} (${kind}) "${x.q}" -> nothing`);
      else if (LOG_WANT[x.q] && !LOG_WANT[x.q].includes(r.id)) wrong.push(`log ${i} (${kind}) "${x.q}" -> ${r.id} (want ${LOG_WANT[x.q].join(' or ')})`);
    }
  }
  assert.deepEqual(wrong, []);
});

// Indoor test 9 (Melissa): what the answers say for a kids' place.
test('indoor test 9: a kids place is told to pick All ages and say its range, the Book a party wording, and a weekly sensory hour in Good to know plus an event (EN + FR)', async () => {
  const b = await botsFor('kids');
  for (const q of ['punch pass', 'we sell memberships', 'kids under 1 are cheaper how do i show that']) assert.equal(b.en.best(q).id, P, q);
  const age = plain(b.en.topic(A).a), ageFr = plain(b.fr.topic(A).aFr);
  assert.match(age, /Pick All ages , and say your age range in your story or Good to know/);
  assert.match(ageFr, /Choisissez Tous les âges , et indiquez votre tranche d’âge/);
  const bk = plain(b.en.topic(BK).a), bkFr = plain(b.fr.topic(BK).aFr);
  assert.match(bk, /Party or group booking link/);
  assert.match(bk, /Book a party/);
  assert.match(bkFr, /Réserver une fête/);
  const gtk = plain(b.en.topic(GTK).a), gtkFr = plain(b.fr.topic(GTK).aFr);
  assert.match(gtk, /Sensory-friendly hour Tuesdays 9–10 AM/);
  assert.match(gtk, /Add an event/);
  assert.match(gtk, /every Tuesday/);
  assert.match(gtkFr, /chaque mardi/);
  assert.match(gtk, /Coffee for parents|Grip socks required/);
  // Another kind's ages answer has no kids' range line.
  const spa = await botsFor('spa');
  assert.doesNotMatch(plain(spa.en.topic(A).a), /age range/);
});
