// Sport Help matrix (2026-11-20, the sport easy setup). For every sport kind (sport-kinds.js), the questions an owner of
// that kind asks in their own words (lowercase, short), in English with French twins: green fees and twilight rates, tee
// times and bays, carts and skate rentals, an opening day that moves with the snow or the greens, weather closures,
// members-only times, a city or club facility, free entry, lessons and leagues, ages, the clubhouse bar (never happy hour),
// and "do I have to fill all this out". Each is asked through the widget's own matcher (window.__ohbBest) with the real
// setup page config of a place of that kind, and must land on one of the listed topics.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-help-matrix-admin-token';
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
let n = 0;
const GOLF_KINDS = ['golf', 'simgolf', 'range'];
const PRICE = { golf: 65, simgolf: 45, range: 12, rink: 5, skatepark: 'free', discgolf: 'free', bike: 10, swim: 5, courts: 'free', skischool: 89, sportsctr: 6, sportother: 15 };
const bots = {};
const botsFor = async (kind) => {
  if (bots[kind]) return bots[kind];
  const v = app.createVenue({ name: `Sport Matrix ${kind} ${++n}`, slug: `sport-matrix-${n}`, region: 'kelowna', type: GOLF_KINDS.includes(kind) ? 'golf' : 'sport', latitude: 49.88, longitude: -119.49, address: `${n} Water St, Kelowna`, description: 'A fixture.' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const r = await fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ changes: { indoor_info: { kinds: [kind], length: '1-2h', book: 'busy', age: 'all' }, indoor_price: PRICE[kind] }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
  assert.ok([200, 201].includes(r.status), kind);
  bots[kind] = { v, en: helpBot(await get(`/owner/${t}/setup`)), fr: helpBot(await get(`/fr/owner/${t}/setup`)), edit: helpBot(await get(`/owner/${t}`)) };
  return bots[kind];
};
// Topic ids, short.
const P = 'indoor-price', F = 'indoor-free', X = 'indoor-extras', B = 'indoor-bar', BK = 'indoor-booking', BZ = 'indoor-busy-times', TH = 'indoor-theme-nights', A = 'indoor-age',
  G = 'indoor-groups', GTK = 'indoor-good-to-know', S = 'indoor-seasonal', FA = 'indoor-fill-all', M = 'menu-add', CM = 'indoor-closed-months', PV = 'indoor-price-varies', SWT = 'indoor-swim-times',
  CAMP = 'indoor-camps', SK = 'sport-kinds-other', OD = 'sport-opening-day', W = 'sport-weather', TT = 'sport-tee-times', RN = 'sport-rentals', PUB = 'sport-public', GD = 'sport-golf-details',
  MEM = 'sport-members', LS = 'sport-lessons';
const SEASON = [S, CM, OD, 'sport-season'];

// kind -> [language, question, topics it may land on]
const MATRIX = {
  golf: [
    ['en', 'what green fee do i put, we have twilight rates too', [GD, P]],
    ['en', 'our tee times are booked on chronogolf', [TT]],
    ['en', 'power carts are $25 extra', [RN, X]],
    ['en', 'opening day depends on the snow melting', [OD]],
    ['en', 'frost delays in the spring', [W]],
    ['en', 'members only before 10 on weekends', [MEM]],
    ['en', 'we host corporate tournaments', [G]],
    ['en', 'the par on our page is wrong', [GD]],
    ['en', 'can i add happy hour for the patio', [B]],
    ['en', 'do i have to fill all this out', [FA]],
    ['fr', 'nos heures de départ sont sur chronogolf', [TT]],
    ['fr', 'location de voiturettes 25 $', [RN, X]],
    ['fr', 'retards dus au gel au printemps', [W]],
    ['fr', 'est-ce que je dois tout remplir', [FA]],
  ],
  simgolf: [
    ['en', 'price is per bay per hour', [P]],
    ['en', 'peak and off peak rates', [P, PV, M]],
    ['en', 'league nights on tuesdays', [MEM, TH, BZ]],
    ['en', 'people book a bay online', [TT]],
    ['en', 'we serve food and beer', [B]],
    ['en', 'all ages but 19+ after 9pm', [A]],
    ['en', 'corporate parties and team events', [G]],
    ['en', 'lessons with our pga pro', [LS]],
    ['fr', 'réserver une baie en ligne', [TT]],
    ['fr', 'fêtes d’entreprise', [G]],
    ['fr', 'nous servons de la bière', [B]],
    ['fr', 'tous les âges mais 19 ans et plus après 21 h', [A]],
  ],
  range: [
    ['en', 'small bucket 8, large bucket 15', [P, PV, M]],
    ['en', 'we are closed november to march', SEASON],
    ['en', 'closed when it rains', [W]],
    ['en', 'club rentals at the counter', [RN]],
    ['en', 'birthday parties with mini golf', [G]],
    ['en', 'group lessons on saturdays', [LS]],
    ['en', 'do i have to answer everything', [FA]],
    ['en', 'gift cards', ['indoor-gift']],
    ['fr', 'fermé quand il pleut', [W]],
    ['fr', 'location de bâtons', [RN]],
    ['fr', 'fêtes d’anniversaire', [G]],
    ['fr', 'cartes-cadeaux', ['indoor-gift']],
  ],
  rink: [
    ['en', 'public skate times change every week', [SWT, BZ]],
    ['en', 'we are only open october to march', SEASON],
    ['en', 'skate rentals are $5', [RN, X]],
    ['en', 'helmets for kids under 12', [A, GTK]],
    ['en', 'we are run by the city', [PUB]],
    ['en', 'birthday parties on the ice', [G]],
    ['en', 'the ice goes in every october, the date changes', [OD]],
    ['en', 'kids skate free', [P]],
    ['fr', 'location de patins', [RN, X]],
    ['fr', 'nous sommes gérés par la ville', [PUB]],
    ['fr', 'fêtes d’anniversaire sur la glace', [G]],
    ['fr', 'ouvert d’octobre à mars seulement', SEASON],
  ],
  skatepark: [
    ['en', 'its free, no charge', [F]],
    ['en', 'we are a city park', [PUB]],
    ['en', 'helmets recommended', [GTK, A]],
    ['en', 'skate camps in the summer', [CAMP, LS]],
    ['en', 'closed when its wet', [W]],
    ['en', 'do i have to fill all this', [FA]],
    ['en', 'my kind of place isnt on the list', [SK]],
    ['en', 'how long do people stay', ['indoor-visit-length']],
    ['fr', 'c’est gratuit', [F]],
    ['fr', 'géré par la municipalité', [PUB]],
    ['fr', 'est-ce obligatoire de tout remplir', [FA]],
  ],
  discgolf: [
    ['en', 'free to play', [F]],
    ['en', 'league night wednesdays', [MEM, TH, BZ]],
    ['en', 'disc rentals at the local shop', [RN]],
    ['en', 'we close in winter when there is snow', SEASON.concat([W])],
    ['en', 'tournaments twice a year', [G, TH]],
    ['en', 'run by club volunteers', [PUB]],
    ['en', 'do i need to fill everything', [FA]],
    ['en', 'course map at the first tee', [GTK, GD]],
    ['fr', 'c’est gratuit', [F]],
    ['fr', 'location de disques', [RN]],
    ['fr', 'soirées de ligue', [MEM, TH, BZ]],
  ],
  bike: [
    ['en', 'track is closed during race nights', [BZ, GTK, TH]],
    ['en', 'helmets required', [GTK, A]],
    ['en', 'practice night is $10', [P]],
    ['en', 'run by club volunteers', [PUB]],
    ['en', 'open april to october', SEASON],
    ['en', 'closed when its raining', [W]],
    ['en', 'learn to ride clinics for kids', [LS]],
    ['en', 'do i have to fill all of it', [FA]],
    ['fr', 'casque obligatoire', [GTK, A]],
    ['fr', 'fermé quand il pleut', [W]],
    ['fr', 'géré par des bénévoles', [PUB]],
  ],
  swim: [
    ['en', 'the outdoor pool is open june to august', SEASON],
    ['en', 'adult swim 5, kids 3', [P]],
    ['en', 'lifeguards on duty', [GTK]],
    ['en', 'closed for thunderstorms', [W]],
    ['en', 'swim lessons', [LS]],
    ['en', 'kids under 8 need an adult in the water', [A]],
    ['en', 'we are a city pool', [PUB]],
    ['en', 'birthday parties', [G]],
    ['fr', 'fermé pendant les orages', [W]],
    ['fr', 'gérée par la ville', [PUB]],
    ['fr', 'fêtes d’anniversaire', [G]],
  ],
  courts: [
    ['en', 'first come first served', [GTK, BK]],
    ['en', 'people book a court online', [TT]],
    ['en', 'the courts are free', [F]],
    ['en', 'drop in pickleball weekday mornings', [TH, BZ]],
    ['en', 'bring your own racquet', [RN, GTK]],
    ['en', 'run by the city', [PUB]],
    ['en', 'beginner clinics', [LS]],
    ['en', 'do i need to answer all of this', [FA]],
    ['fr', 'réserver un terrain en ligne', [TT]],
    ['fr', 'les terrains sont gratuits', [F]],
    ['fr', 'gérés par la ville', [PUB]],
  ],
  skischool: [
    ['en', 'our opening day depends on the snow', [OD]],
    ['en', 'kids programs from age 3', [A]],
    ['en', 'book lessons online', [TT, BK]],
    ['en', 'rentals are not included', [RN]],
    ['en', 'private lesson is 219, group 89', [P, M, PV, LS]],
    ['en', 'kids day camps all winter', [CAMP, LS]],
    ['en', 'closed when there is not enough snow', [W, OD]],
    ['en', 'do i have to fill everything in', [FA]],
    ['fr', 'cours pour enfants dès 3 ans', [A]],
    ['fr', 'location non comprise', [RN]],
    ['fr', 'ça dépend de la neige', [OD]],
  ],
  sportsctr: [
    ['en', 'drop in times change every season', [SWT, BZ]],
    ['en', 'gym rentals by the hour', [G, RN, X]],
    ['en', 'we are a city facility', [PUB]],
    ['en', 'adult drop in 6, youth 3', [P]],
    ['en', 'birthday parties with a room', [G]],
    ['en', 'summer camps', [CAMP, LS]],
    ['en', 'wheelchair accessible with an elevator', ['indoor-access']],
    ['en', 'do i have to fill all of this in', [FA]],
    ['fr', 'installation municipale', [PUB]],
    ['fr', 'fêtes d’anniversaire', [G]],
    ['fr', 'camps d’été', [CAMP, LS]],
  ],
  sportother: [
    ['en', 'lawn bowling isnt on the list', [SK]],
    ['en', 'my kind of place is not listed', [SK]],
    ['en', 'paintball', [SK]],
    ['en', 'do i have to fill all of this', [FA]],
    ['en', 'we are open may to september', SEASON],
    ['en', 'closed for bad weather', [W]],
    ['en', 'rentals included', [RN]],
    ['en', 'run by a society', [PUB, 'indoor-local-owned']],
    ['fr', 'pas dans la liste', [SK]],
    ['fr', 'mauvais temps', [W]],
    ['fr', 'dois-je tout remplir', [FA]],
  ],
};

test('the Help matrix covers every sport kind with 8–10 English questions and French twins', () => {
  for (const k of IK.SPORT_KIND_TEXT_KINDS) {
    const rows = MATRIX[k] || [];
    const en = rows.filter((r) => r[0] === 'en').length, fr = rows.filter((r) => r[0] === 'fr').length;
    assert.ok(en >= 8 && en <= 10, `${k}: ${en} English questions`);
    assert.ok(fr >= 3, `${k}: ${fr} French questions`);
  }
});

test('every sport kind’s owner questions land on the right answer (EN + FR)', async () => {
  const wrong = [];
  for (const k of IK.SPORT_KIND_TEXT_KINDS) {
    const b = await botsFor(k);
    for (const [lang, q, want] of MATRIX[k]) {
      const r = (lang === 'fr' ? b.fr : b.en).best(q);
      if (!r || !want.includes(r.id)) wrong.push(`${k} [${lang}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('the sport answers: no happy hour, no Per room or group, no indoor-only answers; the bar answer says sports and golf places; the edit page has them too', async () => {
  const b = await botsFor('golf');
  for (const bot of [b.en, b.fr, b.edit]) {
    for (const id of ['indoor-per-room', 'indoor-exhibits', 'indoor-artists', 'indoor-openings', 'indoor-kinds-other', 'indoor-ticket-prices', 'indoor-season-list']) assert.ok(!bot.topic(id), `no ${id}`);
  }
  for (const id of ['sport-kinds-other', 'sport-opening-day', 'sport-weather', 'sport-tee-times', 'sport-golf-details', 'sport-members', 'sport-lessons', 'sport-public', 'sport-rentals']) assert.ok(b.en.topic(id) && b.edit.topic(id), id);
  assert.match(b.en.topic(B).a, /Happy hour isn’t listed for sports and golf places/);
  const price = b.en.topic(P).a;
  assert.doesNotMatch(price, /Per room or group|admission|museum/i);
  assert.match(price, /Green fees from \$65/);
  assert.ok(!b.en.topics.some((x) => x.id === 'setup-happy-split'), 'no happy hour split topic');
});
