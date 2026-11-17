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
