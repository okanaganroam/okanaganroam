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
  bots[kind] = { en: helpBot(await get(`/owner/${t}/setup`)), fr: helpBot(await get(`/fr/owner/${t}/setup`)), men: helpBot(await get(`/owner/${t}/menu`)), mfr: helpBot(await get(`/fr/owner/${t}/menu`)) };
  return bots[kind];
};

// Topic ids, short.
const P = 'indoor-price', F = 'indoor-free', R = 'indoor-per-room', X = 'indoor-extras', B = 'indoor-bar', BK = 'indoor-booking', BZ = 'indoor-busy-times',
  TH = 'indoor-theme-nights', A = 'indoor-age', G = 'indoor-groups', GTK = 'indoor-good-to-know', S = 'indoor-seasonal', FA = 'indoor-fill-all', M = 'menu-add',
  E = 'indoor-exhibits', O = 'indoor-openings', CN = 'indoor-class-nights', C = 'indoor-courses', NH = 'indoor-no-hours', TP = 'indoor-ticket-prices', SW = 'indoor-swim-times',
  GF = 'indoor-gift', CM = 'indoor-closed-months', YB = 'indoor-yearly-break', AR = 'indoor-artists';
const CLOSE = [YB, 'setup-short-closure', 'closures'];

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
    ['en', 'price is per person but min 2 players', [P, R]],
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
    ['en', 'kids climbing camps in summer', [G]],
    ['en', 'punch cards and memberships', [P, GF]],
    ['fr', 'location d’équipement en extra', [X]],
    ['fr', 'tout le monde signe une décharge', [GTK]],
    ['fr', 'soirée d’escalade pour femmes le mercredi', [TH]],
    ['fr', 'camps d’escalade l’été', [G]],
  ],
  kids: [
    ['en', 'kids 12, adults free', [P]],
    ['en', 'toddler time is cheaper', [P]],
    ['en', 'grip socks required, $3 to buy', [GTK]],
    ['en', 'busy on rainy weekends', [BZ]],
    ['en', 'toddler mornings tue and thu', [TH, P]],
    ['en', 'kids 0 to 12 only, parents stay', [A]],
    ['en', 'party packages with a party room', [G]],
    ['en', 'pd day camps', [G]],
    ['fr', 'les chaussettes antidérapantes sont obligatoires', [GTK]],
    ['fr', 'temps des tout-petits mardi et jeudi matin', [TH, P]],
    ['fr', 'forfaits de fête avec salle', [G]],
    ['fr', 'camps pendant la relâche', [G]],
  ],
  classes: [
    ['en', 'drop in is 25 plus the piece', [P]],
    ['en', 'courses run 6 weeks', [C]],
    ['en', 'evening classes outside our hours', [CN]],
    ['en', 'paint night every friday', [TH]],
    ['en', 'all ages painting but 14+ wheel', [A]],
    ['en', 'byob for paint and sip', [B]],
    ['en', 'team building workshops', [G]],
    ['en', 'kids summer art camps', [G]],
    ['fr', 'les cours durent 6 semaines', [C]],
    ['fr', 'soirée peinture chaque vendredi', [TH]],
    ['fr', 'apportez votre vin', [B]],
    ['fr', 'camps d’art pour enfants l’été', [G]],
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

// Every question in the 8 indoor help logs lands on an answer, on the page where it was asked, for the kind of place it was.
const LOG_KINDS = { 1: 'museum', 2: 'escape', 3: 'theatre', 4: 'spa', 5: 'climbing', 6: 'classes', 7: 'gallery', 8: 'bowling' };
// The misrouted ones, with where they belong.
const LOG_WANT = {
  'we price per room not per person': [R], 'how do I change the price, it says adults but we charge per room': [R],
  'school groups by appointment only': [G], 'kids get in free': [P], 'I dont speak French, do I have to update the French description': ['indoor-french'],
  'we have a small gift shop, where does that go': [GF, GTK], '60 min massage is $130 and 90 min is $175, where do those go': [M],
  'why does my card say Adults $65': [P], 'school PD day camps': [G], 'what is the catch, are you going to sell me advertising': ['indoor-cost'],
  'we have a new exhibition every month': [E], 'opening night is outside my hours, do I change my hours?': [O], 'date night is per couple': ['indoor-price-two'],
  'leagues use most lanes weeknights': [BZ], 'open bowling is limited after 6 mon to thu because of leagues': [BZ], 'cosmic bowling friday and saturday nights': [TH],
  'price is per game but lanes can be booked by the hour': [X], 'shoe rental extra': [X], 'we have a licensed lounge': [B], 'how do i add cosmic bowling as a weekly event': [TH, 'event-repeat'],
};
test('every question in the 8 indoor help logs lands on an answer (the misrouted ones on the right one)', async () => {
  const wrong = [];
  for (const [i, kind] of Object.entries(LOG_KINDS)) {
    const f = path.join(__dirname, '..', '..', '..', 'drafts', `fresh-eyes-indoor${i}-2026-11-19`, 'help-log.json');
    if (!fs.existsSync(f)) continue;
    const b = await botsFor(kind);
    for (const x of JSON.parse(fs.readFileSync(f, 'utf8')).filter((y) => y.q && !/^\[/.test(y.q))) {
      const r = (/\/menu/.test(x.hash) ? b.men : b.en).best(x.q);
      if (!r || !r.id) wrong.push(`log ${i} (${kind}) "${x.q}" -> nothing`);
      else if (LOG_WANT[x.q] && !LOG_WANT[x.q].includes(r.id)) wrong.push(`log ${i} (${kind}) "${x.q}" -> ${r.id} (want ${LOG_WANT[x.q].join(' or ')})`);
    }
  }
  assert.deepEqual(wrong, []);
});
