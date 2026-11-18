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

// Tour test 8 (Whistler, 2026-11-17; Linda, a dog-sledding and summer kennel-visit business, iPhone SE with large text).
// Her 22 questions as typed (shots 006-183; 006, 181 and 183 from the report), each with a French twin, and rephrasings.
// She found 9 good; they still land where they did.
const ASKED8 = [
  ["8-006", "I'm not good with computers. What if I make a mistake?", ["setup-change-later"],
    "Je ne suis pas douée avec les ordinateurs. Et si je fais une erreur?"],
  ["8-008", "that is our house in pemberton. people meet us at the staging area up the callaghan valley road, not our house", ["tour-meeting"],
    "C’est notre maison à Pemberton. Les gens nous rejoignent à l’aire de départ sur le chemin de la vallée, pas à la maison"],
  ["8-012", "we have two seasons. dog sledding in winter dec 10 to march 31 and kennel visits with puppies in summer june 15 to sept 15. closed in between", ["tour-season","setup-season"],
    "Nous avons deux saisons : traîneau à chiens l’hiver du 10 déc. au 31 mars et visites du chenil avec les chiots l’été du 15 juin au 15 sept. Fermé entre les deux"],
  ["8-013", "sled tours leave at 9, 11:30 and 2 in winter. summer visits are at 10 and 1. how do i put departure times?", ["tour-times"],
    "Les sorties en traîneau partent à 9 h, 11 h 30 et 14 h l’hiver. L’été, les visites sont à 10 h et 13 h. Comment mettre les heures de départ?"],
  ["8-039", "in summer we do kennel visits and puppy cuddles, not sledding. which one do i pick?", ["tour-kinds-kennel"],
    "L’été, nous faisons des visites du chenil et des câlins aux chiots, pas de traîneau. Lequel je choisis?"],
  ["8-044", "is farm visits right for our kennel tours? we dont do u-pick. people come meet the sled dogs and cuddle puppies", ["tour-kinds-kennel"],
    "Visites de ferme, est-ce bon pour nos visites du chenil? On ne fait pas d’autocueillette. Les gens viennent rencontrer les chiens et câliner les chiots"],
  ["8-051", "our price is per sled not per person. $349 a sled, 2 adults or 1 adult and 2 kids. what does it mean per bike??", ["tour-per-unit"],
    "Notre prix est par traîneau, pas par personne. 349 $ le traîneau, 2 adultes ou 1 adulte et 2 enfants. Pourquoi ça parle de vélo?"],
  ["8-052", "how do i put a kids price? extra child is $49 on the sled, $20 for summer visits", ["tour-kids-price"],
    "Comment mettre un prix pour enfants? L’enfant supplémentaire est 49 $ sur le traîneau, 20 $ pour les visites d’été"],
  ["8-053", "under 4 are free on the kennel visit. where do i say that", ["tour-strollers"],
    "Les moins de 4 ans sont gratuits à la visite du chenil. Où le dire?"],
  ["8-054", "kids under 4 come free", ["tour-strollers"],
    "Gratuit pour les enfants de moins de 4 ans"],
  ["8-060", "winter sledding you have to book a week ahead. summer kennel visits people can just come by. which do i pick?", ["tour-lead-time"],
    "L’hiver, il faut réserver une semaine à l’avance pour le traîneau. L’été, les gens peuvent passer sans réserver pour le chenil. Je choisis quoi?"],
  ["8-063", "can people bring their dog?", ["tour-dogs"],
    "Les gens peuvent-ils amener leur chien?"],
  ["8-064", "the dogs are OUR dogs, the sled dogs. guests can't bring their own dogs. it says dogs can come along, is that right?", ["tour-own-dogs"],
    "Les chiens sont NOS chiens, les chiens de traîneau. Les clients ne peuvent pas amener leurs chiens. Ça dit que les chiens peuvent venir, est-ce correct?"],
  ["8-065", "kids 3 and up can ride in the sled, you have to be 16 to drive (mush) your own team, summer visits are all ages. what age do i pick?", ["tour-drivers","tour-age","tour-ages-per-trip"],
    "Les enfants de 3 ans et plus montent dans le traîneau, il faut 16 ans pour conduire son attelage, les visites d’été sont pour tous les âges. Quel âge choisir?"],
  ["8-084", "the story says snowmobile and dogs welcome. we dont do snowmobiles and guests cant bring dogs. how do i fix a mistake?", ["tour-story-fix"],
    "L’histoire dit motoneige et chiens bienvenus. On ne fait pas de motoneige et les clients ne peuvent pas amener de chiens. Comment corriger une erreur?"],
  ["8-088", "we have a shuttle from whistler village but it costs $25 extra. where do i put that?", ["tour-shuttle"],
    "Nous avons une navette depuis le village, mais elle coûte 25 $ en plus. Où le mettre?"],
  ["8-089", "do you have a place for snowsuit rental? people need warm clothes", ["tour-gear"],
    "Avez-vous une place pour la location d’habits de neige? Les gens ont besoin de vêtements chauds"],
  ["8-090", "if its extreme cold, like minus 25, we cancel and give a refund. how do i say that?", ["tour-weather"],
    "S’il fait un froid extrême, comme moins 25, nous annulons et remboursons. Comment le dire?"],
  ["8-091", "one of our sleds is adapted for a wheelchair. it has to be booked ahead. is that wheelchair accessible?", ["tour-wheelchair"],
    "Un de nos traîneaux est adapté pour un fauteuil roulant. Il faut le réserver. Est-ce accessible en fauteuil roulant?"],
  ["8-181", "how do i fix a mistake?", ["setup-change-later"],
    "Comment corriger une erreur?"],
  ["8-182", "i put the wrong date for when we are closed, how do i change it", ["setup-closure-fix"],
    "J’ai mis la mauvaise date pour notre fermeture, comment la changer?"],
  ["8-183", "I'm not good with computers, can someone just do it for me?", ["setup-change-later"],
    "Je ne suis pas douée avec les ordinateurs, quelqu’un peut-il le faire pour moi?"],
];
const MORE8 = [
  ["en","what if i mess it up",["setup-change-later"]],
  ["en","can you do it for me",["setup-change-later"]],
  ["en","i'm not very technical",["setup-change-later"]],
  ["en","our huskies are the dogs, not guests' dogs",["tour-own-dogs"]],
  ["en","guests can't bring their dog",["tour-own-dogs","tour-dogs"]],
  ["en","which kind for puppy visits",["tour-kinds-kennel"]],
  ["en","which kind for kennel visits",["tour-kinds-kennel"]],
  ["en","$349 per sled",["tour-per-unit"]],
  ["en","price per snowmobile",["tour-per-unit"]],
  ["en","$49 per child",["tour-kids-price"]],
  ["en","babies are free",["tour-strollers"]],
  ["en","kids under 5 free",["tour-strollers"]],
  ["en","we rent snowsuits and boots",["tour-gear"]],
  ["en","hotel pickup costs extra",["tour-shuttle"]],
  ["en","I typed the wrong dates for our closure",["setup-closure-fix"]],
  ["en","how do i delete a closure",["setup-closure-fix"]],
  ["fr","prix par motoneige",["tour-per-unit"]],
  ["fr","49 $ par enfant",["tour-kids-price"]],
  ["fr","quel genre pour les visites de chiots",["tour-kinds-kennel"]],
  ["fr","pouvez-vous le faire pour moi",["setup-change-later"]],
];
test("tour test 8: every Help question (EN + its French twin) and rephrasings land on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Dog sledding & snowmobile tours" });
  assert.equal(ASKED8.length, 22);
  const wrong = [];
  for (const [k, q, want, qFr] of ASKED8) {
    const r = en.best(q), rf = fr.best(qFr);
    if (!want.includes(r.id)) wrong.push(`${k} EN "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    if (!want.includes(rf.id)) wrong.push(`${k} FR "${qFr}" -> ${rf.id} (want ${want.join(" or ")})`);
  }
  for (const [lang, q, want] of MORE8) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`"${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});
test("tour test 8 answers: own dogs say No guests’ dogs, per sled is not Private tours, kids price keeps the adult price, mistakes offer the email", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(plain(en.topic("tour-own-dogs").a), /Your own dogs don’t count here\. .*If guests can’t bring their dog, tap No guests’ dogs/);
  assert.match(plain(fr.topic("tour-own-dogs").aFr), /Pas de chiens des clients/);
  assert.match(plain(en.topic("tour-dogs").a), /Guests’ own dogs can come along/); assert.doesNotMatch(plain(en.topic("tour-dogs").a), /Dogs can come along \(on some/);
  assert.match(plain(en.topic("tour-per-unit").a), /Sled ride: \$349 per sled/); assert.match(plain(en.topic("tour-per-unit").a), /not a private tour/);
  assert.match(plain(en.topic("tour-kids-price").a), /Keep Price for one adult/); assert.doesNotMatch(plain(en.topic("tour-kids-price").a), /lowest/);
  assert.match(plain(en.topic("setup-change-later").a), /Change an answer/); assert.match(plain(en.topic("setup-change-later").a), /Would you rather have us do it\?/);
  assert.match(plain(fr.topic("setup-change-later").aFr), /Vous préférez que nous le fassions/);
  assert.match(plain(en.topic("setup-closure-fix").a), /✕ next to the wrong dates/); assert.match(plain(en.topic("setup-closure-fix").a), /When you run/);
  assert.match(plain(en.topic("tour-kinds-kennel").a), /Farm, ranch or kennel visits/); assert.match(plain(en.topic("tour-shuttle").a), /Good to know/);
  assert.match(plain(en.topic("tour-gear").a), /Good to know/);
});

// Tour test 9 (Whistler, 2026-11-18; Tanis, an Indigenous-owned cultural tour business near Mount Currie and Pemberton,
// Android). Her questions as typed (shots 006-062), each with a French twin, and rephrasings. Help missed or half-answered
// 13 of 20: no kind for a cultural walk, "snowcat" on her page, Indigenous-owned, photos of Elders, her town, yearly
// breaks, a class of 30, how her culture is described, the old French description and typing her tours herself.
const ASKED9 = [
  ["9-006", "We are an Indigenous-owned business. Can I change how our culture is described? The listing calls it adventure and war canoe, that is not right.", ["tour-culture-story","tour-indigenous-owned","tour-story-fix"],
    "Nous sommes une entreprise autochtone. Puis-je changer la façon dont notre culture est décrite? La fiche parle d’aventure et de canot de guerre, ce n’est pas juste."],
  ["9-007", "Our office is in Pemberton but people meet us in two places. The walk starts at a trailhead near Mount Currie and the canoe goes from Lillooet Lake. Which address do I put?", ["tour-meeting-varies","tour-meeting"],
    "Notre bureau est à Pemberton, mais on nous rejoint à deux endroits. La marche part d’un sentier près de Mount Currie et le canot part du lac Lillooet. Quelle adresse mettre?"],
  ["9-011", "We run most of the year but we take a break in April and in November. Is that all year?", ["tour-yearly-break"],
    "Nous sommes ouverts la plupart de l’année, mais nous prenons une pause en avril et en novembre. Est-ce toute l’année?"],
  ["9-018", "I dont see Indigenous or cultural tours. Our walk is a cultural walk with Elders storytelling, which one do I pick?", ["tour-kinds-cultural"],
    "Je ne vois pas de visites autochtones ou culturelles. Notre marche est une marche culturelle avec des récits des aînés, lequel je choisis?"],
  ["9-021", "Elders and children under 12 come free on our walk. Adults are 65. Where do I say that? Should I type free?", ["tour-strollers","tour-kids-price"],
    "Les aînés et les enfants de moins de 12 ans viennent gratuitement à notre marche. Les adultes paient 65 $. Où le dire? Est-ce que j’écris gratuit?"],
  ["9-022", "School groups pay 400 for the whole class, not per student. Where does that go?", ["tour-per-boat","tour-private-price","tour-groups"],
    "Les groupes scolaires paient 400 $ pour toute la classe, pas par élève. Où ça va?"],
  ["9-026", "Is there a way to show we are Indigenous-owned? Locally owned is not quite the same thing.", ["tour-indigenous-owned"],
    "Y a-t-il une façon de montrer que nous sommes une entreprise autochtone? Propriété locale, ce n’est pas tout à fait pareil."],
  ["9-027", "The walk is all ages but the canoe is 6 and up with a life jacket. Which age do I pick?", ["tour-ages-per-trip","tour-age"],
    "La marche est pour tous les âges, mais le canot est pour 6 ans et plus avec une veste de sauvetage. Quel âge choisir?"],
  ["9-030", "Some of our photos have Elders and community members in them. Will you use them on Instagram or other places? I need to know where they go.", ["photos-where"],
    "Certaines de nos photos montrent des aînés et des membres de la communauté. Allez-vous les utiliser sur Instagram ou ailleurs? Je dois savoir où elles vont."],
  ["9-040", "I dont have a price sheet. Can I just type our three tours and the prices here?", ["menu-add"],
    "Je n’ai pas de grille tarifaire. Puis-je simplement taper nos trois sorties et les prix ici?"],
  ["9-049", "We do school programs for a whole class, about 30 students plus teachers. The biggest choice is 20. What do I do?", ["tour-groups"],
    "Nous offrons des programmes scolaires pour une classe entière, environ 30 élèves et les enseignants. Le plus grand choix est 20. Que faire?"],
  ["9-057", "My page says snowcat and ski touring. We only do a snowshoe walk. How do I take snowcat off?", ["tour-kind-one-side"],
    "Ma page parle de chenillette et de ski de randonnée. Nous faisons seulement une marche en raquettes. Comment enlever la chenillette?"],
  ["9-058", "It says Whistler but we are in Mount Currie, near Pemberton. Can I change that?", ["setup-town"],
    "Ça dit Whistler, mais nous sommes à Mount Currie, près de Pemberton. Puis-je changer ça?"],
  ["9-059", "Can you add Indigenous or cultural to our category? It says walking and history tours. Our culture is not history, it is living.", ["tour-kinds-cultural"],
    "Pouvez-vous ajouter autochtone ou culturel à notre catégorie? Ça dit visites à pied et historiques. Notre culture n’est pas de l’histoire, elle est vivante."],
  ["9-062", "I dont speak French. The French one still says war canoe and tribal. Can you just remove it or translate mine?", ["fr-desc-old"],
    "Je ne parle pas français. La version française dit encore canot de guerre et tribal. Pouvez-vous l’enlever ou traduire la mienne?"],
  ["9-154", "I'm not good with computers. What if I make a mistake?", ["setup-change-later"],
    "Je ne suis pas douée avec les ordinateurs. Et si je fais une erreur?"],
];
const MORE9 = [
  ["en","which kind for a cultural tour",["tour-kinds-cultural"]],
  ["en","we run First Nations cultural walks",["tour-kinds-cultural"]],
  ["en","how do I take snowcat off my page",["tour-kind-one-side"]],
  ["en","how do i show we are indigenous owned",["tour-indigenous-owned"]],
  ["en","where do our photos go",["photos-where"]],
  ["en","keep a photo off instagram",["photos-where"]],
  ["en","wrong town on my page",["setup-town"]],
  ["en","we close every april",["tour-yearly-break","setup-closures","closures"]],
  ["en","a class of 30",["tour-groups"]],
  ["en","whole class of 30 students",["tour-groups"]],
  ["en","change how our culture is described",["tour-culture-story"]],
  ["en","people meet us at a trailhead, not the office",["tour-meeting","tour-meeting-varies"]],
  ["en","I don't speak French, remove it or translate mine?",["fr-desc-old"]],
  ["en","can I type our tours myself",["menu-add"]],
  ["en","190 per canoe",["tour-per-unit"]],
  ["en","400 per class",["tour-per-boat"]],
  ["fr","quel genre pour une visite culturelle",["tour-kinds-cultural"]],
  ["fr","ou vont nos photos",["photos-where"]],
  ["fr","je ne parle pas français, traduire la mienne",["fr-desc-old"]],
  ["fr","une classe entière de 30 élèves",["tour-groups"]],
];
test("tour test 9: every Help question (EN + its French twin) and rephrasings land on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Adventure canoe tours" });
  assert.equal(ASKED9.length, 16);
  const wrong = [];
  for (const [k, q, want, qFr] of ASKED9) {
    const r = en.best(q), rf = fr.best(qFr);
    if (!want.includes(r.id)) wrong.push(`${k} EN "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    if (!want.includes(rf.id)) wrong.push(`${k} FR "${qFr}" -> ${rf.id} (want ${want.join(" or ")})`);
  }
  for (const [lang, q, want] of MORE9) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`"${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});
test("tour test 9 answers: the cultural kind, one side of a kind, Indigenous-owned in the story, photos page-only, the town, yearly breaks, a whole class, French description, typing tours", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(plain(en.topic("tour-kinds-cultural").a), /Indigenous and cultural tours/); assert.match(plain(fr.topic("tour-kinds-cultural").aFr), /Visites autochtones et culturelles/);
  assert.doesNotMatch(plain(en.topic("tour-kind-one-side").a), /untick that kind/); assert.match(plain(en.topic("tour-kind-one-side").a), /Keep the kind ticked/);
  assert.match(plain(en.topic("tour-indigenous-owned").a), /story/); assert.match(plain(en.topic("tour-indigenous-owned").a), /Known for/); assert.match(plain(en.topic("tour-indigenous-owned").a), /no separate badge/);
  assert.match(plain(en.topic("photos-where").a), /Instagram or Facebook, always credited and tagged/); assert.match(plain(en.topic("photos-where").a), /Message us/);
  assert.match(plain(en.topic("setup-town").a), /Message us/);
  assert.match(plain(en.topic("tour-yearly-break").a), /Every year/); assert.doesNotMatch(en.topic("tour-yearly-break").a, /__/); assert.doesNotMatch(fr.topic("tour-yearly-break").aFr, /__/);
  assert.match(plain(en.topic("tour-groups").a), /21\+ or whole classes/); assert.match(plain(fr.topic("tour-groups").aFr), /21\+ ou classes entières/);
  assert.match(plain(en.topic("tour-culture-story").a), /Your story and Known for/);
  assert.match(plain(en.topic("tour-meeting-varies").a), /Where do people meet you\?/);
  assert.match(plain(en.topic("fr-desc-old").a), /Leave it to us/); assert.match(plain(en.topic("menu-add").a), /Type them in myself/); assert.match(plain(fr.topic("menu-add").aFr), /Je les tape moi-même/);
});

// Tour test 10 (Whistler, 2026-11-18; Gord, a horseback ranch in the Pemberton Meadows: trail rides for riders 8+, pony
// rides for little ones, summer pack trips, winter sleigh rides on weekends and holidays, closed Mondays in spring and
// fall; Android tablet, short answers, no capitals). His 19 questions as typed (shots 008-037 and help-log.json), each with
// a French twin, and rephrasings. Help missed or answered wrong 12 of 19 (three seasons, holidays, sleigh rides, what a
// kind is, an 8+ age, a 2-person minimum, a price per sleigh, what a badge is, his daughter, one trip's season).
const ASKED10 = [
  ["10-008", "closed mondays in spring n fall only not summer", ["hours-third-stretch"], "fermé les lundis au printemps et à l'automne seulement, pas l'été"],
  ["10-009", "winter is only sleigh rides weekends", ["tour-one-trip-season","hours-third-stretch","seasonal-hours"], "l'hiver c'est seulement les promenades en traîneau les fins de semaine"],
  ["10-018", "how do i put fall too closed mondays oct nov", ["hours-third-stretch"], "comment je mets l'automne aussi, fermé les lundis en oct et nov"],
  ["10-019", "we do sleighs on holidays to like xmas week and family day", ["hours-open-holidays"], "on fait le traîneau les jours fériés aussi comme la semaine de Noël et le jour de la Famille"],
  ["10-023", "wheres sleigh rides", ["tour-kinds-sleigh"], "où sont les promenades en traîneau"],
  ["10-024", "what do i pick rides r 1 hr 2 hr half day n overnite", ["tour-lengths","tour-several-prices"], "je choisis quoi, les randonnées c'est 1 h, 2 h, une demi-journée et une nuit"],
  ["10-025", "whats a kind", ["tour-kinds-what"], "c'est quoi un genre"],
  ["10-026", "sleigh rides r only winter", ["tour-one-trip-season"], "les promenades en traîneau c'est seulement l'hiver"],
  ["10-027", "horse drawn sleigh which one do i tick", ["tour-kinds-sleigh"], "traîneau tiré par des chevaux, lequel je coche"],
  ["10-035", "riders gotta be 8 but pony rides r for little kids under 8", ["tour-ages-per-trip"], "les cavaliers doivent avoir 8 ans mais les tours de poney c'est pour les petits enfants de moins de 8 ans"],
  ["10-036", "theres no 8", ["tour-age"], "il n'y a pas de 8"],
  ["10-037", "do i put the weight limit somewhere", ["tour-weight"], "est-ce que je mets la limite de poids quelque part"],
  ["10-125", "pony rides r per kid not per person", ["tour-kids-price"], "les tours de poney c'est par enfant pas par personne"],
  ["10-126", "pack trip is 2 person minimum where do i put that", ["tour-price-rules","tour-several-prices"], "la sortie avec chevaux de bât c'est 2 personnes minimum, je le mets où"],
  ["10-127", "sleigh is priced per sleigh up to 10 ppl", ["tour-price-rules","tour-per-unit"], "le traîneau c'est un prix par traîneau jusqu'à 10 personnes"],
  ["10-128", "whats a badge", ["tour-badges-what"], "c'est quoi un badge"],
  ["10-129", "my daughter does my email can she get in to", ["not-owner","staff"], "ma fille s'occupe de mes courriels, peut-elle y accéder"],
  ["10-130", "closed mondays spring n fall", ["hours-third-stretch"], "fermé les lundis printemps et automne"],
  ["10-131", "riders must be under 230 lb", ["tour-weight"], "les cavaliers doivent peser moins de 230 lb"],
];
const MORE10 = [
  ["en","we need a third stretch of hours",["hours-third-stretch"]],
  ["en","can i add three seasons",["hours-third-stretch"]],
  ["en","we are open on stat holidays too",["hours-open-holidays"]],
  ["en","open christmas week",["hours-open-holidays"]],
  ["en","where is sleigh rides",["tour-kinds-sleigh"]],
  ["en","what is a kind",["tour-kinds-what"]],
  ["en","hay rides are only summer",["tour-one-trip-season"]],
  ["en","2 person min on the overnight trip",["tour-price-rules"]],
  ["en","priced per sleigh",["tour-price-rules","tour-per-unit"]],
  ["en","what is a badge",["tour-badges-what"]],
  ["en","my wife does the email, can she get in",["not-owner","staff"]],
  ["fr","troisième période d'heures",["hours-third-stretch"]],
  ["fr","ouvert les jours fériés",["hours-open-holidays"]],
  ["fr","promenade en traîneau",["tour-kinds-sleigh"]],
  ["fr","qu'est-ce qu'un genre",["tour-kinds-what"]],
  ["fr","prix par traîneau",["tour-price-rules","tour-per-unit"]],
  ["fr","qu'est-ce qu'un badge",["tour-badges-what"]],
];
test("tour test 10: every Help question (EN + its French twin) and rephrasings land on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Trail rides & sleigh rides" });
  assert.equal(ASKED10.length, 19);
  const wrong = [];
  for (const [k, q, want, qFr] of ASKED10) {
    const r = en.best(q), rf = fr.best(qFr);
    if (!want.includes(r.id)) wrong.push(`${k} EN "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    if (!want.includes(rf.id)) wrong.push(`${k} FR "${qFr}" -> ${rf.id} (want ${want.join(" or ")})`);
  }
  for (const [lang, q, want] of MORE10) { const r = (lang === "fr" ? fr : en).best(q); if (!want.includes(r.id)) wrong.push(`"${q}" -> ${r.id} (want ${want.join(" or ")})`); }
  assert.deepEqual(wrong, []);
});
test("tour test 10 answers: three stretches with the spring-and-fall tip, Open on holidays, Sleigh rides, what a kind and a badge are, 8+ and 10+, price rules, a family member", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(plain(en.topic("hours-third-stretch").a), /three stretches/); assert.match(plain(en.topic("hours-third-stretch").a), /usual hours your spring and fall hours/);
  assert.match(plain(fr.topic("hours-third-stretch").aFr), /trois périodes/);
  assert.match(plain(en.topic("hours-open-holidays").a), /Open on holidays/); assert.match(plain(en.topic("hours-open-holidays").a), /Christmas week \(December 24 to January 1\)/);
  assert.match(plain(fr.topic("hours-open-holidays").aFr), /Ouvert les jours fériés/);
  assert.match(plain(en.topic("tour-kinds-sleigh").a), /Sleigh rides/); assert.match(plain(en.topic("tour-kinds-sleigh").a), /closest kind/); assert.match(plain(fr.topic("tour-kinds-sleigh").aFr), /Promenades en traîneau/);
  assert.match(plain(en.topic("tour-kinds-what").a), /tiles on What do you offer\?/);
  assert.match(plain(en.topic("tour-badges-what").a), /Kid friendly/); assert.doesNotMatch(plain(en.topic("tour-badges-what").a), /<code>|footer/);
  assert.match(plain(en.topic("tour-age").a), /8\+, 10\+/); assert.match(plain(fr.topic("tour-age").aFr), /8\+, 10\+/);
  assert.match(plain(en.topic("tour-ages-per-trip").a), /Riders 8\+ \(pony rides under 8\)/);
  assert.match(plain(en.topic("tour-price-rules").a), /Your tours and prices/); assert.match(plain(en.topic("tour-price-rules").a), /2 person minimum/);
  assert.match(plain(en.topic("not-owner").a), /Managers, marketing and staff can update the page too/);
  assert.match(plain(en.topic("tour-one-trip-season").a), /Stay “all year”/);
});

// Tour test 11 (Whistler, 2026-11-18; Min-jun, a private sightseeing van company: hotel pickups, Korean and Japanese
// guides, a private van per hour with a 3-hour minimum, an airport shuttle that isn't a tour; he dictates, no punctuation).
// His 12 questions as typed (shots 013-015, 042-050), each with a French twin. Help missed 4 (the sightseeing kind twice,
// the airport shuttle, the card's words) and half-answered 3 (hotel pickup, per van per hour, the shuttle again).
const ASKED11 = [
  ["11-013", "we do sightseeing tour by van which one i pick", ["tour-kinds-sightseeing"], "on fait des visites touristiques en van, lequel je choisis"],
  ["11-014", "airport shuttle can i add", ["tour-airport-shuttle"], "navette aéroport je peux l'ajouter"],
  ["11-015", "joffre lake day trip what kind", ["tour-kinds-sightseeing"], "excursion d'une journée au lac Joffre, quel genre"],
  ["11-042", "we pick up from hotel where to write", ["tour-pickup"], "on prend les gens à leur hôtel, où l'écrire"],
  ["11-043", "how to say we speak korean and japanese", ["tour-languages"], "comment dire qu'on parle coréen et japonais"],
  ["11-044", "need park pass for joffre where to tell", ["tour-licence"], "il faut un laissez-passer du parc pour Joffre, où le dire"],
  ["11-045", "airport shuttle can i add", ["tour-airport-shuttle"], "est-ce que je peux ajouter une navette vers l'aéroport"],
  ["11-046", "price is per van per hour minimum 3 hours", ["tour-private-hourly"], "le prix est par van à l'heure, minimum 3 heures"],
  ["11-047", "if weather bad we refund where i say", ["tour-weather"], "si la météo est mauvaise on rembourse, où je le dis"],
  ["11-048", "joffre tour only summer other tours all year", ["tour-one-trip-season"], "la sortie Joffre seulement l'été, les autres toute l'année"],
  ["11-049", "village lights tour only winter evening", ["tour-one-trip-season"], "la sortie des lumières du village seulement le soir en hiver"],
  ["11-050", "how i change sightseeing tours and airport shuttles words on my card", ["tour-category-word"], "comment changer les mots visites touristiques et navettes sur ma fiche"],
];
test("tour test 11: every Help question (EN + its French twin) lands on the right topic", async () => {
  const { en, fr } = await setupFor("tour", { cuisine: "Sightseeing tours & airport shuttles" });
  assert.equal(ASKED11.length, 12);
  const wrong = [];
  for (const [k, q, want, qFr] of ASKED11) {
    const r = en.best(q), rf = fr.best(qFr);
    if (!want.includes(r.id)) wrong.push(`${k} EN "${q}" -> ${r.id} (want ${want.join(" or ")})`);
    if (!want.includes(rf.id)) wrong.push(`${k} FR "${qFr}" -> ${rf.id} (want ${want.join(" or ")})`);
  }
  assert.deepEqual(wrong, []);
});
test("tour test 11 answers: sightseeing kind, pickup option, airport shuttles aren't tours, per hour with a minimum, evening times, card words; no 'your culture' in the story answer", async () => {
  const { en, fr } = await setupFor("tour");
  const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  assert.match(plain(en.topic("tour-kinds-sightseeing").a), /Sightseeing and day trips/); assert.match(plain(fr.topic("tour-kinds-sightseeing").aFr), /Visites touristiques et excursions d’une journée/);
  assert.match(plain(en.topic("tour-pickup").a), /We pick you up \(from hotels in the village\)/); assert.match(plain(en.topic("tour-pickup").a), /Pickup: hotels in Whistler Village/);
  assert.match(plain(en.topic("tour-airport-shuttle").a), /Airport shuttles and transfers aren’t tours/); assert.match(plain(en.topic("tour-airport-shuttle").a), /story or under Good to know/);
  assert.match(plain(en.topic("tour-private-hourly").a), /Private van from \$150\/hour \(3-hour minimum\)/); assert.match(plain(fr.topic("tour-private-hourly").aFr), /150 \$ l’heure \(minimum de 3 heures\)/);
  assert.match(plain(en.topic("tour-one-trip-season").a), /Only in the evening\? Put the times/);
  assert.match(plain(en.topic("tour-category-word").a), /Words we found online/);
  assert.doesNotMatch(plain(en.topic("tour-culture-story").a), /your culture/);
});
