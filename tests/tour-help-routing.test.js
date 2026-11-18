// Tour Help routing regression suite (2026-11-17). Every Help question asked in the five Whistler tour "fresh eyes" tests
// (Whistler Roam drafts/fresh-eyes-tour1..5/REPORT.md, "Help" sections; exact wording from the test runs), asked through
// the same matcher the widget uses (window.__ohbBest) with the real tour setup page config, EN and FR. Each must land on
// one of the listed topics, and never on the known-wrong answers (restaurant hours, the site-is-free answer, minimum age,
// driver licence, the restaurant price range) unless that is the topic it should get.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const vm = require("node:vm");

const DB_FILE = path.join(__dirname, "..", "okanagan.db");
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = "tour-help-admin-token";
delete process.env.BREVO_API_KEY;
const app = require("../server.js");
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners("request")[0]); await new Promise((r) => srv.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === "ohbCfg" ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
let n = 0;
const setupFor = async (type, o = {}) => {
  const v = app.createVenue({ name: `Help Routing ${++n}`, slug: `help-routing-${n}`, region: "penticton", type, latitude: 49.49, longitude: -119.59, address: `${n} Main St, Penticton`, description: "A fixture.", ...o });
  const t = app.createOwnerLink(v.id, {}).url.split("/owner/")[1];
  return { en: helpBot(await get(`/owner/${t}/setup`)), fr: helpBot(await get(`/fr/owner/${t}/setup`)) };
};
// The topics that were wrong answers in the tests; a question may only land on one of them when it is listed for it.
const WRONG = ["hours", "seasonal-hours", "season", "tour-free", "cost", "tour-age", "tour-drivers", "price-range", "links", "photo-pending", "tour-booking-only", "tour-free-trip"];

// [test-shot, language, exact question, topics it should land on]
const ASKED = [
  ["1-005", "en", "we leave at 9 and 1 every day, where do i put departure times", ["tour-times"]],
  ["1-006", "en", "we do snowmobile dec to march and atv june to sept, closed in between. how do i put 2 seasons", ["tour-season","setup-season"]],
  ["1-013", "en", "two seasons: winter sleds and summer atv, closed spring and fall", ["tour-season","setup-season","seasonal-hours"]],
  ["1-025", "en", "no atv or jeep in the list?", ["tour-kinds-other"]],
  ["1-026", "en", "we do 2 hour and half day tours, can i pick both", ["tour-lengths"]],
  ["1-030", "en", "winter is $189 and summer $149, which one do i put", ["tour-two-prices"]],
  ["1-031", "en", "private charters from 1200, is that per person?", ["tour-private-price","tour-price","tour-per-boat"]],
  ["1-035", "en", "a day ahead but same day sometimes ok if they call", ["tour-same-day","tour-lead-time"]],
  ["1-037", "en", "drivers have to be 16 with a licence, passengers 8 and up with an adult. what do i pick", ["tour-drivers"]],
  ["1-050", "en", "if theres avalanche danger or wildfire smoke we cancel and give a full refund, where do i say that", ["tour-weather"]],
  ["1-051", "en", "our shop is where we meet, then we drive them to the trailhead. how do i say that", ["tour-meeting"]],
  ["1-055", "en", "we do private charters too by booking", ["tour-groups","tour-private-price","tour-price"]],
  ["1-056", "en", "do you have somewhere for gift cards", ["tour-gift"]],
  ["1-069", "en", "how long until my page shows all this", ["setup-live-when"]],
  ["1-070", "en", "is this really free or do you charge later", ["tour-free"]],
  ["1-071", "en", "the summer price is lower, should the card say 149", ["tour-two-prices"]],
  ["2-006", "fr", "C'est vraiment gratuit? C'est quoi l'attrape?", ["tour-free"]],
  ["2-007", "fr", "On fonctionne sur réservation seulement, pas d'heures fixes. Je mets quoi?", ["tour-booking-only"]],
  ["2-011", "fr", "On opère seulement l'été, du 15 mai au 30 septembre. Où est-ce que je mets ma saison?", ["tour-season"]],
  ["2-012", "fr", "saison estivale seulement sur réservation", ["tour-booking-only","tour-season"]],
  ["2-024", "fr", "J'ai trois sorties avec des durées et des prix différents: 2 h, une demi-journée et 3 h. Je choisis laquelle?", ["tour-lengths","tour-several-prices"]],
  ["2-030", "fr", "Les groupes privés c'est 1 200 $ pour tout le raft, pas par personne. Ça va où?", ["tour-per-boat","tour-private-price","tour-price"]],
  ["2-031", "fr", "poids minimum de 90 lb pour l'eau vive, je l'écris où?", ["tour-weight"]],
  ["2-034", "fr", "Il faut réserver 48 heures à l'avance, pas de réservation le jour même. Il n'y a pas de choix 48 h?", ["tour-48h"]],
  ["2-036", "fr", "L'âge minimum est différent pour chaque sortie: 5 ans pour la descente familiale, 12 ans pour l'eau vive, tous âges pour les ours. Je coche quoi?", ["tour-ages-per-trip"]],
  ["2-037", "fr", "Le fauteuil roulant c'est oui pour le tour des ours mais non pour le rafting", ["tour-wheelchair"]],
  ["2-075", "fr", "Si le niveau d'eau est trop haut on annule et on rembourse ou on remet la sortie. Où est-ce que je l'écris?", ["tour-weather"]],
  ["2-076", "fr", "On se rencontre à notre base et on prend la navette jusqu'à la rivière. Comment je l'explique?", ["tour-meeting"]],
  ["2-077", "fr", "Est-ce que je peux vendre des certificats-cadeaux?", ["tour-gift"]],
  ["2-088", "fr", "Combien de temps avant que ça paraisse sur ma page?", ["setup-live-when"]],
  ["2-089", "fr", "Est-ce que c'est vraiment gratuit ou vous prenez une commission sur les réservations?", ["tour-free"]],
  ["3-003", "en", "I'm the office manager, not the owner. Am I allowed to fill this in?", ["not-owner","staff"]],
  ["3-004", "en", "Can my boss see what I did?", ["setup-who-sees"]],
  ["3-008", "en", "Our office is open set hours but flights are by reservation. Which do I pick?", ["tour-office-hours"]],
  ["3-009", "en", "The heliport is not in the village, how do I tell people where to go?", ["tour-meeting"]],
  ["3-018", "en", "We have winter hours AND different shoulder season hours, closed Mondays in fall. Can I add both?", ["seasonal-hours"]],
  ["3-035", "en", "Our flights are 20 minutes but heli-skiing is a full day. Which length do I pick?", ["tour-lengths"]],
  ["3-036", "en", "We do heli-hiking in summer, where does that go?", ["tour-one-trip-season"]],
  ["3-037", "en", "Heli-skiing is only in winter. How do I say that?", ["tour-one-trip-season"]],
  ["3-052", "en", "Heli-skiing needs a week's notice but scenic flights only 48 hours. Which do I pick?", ["tour-lead-time"]],
  ["3-053", "en", "Why isn't my private charter price showing?", ["tour-private-price"]],
  ["3-055", "en", "Children under 2 fly free as lap infants, heli-hiking is 12 and up and heli-skiing is 19+. What age do I pick?", ["tour-ages-per-trip","tour-age"]],
  ["3-056", "en", "We have a weight limit of 300 lb per seat. Where do I put that?", ["tour-weight"]],
  ["3-057", "en", "Only the scenic flights are wheelchair accessible, not heli-skiing. Do I tick wheelchair?", ["tour-wheelchair"]],
  ["3-077", "en", "If the weather is bad we cancel and give a full refund. Where do I say that?", ["tour-weather"]],
  ["3-078", "en", "Do you have somewhere for gift cards?", ["tour-gift"]],
  ["3-079", "en", "We do weddings and proposals. Where do I mention that?", ["tour-groups"]],
  ["3-092", "en", "How do I change something later?", ["setup-change-later"]],
  ["3-093", "en", "Will my boss get an email about what I changed?", ["setup-who-sees"]],
  ["3-094", "en", "Do you charge commission on bookings?", ["tour-free"]],
  ["4-004", "en", "I don't have an office, just a meeting spot in the plaza. Is that ok?", ["tour-meeting"]],
  ["4-005", "en", "Will people see my phone number?", ["phone"]],
  ["4-011", "en", "I don't have office hours. My walks leave at 10 and 2. What do I put here?", ["tour-times"]],
  ["4-012", "en", "My tours go at different times. The food tour is only Thursday to Sunday at 4", ["tour-times"]],
  ["4-013", "en", "walk-ups are welcome on one tour, is that by booking only?", ["tour-booking-only","tour-same-day"]],
  ["4-024", "en", "One of my walks is only in winter, December to February at 6 pm. How do I say that?", ["tour-one-trip-season"]],
  ["4-030", "en", "My history walk is an hour and a quarter and the food tour is three hours. Which one do I tap?", ["tour-lengths"]],
  ["4-031", "en", "Dogs can come on my walks but not on the food tour. Where do I say that?", ["tour-dogs"]],
  ["4-034", "en", "My history walk is free, people pay what they want (by donation). What do I put for the price?", ["tour-free-trip"]],
  ["4-035", "en", "Can I put 0?", ["tour-free-trip"]],
  ["4-046", "en", "People can just walk up for the history walk but the food tour has to be booked the day before. Which do I pick?", ["tour-same-day","tour-lead-time"]],
  ["4-047", "en", "The food tour has alcohol so it is 19 and over. The walks are all ages. What do I choose?", ["tour-ages-per-trip","tour-age"]],
  ["4-051", "en", "There is no parking, we meet in the pedestrian village. What do I tap?", ["parking-paid"]],
  ["4-052", "en", "Are strollers ok to mention? Kids are free on the history walk", ["tour-strollers"]],
  ["4-053", "en", "Some guests have food allergies or are vegetarian. Where does that go?", ["tour-allergies"]],
  ["4-057", "en", "It asks about a patio but I do walking tours. What do I write for dogs?", ["tour-dogs"]],
  ["4-072", "en", "I only have a paper brochure with my three tours on it. Can I just take a picture?", ["menu-add"]],
  ["4-073", "en", "My tours leave at different times, where do the times go?", ["tour-times"]],
  ["4-081", "en", "I can do the tours in French if people ask. Where do I say that?", ["tour-languages"]],
  ["4-082", "en", "What is the most people I can take? I never take more than 12", ["tour-max-group"]],
  ["4-083", "en", "We go rain or shine. Should I say that?", ["tour-weather"]],
  ["4-084", "en", "there is no parking where we meet", ["parking-paid"]],
  ["4-089", "en", "Do I offer gift cards here? I sell gift cards", ["tour-gift"]],
  ["4-090", "en", "I do private walks for companies and weddings", ["tour-groups"]],
  ["4-105", "en", "I think I made a mistake. How do I fix it?", ["setup-change-later"]],
  ["4-106", "en", "When will people see my page?", ["setup-live-when"]],
  ["4-107", "en", "The price says from $129 but my history walk is free. Is that wrong?", ["tour-free-trip"]],
  ["5-004", "en", "is it free", ["tour-free"]],
  ["5-005", "en", "can people book through you", ["tour-book-direct"]],
  ["5-009", "en", "thats my house address. we meet at the dock", ["tour-meeting"]],
  ["5-014", "en", "salmon season jul-oct is busy but we go all year", ["tour-busy-season"]],
  ["5-028", "en", "do i pick fishing or boat. we do both", ["tour-kinds-pick"]],
  ["5-029", "en", "how do i put whale watching too", ["tour-kinds-pick"]],
  ["5-032", "en", "4-8 hrs fishing, cruise is 2 hrs", ["tour-lengths"]],
  ["5-035", "en", "price is per boat not per person", ["tour-per-boat"]],
  ["5-036", "en", "extra person is $75 where do i put that", ["tour-several-prices"]],
  ["5-037", "en", "i have 2 prices 650 half day 1100 full day", ["tour-several-prices"]],
  ["5-050", "en", "week ahead in summer, same day ok in winter", ["tour-lead-time"]],
  ["5-055", "en", "dogs only on private trips", ["tour-dogs"]],
  ["5-056", "en", "parking is paid at the marina", ["parking-paid"]],
  ["5-057", "en", "they need a fishing licence, i can sell one online", ["tour-licence"]],
  ["5-065", "en", "how long till it shows", ["setup-live-when"]],
  ["5-075", "en", "we cancel if wind is too high, full refund. where do i say that", ["tour-weather"]],
  ["5-083", "en", "max 6 per boat, 2 boats for bigger groups", ["tour-max-group"]],
  ["5-084", "en", "a fishing trip for 6 people can they book", ["tour-groups","tour-max-group","tour-book-direct"]],
  ["5-095", "en", "page says from $650 a person but its for the whole boat", ["tour-per-boat"]],
  ["5-096", "en", "whats a private tour price", ["tour-private-price","tour-price","tour-per-boat"]],
];

test("every Help question from tour tests 1-5 lands on a right tour topic (EN + FR)", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Fishing charters & whale watching" });
  assert.equal(ASKED.length, 97);
  const wrong = [];
  for (const [k, lang, q, want] of ASKED) {
    const r = (lang === "fr" ? fr : en).best(q);
    if (!want.includes(r.id)) wrong.push(`${k} "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    else if (WRONG.includes(r.id) && !want.includes(r.id)) wrong.push(`${k} wrong topic ${r.id}`);
  }
  assert.deepEqual(wrong, []);
});

// The test 5 price and booking questions in other words, and their French: per boat / per group -> Private tours box;
// extra person / several prices -> Your tours and prices; never the free answer or the restaurant price range.
const MORE = [
  ["en", "price is per boat", ["tour-per-boat"]], ["en", "its for the whole boat", ["tour-per-boat"]], ["en", "for the whole boat not per person", ["tour-per-boat"]],
  ["en", "we charge per group not per person", ["tour-per-boat"]], ["en", "650 per boat for up to 4", ["tour-per-boat"]], ["en", "the price is for the whole group", ["tour-per-boat"]],
  ["en", "extra person", ["tour-several-prices"]], ["en", "each extra person is $75", ["tour-several-prices"]], ["en", "we have several prices", ["tour-several-prices"]],
  ["en", "i have two prices, half day and full day", ["tour-several-prices"]], ["en", "add-ons like rod rental", ["tour-several-prices"]],
  ["en", "busy season is summer but we go all year", ["tour-busy-season"]], ["en", "salmon season", ["tour-busy-season"]], ["en", "peak season july and august", ["tour-busy-season"]],
  ["en", "2-4 hrs", ["tour-lengths"]], ["en", "trips are 3-5 hours", ["tour-lengths"]], ["en", "4 to 8 hours", ["tour-lengths"]],
  ["en", "dogs on some trips", ["tour-dogs"]], ["en", "dogs on private charters only", ["tour-dogs"]],
  ["en", "do they need a fishing licence", ["tour-licence"]], ["en", "fishing license", ["tour-licence"]], ["en", "we sell fishing licences", ["tour-licence"]],
  ["en", "max per boat", ["tour-max-group"]], ["en", "group size", ["tour-max-group"]], ["en", "6 people per boat", ["tour-max-group"]],
  ["en", "can people book through you", ["tour-book-direct"]], ["en", "do you take the bookings", ["tour-book-direct"]], ["en", "can guests book on your site", ["tour-book-direct"]],
  ["en", "we do fishing and boat tours", ["tour-kinds-pick"]], ["en", "whale watching", ["tour-kinds-pick"]], ["en", "which kinds do i pick", ["tour-kinds-pick"]],
  ["en", "drivers must be 16 with a licence", ["tour-drivers"]], ["en", "is this free", ["tour-free"]], ["en", "my walk is free", ["tour-free-trip"]],
  ["fr", "le prix est par bateau", ["tour-per-boat"]], ["fr", "c’est pour tout le bateau, pas par personne", ["tour-per-boat"]], ["fr", "prix par groupe", ["tour-per-boat"]],
  ["fr", "personne supplémentaire 75 $", ["tour-several-prices"]], ["fr", "j’ai deux prix, demi-journée et journée", ["tour-several-prices"]],
  ["fr", "la haute saison c’est l’été mais on part toute l’année", ["tour-busy-season"]], ["fr", "saison du saumon", ["tour-busy-season"]],
  ["fr", "permis de pêche", ["tour-licence"]], ["fr", "maximum 6 par bateau", ["tour-max-group"]], ["fr", "est-ce que les gens peuvent réserver chez vous?", ["tour-book-direct"]],
  ["fr", "les chiens seulement sur les sorties privées", ["tour-dogs"]], ["fr", "de 4 à 8 heures", ["tour-lengths"]], ["fr", "observation des baleines", ["tour-kinds-pick"]],
  ["fr", "une semaine à l’avance l’été, le jour même l’hiver", ["tour-lead-time"]],
];
test("the test 5 price, season, licence, group and booking questions in other words (EN + FR)", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Fishing charters" });
  const wrong = [];
  for (const [lang, q, want] of MORE) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`"${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});

test("the new tour answers say where it goes: Private tours, Your tours and prices, Good to know; booking is with the owner", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(plain(en.topic("tour-per-boat").a), /Private tours/); assert.match(plain(fr.topic("tour-per-boat").aFr), /privée/i);
  assert.match(plain(en.topic("tour-several-prices").a), /Your tours and prices/); assert.match(plain(fr.topic("tour-several-prices").aFr), /Vos sorties et tarifs/);
  assert.match(plain(en.topic("tour-licence").a), /Good to know/); assert.match(plain(fr.topic("tour-licence").aFr), /Bon à savoir/);
  assert.match(plain(en.topic("tour-book-direct").a), /^ ?No\b/); assert.match(plain(en.topic("tour-book-direct").a), /Book button/);
  assert.match(plain(fr.topic("tour-book-direct").aFr), /^ ?Non\b/);
  assert.match(plain(en.topic("tour-busy-season").a), /all year/i);
  assert.match(plain(en.topic("tour-kinds-pick").a), /whale/i);
  for (const t of en.topics.filter((x) => /^tour-/.test(x.id))) assert.doesNotMatch(plain(t.a) + plain(t.aFr), /happy hour|5 [aà] 7/i, t.id);
});

test("other setup types keep their own help: no tour topics, and their usual questions still route the same", async () => {
  const rest = await setupFor("restaurant", { cuisine: "Canadian" });
  for (const id of ["tour-per-boat", "tour-several-prices", "tour-licence", "tour-book-direct", "tour-busy-season", "tour-kinds-pick"]) assert.equal(rest.en.topic(id), undefined, id);
  assert.equal(rest.en.best("price range").id, "price-range");
  assert.equal(rest.en.best("summer hours").id, "seasonal-hours");
  const win = await setupFor("winery", { cuisine: "Winery" });
  assert.equal(win.en.topic("tour-per-boat"), undefined);
});

// Tour test 6 (Whistler fresh eyes, Sophie-Anne, Android FR, 2026-11-17): a zipline, treetop course and summer e-bike
// rental company. French Help missed or misrouted 8 of 20 (one-trip season, boss, "when does it show", storms, walk-ups,
// lengths, hébertisme, birthdays); English missed "lightning". Her questions, as asked (shot numbers from the report).
const ASKED6 = [
  ["6-005", "fr", "je ne suis pas la propriétaire, je peux remplir ça?", ["not-owner","staff"]],
  ["6-006", "fr", "est-ce que mon patron va voir mes changements?", ["setup-who-sees"]],
  ["6-009", "fr", "notre bureau est au village mais le parcours est ailleurs, comment je l'explique?", ["tour-meeting"]],
  ["6-010", "fr", "il y a une navette gratuite entre notre bureau et le parcours", ["tour-meeting"]],
  ["6-013", "fr", "on a des heures d'intersaison, d'hiver et d'été, trois périodes différentes", ["seasonal-hours","setup-season"]],
  ["6-014", "fr", "les départs sont aux 30 minutes, où je mets ça?", ["tour-times"]],
  ["6-028", "fr", "la location de vélos électriques c'est l'été seulement, comment je le dis?", ["tour-one-trip-season"]],
  ["6-030", "fr", "parcours d'aventure dans les arbres (hébertisme), c'est quel genre?", ["tour-kinds-pick","tour-kinds-other"]],
  ["6-033", "fr", "tyrolienne 2h30, parcours 1h30, e-bikes 2h ou demi-journée, quelle durée?", ["tour-lengths"]],
  ["6-035", "fr", "les e-bikes c'est 69$ par vélo, pas par personne", ["tour-per-unit"]],
  ["6-044", "fr", "il faut réserver la veille, mais sans réservation s'il reste de la place", ["tour-same-day","tour-lead-time"]],
  ["6-046", "fr", "l'âge minimum est différent pour chaque activité", ["tour-ages-per-trip"]],
  ["6-047", "fr", "limite de poids de 70 à 275 lb pour la tyrolienne, je l'écris où?", ["tour-weight"]],
  ["6-048", "fr", "le stationnement est payant au parcours", ["parking-paid"]],
  ["6-068", "fr", "s'il y a des orages on ferme le parcours", ["tour-weather"]],
  ["6-072", "fr", "on fait des fêtes d'anniversaire pour les enfants, comment le dire?", ["tour-groups"]],
  ["6-073", "fr", "on fait des sorties d'entreprise et de la consolidation d'équipe", ["tour-groups"]],
  ["6-074", "fr", "on vend des cartes-cadeaux", ["tour-gift"]],
  ["6-088", "fr", "ça paraît quand sur le site?", ["setup-live-when"]],
  ["6-089", "fr", "est-ce que mon patron va voir ce que j'ai changé?", ["setup-who-sees"]],
  ["6-192", "en", "will my boss see my changes?", ["setup-who-sees"]],
  ["6-193", "en", "when does it show on the site?", ["setup-live-when"]],
  ["6-194", "en", "e-bike rentals are summer only, how do i say that?", ["tour-one-trip-season"]],
  ["6-195", "en", "lightning closes the course", ["tour-weather"]],
  ["6-196", "en", "we do kids birthday parties", ["tour-groups"]],
  // The same questions in other words (the fix list for test 6).
  ["6+", "fr", "c'est l'été seulement pour les vélos", ["tour-one-trip-season"]],
  ["6+", "fr", "les vélos seulement l'été, le reste toute l'année", ["tour-one-trip-season"]],
  ["6+", "fr", "la raquette c'est l'hiver seulement, comment le dire?", ["tour-one-trip-season"]],
  ["6+", "fr", "mon patron va voir ce que j'ai fait?", ["setup-who-sees"]],
  ["6+", "fr", "quand est-ce que ça paraît?", ["setup-live-when"]],
  ["6+", "fr", "quand est-ce que ça paraît sur ma page?", ["setup-live-when"]],
  ["6+", "fr", "on ferme le parcours quand il y a de la foudre", ["tour-weather"]],
  ["6+", "fr", "et la météo, on annule s'il y a un orage", ["tour-weather"]],
  ["6+", "en", "we close the course in a thunderstorm", ["tour-weather"]],
  ["6+", "en", "thunderstorms close the zipline", ["tour-weather"]],
  ["6+", "fr", "sans réservation s'il y a des places disponibles", ["tour-same-day","tour-lead-time"]],
  ["6+", "en", "walk-ups welcome if there is space", ["tour-same-day","tour-lead-time"]],
  ["6+", "fr", "nos activités ont des durées différentes", ["tour-lengths"]],
  ["6+", "fr", "2h30 pour la tyrolienne, 1h30 pour le parcours", ["tour-lengths"]],
  ["6+", "fr", "on a un parcours d'arbre en arbre", ["tour-kinds-pick","tour-kinds-other"]],
  ["6+", "fr", "hébertisme", ["tour-kinds-pick","tour-kinds-other"]],
  ["6+", "en", "we have a treetop ropes course, which kind?", ["tour-kinds-pick","tour-kinds-other"]],
  ["6+", "en", "adventure park, which kind do i pick", ["tour-kinds-pick","tour-kinds-other"]],
  ["6+", "fr", "navette entre notre bureau et le site", ["tour-meeting"]],
  ["6+", "en", "free shuttle from our office to the course", ["tour-meeting"]],
  ["6+", "fr", "on fait des anniversaires d'enfants", ["tour-groups"]],
  ["6+", "en", "birthday party packages for kids", ["tour-groups"]],
  ["6+", "en", "our bikes are $69 per bike", ["tour-per-unit"]],
  ["6+", "en", "price is per bike not per person", ["tour-per-unit"]],
  ["6+", "en", "we charge per rental", ["tour-per-unit"]],
  ["6+", "en", "kayak rentals are $40 an hour", ["tour-per-unit"]],
  ["6+", "fr", "c'est 69 $ par location", ["tour-per-unit"]],
  ["6+", "fr", "le prix est par vélo", ["tour-per-unit"]],
  ["6+", "fr", "on fait seulement de la location, pas de sorties", ["tour-per-unit"]],
];
// A French rephrasing of every English question from tests 1-5 (ASKED) and of the English "other words" (MORE) that had
// none: the same topics must come up in French.
const FR_TWINS = [
  ["1-005", "on part à 9 h et à 13 h tous les jours, où je mets les heures de départ", ["tour-times"]],
  ["1-006", "on fait de la motoneige de décembre à mars et du VTT de juin à septembre, fermé entre les deux. comment mettre 2 saisons", ["tour-season","setup-season"]],
  ["1-013", "deux saisons : motoneige l'hiver et VTT l'été, fermé au printemps et à l'automne", ["tour-season","setup-season","seasonal-hours"]],
  ["1-025", "pas de VTT ou de jeep dans la liste?", ["tour-kinds-other"]],
  ["1-026", "on fait des sorties de 2 heures et d'une demi-journée, je peux choisir les deux", ["tour-lengths"]],
  ["1-030", "l'hiver c'est 189 $ et l'été 149 $, lequel je mets", ["tour-two-prices"]],
  ["1-031", "les sorties privées à partir de 1200, c'est par personne?", ["tour-private-price","tour-price","tour-per-boat"]],
  ["1-035", "la veille, mais le jour même ça va parfois s'ils appellent", ["tour-same-day","tour-lead-time"]],
  ["1-037", "les conducteurs doivent avoir 16 ans avec un permis, les passagers 8 ans et plus avec un adulte. je choisis quoi", ["tour-drivers"]],
  ["1-050", "s'il y a un danger d'avalanche ou de la fumée de feux de forêt on annule et on rembourse au complet, où je le dis", ["tour-weather"]],
  ["1-051", "notre boutique est le point de rencontre, puis on les conduit au départ du sentier. comment je le dis", ["tour-meeting"]],
  ["1-055", "on fait aussi des sorties privées sur réservation", ["tour-groups","tour-private-price","tour-price"]],
  ["1-056", "avez-vous une place pour les cartes-cadeaux", ["tour-gift"]],
  ["1-069", "combien de temps avant que ma page montre tout ça", ["setup-live-when"]],
  ["1-070", "c'est vraiment gratuit ou vous chargez plus tard", ["tour-free"]],
  ["1-071", "le prix d'été est plus bas, est-ce que la fiche devrait dire 149", ["tour-two-prices"]],
  ["3-003", "Je suis la gérante du bureau, pas la propriétaire. Est-ce que j'ai le droit de remplir ça?", ["not-owner","staff"]],
  ["3-004", "Mon patron peut-il voir ce que j'ai fait?", ["setup-who-sees"]],
  ["3-008", "Notre bureau a des heures fixes mais les vols sont sur réservation. Je choisis lequel?", ["tour-office-hours"]],
  ["3-009", "L'héliport n'est pas au village, comment dire aux gens où aller?", ["tour-meeting"]],
  ["3-018", "On a des heures d'hiver ET des heures d'intersaison différentes, fermé le lundi à l'automne. Je peux ajouter les deux?", ["seasonal-hours"]],
  ["3-035", "Nos vols durent 20 minutes mais l'héliski c'est une journée complète. Quelle durée je choisis?", ["tour-lengths"]],
  ["3-036", "On fait de l'héli-randonnée l'été, ça va où?", ["tour-one-trip-season"]],
  ["3-037", "L'héliski c'est seulement l'hiver. Comment je le dis?", ["tour-one-trip-season"]],
  ["3-052", "L'héliski demande une semaine de préavis mais les vols panoramiques seulement 48 heures. Je choisis quoi?", ["tour-lead-time"]],
  ["3-053", "Pourquoi mon prix de vol nolisé privé ne s'affiche pas?", ["tour-private-price"]],
  ["3-055", "Les enfants de moins de 2 ans volent gratuitement sur les genoux, l'héli-randonnée c'est 12 ans et plus et l'héliski 19 ans et plus. Quel âge je choisis?", ["tour-ages-per-trip","tour-age"]],
  ["3-056", "On a une limite de poids de 300 lb par siège. Je mets ça où?", ["tour-weight"]],
  ["3-057", "Seuls les vols panoramiques sont accessibles en fauteuil roulant, pas l'héliski. Est-ce que je coche fauteuil roulant?", ["tour-wheelchair"]],
  ["3-077", "S'il fait mauvais on annule et on rembourse au complet. Où je le dis?", ["tour-weather"]],
  ["3-078", "Avez-vous un endroit pour les cartes-cadeaux?", ["tour-gift"]],
  ["3-079", "On fait des mariages et des demandes en mariage. Où je le mentionne?", ["tour-groups"]],
  ["3-092", "Comment je change quelque chose plus tard?", ["setup-change-later"]],
  ["3-093", "Mon patron va-t-il recevoir un courriel sur ce que j'ai changé?", ["setup-who-sees"]],
  ["3-094", "Prenez-vous une commission sur les réservations?", ["tour-free"]],
  ["4-004", "Je n'ai pas de bureau, juste un point de rencontre sur la place. Est-ce correct?", ["tour-meeting"]],
  ["4-005", "Les gens vont-ils voir mon numéro de téléphone?", ["phone"]],
  ["4-011", "Je n'ai pas d'heures de bureau. Mes visites partent à 10 h et 14 h. Je mets quoi ici?", ["tour-times"]],
  ["4-012", "Mes visites partent à des heures différentes. La visite gourmande c'est seulement du jeudi au dimanche à 16 h", ["tour-times"]],
  ["4-013", "les gens peuvent se présenter sans réserver pour une visite, est-ce que c'est sur réservation seulement?", ["tour-booking-only","tour-same-day"]],
  ["4-024", "Une de mes visites est seulement l'hiver, de décembre à février à 18 h. Comment le dire?", ["tour-one-trip-season"]],
  ["4-030", "Ma visite historique dure une heure et quart et la visite gourmande trois heures. Je touche laquelle?", ["tour-lengths"]],
  ["4-031", "Les chiens peuvent venir à mes visites à pied mais pas à la visite gourmande. Où je le dis?", ["tour-dogs"]],
  ["4-034", "Ma visite historique est gratuite, les gens donnent ce qu'ils veulent (contribution volontaire). Je mets quoi comme prix?", ["tour-free-trip"]],
  ["4-035", "Est-ce que je peux mettre 0?", ["tour-free-trip"]],
  ["4-046", "Les gens peuvent se présenter sans réserver pour la visite historique mais la visite gourmande doit être réservée la veille. Je choisis quoi?", ["tour-same-day","tour-lead-time"]],
  ["4-047", "La visite gourmande a de l'alcool donc c'est 19 ans et plus. Les visites à pied sont pour tous les âges. Je choisis quoi?", ["tour-ages-per-trip","tour-age"]],
  ["4-051", "Il n'y a pas de stationnement, on se rencontre dans le village piéton. Je touche quoi?", ["parking-paid"]],
  ["4-052", "Est-ce que je peux parler des poussettes? Les enfants sont gratuits pour la visite historique", ["tour-strollers"]],
  ["4-053", "Certains clients ont des allergies alimentaires ou sont végétariens. Ça va où?", ["tour-allergies"]],
  ["4-057", "On me parle d'une terrasse mais je fais des visites à pied. J'écris quoi pour les chiens?", ["tour-dogs"]],
  ["4-072", "J'ai seulement une brochure papier avec mes trois visites. Je peux juste prendre une photo?", ["menu-add"]],
  ["4-073", "Mes visites partent à des heures différentes, où vont les heures?", ["tour-times"]],
  ["4-081", "Je peux faire les visites en anglais si les gens le demandent. Où je le dis?", ["tour-languages"]],
  ["4-082", "C'est quoi le maximum de personnes que je peux prendre? Jamais plus de 12", ["tour-max-group"]],
  ["4-083", "On part beau temps mauvais temps. Est-ce que je devrais le dire?", ["tour-weather"]],
  ["4-084", "il n'y a pas de stationnement où on se rencontre", ["parking-paid"]],
  ["4-089", "Est-ce que j'offre des cartes-cadeaux ici? Je vends des cartes-cadeaux", ["tour-gift"]],
  ["4-090", "Je fais des visites privées pour les entreprises et les mariages", ["tour-groups"]],
  ["4-105", "Je pense que j'ai fait une erreur. Comment je la corrige?", ["setup-change-later"]],
  ["4-106", "Quand est-ce que les gens vont voir ma page?", ["setup-live-when"]],
  ["4-107", "Le prix dit à partir de 129 $ mais ma visite historique est gratuite. Est-ce une erreur?", ["tour-free-trip"]],
  ["5-004", "c'est gratuit", ["tour-free"]],
  ["5-005", "les gens peuvent-ils réserver chez vous", ["tour-book-direct"]],
  ["5-009", "c'est l'adresse de ma maison. on se rencontre au quai", ["tour-meeting"]],
  ["5-014", "la saison du saumon de juillet à octobre est occupée mais on sort toute l'année", ["tour-busy-season"]],
  ["5-028", "je choisis pêche ou bateau? on fait les deux", ["tour-kinds-pick"]],
  ["5-029", "comment j'ajoute l'observation des baleines aussi", ["tour-kinds-pick"]],
  ["5-032", "pêche 4-8 h, croisière 2 h", ["tour-lengths"]],
  ["5-035", "le prix est par bateau pas par personne", ["tour-per-boat"]],
  ["5-036", "une personne de plus c'est 75 $, où je mets ça", ["tour-several-prices"]],
  ["5-037", "j'ai 2 prix 650 demi-journée 1100 journée complète", ["tour-several-prices"]],
  ["5-050", "une semaine d'avance l'été, le jour même ça va l'hiver", ["tour-lead-time"]],
  ["5-055", "chiens seulement sur les sorties privées", ["tour-dogs"]],
  ["5-056", "le stationnement est payant à la marina", ["parking-paid"]],
  ["5-057", "il faut un permis de pêche, je peux en vendre un en ligne", ["tour-licence"]],
  ["5-065", "ça prend combien de temps avant que ça paraisse", ["setup-live-when"]],
  ["5-075", "on annule si le vent est trop fort, remboursement complet. où je le dis", ["tour-weather"]],
  ["5-083", "max 6 par bateau, 2 bateaux pour les plus grands groupes", ["tour-max-group"]],
  ["5-084", "une sortie de pêche pour 6 personnes, peuvent-ils réserver", ["tour-groups","tour-max-group","tour-book-direct"]],
  ["5-095", "la page dit à partir de 650 $ par personne mais c'est pour tout le bateau", ["tour-per-boat"]],
  ["5-096", "c'est quoi un prix de sortie privée", ["tour-private-price","tour-price","tour-per-boat"]],
  ["more", "650 par bateau jusqu'à 4 personnes", ["tour-per-boat"]],
  ["more", "le prix est pour tout le groupe", ["tour-per-boat"]],
  ["more", "on charge par groupe, pas par personne", ["tour-per-boat"]],
  ["more", "chaque personne de plus c'est 75 $", ["tour-several-prices"]],
  ["more", "on a plusieurs prix", ["tour-several-prices"]],
  ["more", "des options comme la location de cannes à pêche", ["tour-several-prices"]],
  ["more", "période de pointe en juillet et août", ["tour-busy-season"]],
  ["more", "2-4 h", ["tour-lengths"]],
  ["more", "les sorties durent de 3 à 5 heures", ["tour-lengths"]],
  ["more", "chiens à certaines sorties", ["tour-dogs"]],
  ["more", "ont-ils besoin d'un permis de pêche", ["tour-licence"]],
  ["more", "on vend des permis de pêche", ["tour-licence"]],
  ["more", "maximum par bateau", ["tour-max-group"]],
  ["more", "taille du groupe", ["tour-max-group"]],
  ["more", "6 personnes par bateau", ["tour-max-group"]],
  ["more", "prenez-vous les réservations", ["tour-book-direct"]],
  ["more", "les clients peuvent-ils réserver sur votre site", ["tour-book-direct"]],
  ["more", "on fait de la pêche et des sorties en bateau", ["tour-kinds-pick"]],
  ["more", "quels genres je choisis", ["tour-kinds-pick"]],
  ["more", "les conducteurs doivent avoir 16 ans avec un permis", ["tour-drivers"]],
  ["more", "est-ce gratuit", ["tour-free"]],
  ["more", "ma visite à pied est gratuite", ["tour-free-trip"]],
];

test("tour test 6: every Help question (FR + EN) and its rephrasings land on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Ziplines, treetop adventure course & e-bike rentals" });
  const wrong = [];
  for (const [k, lang, q, want] of ASKED6) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`${k} "${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});

test("French parity: a French rephrasing of every English question in this suite lands on the same topics", async () => {
  const { fr } = await setupFor("tour", { cuisine: "Fishing charters & whale watching" });
  const enKeys = ASKED.filter((x) => x[1] === "en").map((x) => x[0]);
  const twinKeys = new Set(FR_TWINS.map((x) => x[0]));
  assert.deepEqual(enKeys.filter((k) => !twinKeys.has(k)), [], "every English question has a French twin");
  const wrong = [];
  for (const [k, q, want] of FR_TWINS) { const r = fr.best(q); if (!want.includes(r.id)) wrong.push(`${k} "${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});

test("bare 'how do I say that' / 'comment le dire' no longer picks the one-trip season answer", async () => {
  const { en, fr } = await setupFor("tour");
  for (const k of ["tour-one-trip-season"]) {
    const t = en.topic(k);
    assert.ok(!(t.keys || []).includes("how do i say that") && !(t.keysFr || []).includes("comment le dire"), k);
  }
  assert.notEqual(fr.best("comment le dire?").id, "tour-one-trip-season");
  assert.notEqual(en.best("how do i say that?").id, "tour-one-trip-season");
  assert.match(String(en.topic("tour-per-unit").a), /Your tours and prices/); assert.match(String(fr.topic("tour-per-unit").aFr), /Vos sorties et tarifs/);
});

// Tour test 7 (Whistler, 2026-11-17; Erik, an ACMG mountain guide in Pemberton, desktop, English). His 16 questions as
// typed (shots 008-084), each with a French twin, and a few rephrasings. The 7 he found good still land where they did.
const ASKED7 = [
  ["7-008", "Courses meet at my office in Pemberton but ski tours meet at different trailheads depending on conditions. Which address do I put?", ["tour-meeting-varies"],
    "Les cours ont lieu à mon bureau, mais le ski de randonnée part de différents départs de sentier selon les conditions. Quelle adresse mettre?"],
  ["7-009", "I only do private guiding, there are no scheduled group tours. Is this site for me?", ["tour-private-only"],
    "Je fais seulement des sorties privées, pas de sorties de groupe. Ce site est-il pour moi?"],
  ["7-011", "We have no set hours, everything is by booking. Two seasons: winter Dec 15 to Apr 30 and summer Jul 1 to Sep 15, closed in between. How do I set that up?", ["tour-season", "setup-season"],
    "Pas d’heures fixes, tout est sur réservation. Deux saisons : l’hiver du 15 déc. au 30 avril et l’été du 1er juillet au 15 sept., fermé entre les deux. Comment faire?"],
  ["7-026", "I do glacier mountaineering and avalanche courses (AST 1 and AST 2). None of these buttons fit. Which do I pick?", ["tour-kinds-guide"],
    "Je fais de l’alpinisme sur glacier et des cours d’avalanche (AST 1 et AST 2). Aucun bouton ne convient. Lequel choisir?"],
  ["7-027", "Hut trips are 3 or 5 days, ski tours are one day, AST 1 is 2 days. What do I pick for how long?", ["tour-lengths", "tour-multiday"],
    "Les sorties en refuge durent 3 ou 5 jours, le ski de randonnée une journée, l’AST 1 deux jours. Quelle durée je choisis?"],
  ["7-030", "My prices are per day, not per person. Private guiding is $750 a day for up to 4 people. What do I put here?", ["tour-per-boat"],
    "Mes prix sont par jour, pas par personne. Le guide privé coûte 750 $ par jour jusqu’à 4 personnes. Qu’est-ce que je mets ici?"],
  ["7-031", "Can I hide the per person price? Most of my work is private.", ["tour-hide-price"],
    "Puis-je cacher le prix par personne? La plupart de mes sorties sont privées."],
  ["7-037", "Private days need a week notice but the AST courses fill up months ahead. How do I say that?", ["tour-lead-time"],
    "Les journées privées demandent une semaine de préavis, mais les cours AST sont complets des mois à l’avance. Comment le dire?"],
  ["7-038", "I take a 30% deposit, full refund up to 30 days before. Where does that go?", ["tour-weather"],
    "Je prends un dépôt de 30 %, remboursement complet jusqu’à 30 jours avant. Où est-ce que ça va?"],
  ["7-039", "AST 1 runs on scheduled dates, like Jan 10-11 and Feb 7-8. Where do I list the course dates?", ["tour-course-dates"],
    "L’AST 1 a lieu à des dates fixes, comme les 10-11 janvier et 7-8 février. Où inscrire les dates des cours?"],
  ["7-042", "Minimum age 16, but glacier trips are 18+ unless a parent comes along. What do I pick?", ["tour-age", "tour-ages-per-trip"],
    "Âge minimum 16 ans, mais 18 ans pour les glaciers sauf avec un parent. Je choisis quoi?"],
  ["7-043", "Guests need a good fitness level, 1000 m of climbing a day. Where do I say that?", ["tour-fitness"],
    "Les clients doivent être en bonne forme, 1000 m de dénivelé par jour. Où le dire?"],
  ["7-060", "Where do I show my certifications? I am an ACMG / IFMGA mountain guide.", ["tour-certs"],
    "Où indiquer mes certifications? Je suis guide de montagne ACMG / IFMGA."],
  ["7-061", "Do you rent gear? We have skis, skins, harnesses and crampons for rent, and avalanche safety gear is included. Where does that go?", ["tour-gear"],
    "Nous louons des skis, des peaux, des harnais et des crampons, et l’équipement de sécurité en avalanche est inclus. Où le mettre?"],
  ["7-065", "If avalanche conditions are bad I change the objective or cancel the day. How do I say that?", ["tour-weather"],
    "Si les conditions d’avalanche sont mauvaises, je change l’objectif ou j’annule la journée. Comment le dire?"],
  ["7-084", "My category says heli-skiing. I do not do heli-skiing and I unticked it. How do I get it off my page?", ["tour-category-word"],
    "Ma catégorie dit héliski. Je ne fais pas d’héliski et je l’ai décoché. Comment l’enlever de ma page?"],
];
const MORE7 = [
  ["en", "$750 per day for the group", ["tour-per-boat"]], ["en", "we charge a day rate", ["tour-per-boat"]], ["en", "daily rate for private guiding", ["tour-per-boat"]],
  ["en", "is this site for me if i only do private trips", ["tour-private-only"]], ["en", "do i have to show a per person price", ["tour-hide-price", "tour-private-only"]],
  ["en", "where do I put my ACMG certification", ["tour-certs"]], ["en", "how fit do guests need to be", ["tour-fitness"]], ["en", "is the gear included", ["tour-gear"]],
  ["en", "our courses run on set dates", ["tour-course-dates"]], ["en", "remove a wrong word from my category", ["tour-category-word"]], ["en", "I don't do heli-skiing", ["tour-category-word"]],
  ["en", "mountaineering", ["tour-kinds-guide"]], ["en", "avalanche courses", ["tour-kinds-guide"]],
  ["fr", "tarif à la journée pour le groupe", ["tour-per-boat"]], ["fr", "où mettre ma certification ACMG", ["tour-certs"]], ["fr", "l’équipement est inclus", ["tour-gear"]],
  ["fr", "enlever un mauvais mot de ma catégorie", ["tour-category-word"]], ["fr", "cours d’avalanche", ["tour-kinds-guide"]],
];
test("tour test 7: every Help question (EN + its French twin) and rephrasings land on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Ski touring, heli-skiing & avalanche courses" });
  assert.equal(ASKED7.length, 16);
  const wrong = [];
  for (const [k, q, want, qFr] of ASKED7) {
    const r = en.best(q), rf = fr.best(qFr);
    if (!want.includes(r.id)) wrong.push(`${k} EN "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    if (!want.includes(rf.id)) wrong.push(`${k} FR "${qFr}" -> ${rf.id} (want ${want.join(" or ")})`);
  }
  for (const [lang, q, want] of MORE7) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`"${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});
test("tour test 7 answers: group words for a day rate (no boat), private-only says yes, course dates are not closures", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const pb = plain(en.topic("tour-per-boat").a);
  assert.match(pb, /whole group/); assert.match(pb, /day rate/i); assert.doesNotMatch(pb, /\$650 for 4|163/);
  assert.match(plain(en.topic("tour-private-only").a), /^ ?Yes\b/); assert.match(plain(fr.topic("tour-private-only").aFr), /^ ?Oui\b/);
  assert.match(plain(en.topic("tour-hide-price").a), /^ ?Yes, if you have a private price/);
  assert.match(plain(en.topic("tour-course-dates").a), /Your tours and prices/); assert.match(plain(en.topic("tour-course-dates").a), /Don’t add course days under Holidays/);
  assert.match(plain(en.topic("tour-certs").a), /story/); assert.match(plain(en.topic("tour-fitness").a), /Good to know/); assert.match(plain(en.topic("tour-gear").a), /Good to know/);
  assert.match(plain(en.topic("tour-meeting-varies").a), /Keep your office/);
  assert.match(plain(en.topic("tour-kinds-guide").a), /Mountain guiding, mountaineering or avalanche courses/);
});
