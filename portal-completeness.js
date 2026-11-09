'use strict';
// Owner portal: "Your page is X% complete" (2026-11-08), restaurants first.
// Pure module: the score, the missing list and the HTML. server.js gathers the inputs from the database.
// Spec: drafts/portal-completeness-2026-11-08/SPEC-restaurants.md (100 points).
// Rules (Dayton's defaults until he says otherwise):
//   - owners see it in their portal only; nothing public, and it never feeds ranking, sorting or indexing;
//   - hours count as fresh for 90 days after they were last checked or saved;
//   - "we don't have one" answers (declaredNone) count as done, once a screen to give them exists;
//   - an item the owner has no way to fix yet (fix: false) counts when we already have it, and when we don't it
//     is left out of the total and shown under "We're adding these", so 100% is reachable today.

const HOURS_FRESH_DAYS = 90;
const DESCRIPTION_MIN = 120;
const PHOTOS_MIN = 3;

// key, group, weight, can the owner fix it in the portal today, where the button goes, fields that can be waiting for review.
// target: { task, id } scrolls inside the edit page; { href: 'menu' } opens the menu page.
const ITEMS = [
  { key: 'address_pin', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opAddress' }, fields: ['address'],
    en: 'Street address and map pin', fr: 'Adresse et position sur la carte', whyEn: 'So people can find you and the map pin lands on your door.', whyFr: 'Pour que les gens vous trouvent et que l’épingle soit devant votre porte.', btnEn: 'Add address', btnFr: 'Ajouter l’adresse', icon: '📍' },
  { key: 'phone', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opPhone' }, fields: ['phone'],
    en: 'Phone number', fr: 'Numéro de téléphone', whyEn: 'The number guests call to book or ask a question.', whyFr: 'Le numéro que les clients appellent pour réserver ou poser une question.', btnEn: 'Add phone', btnFr: 'Ajouter', icon: '📞' },
  { key: 'website', noneEn: 'We don’t have a website', noneFr: 'Nous n’avons pas de site Web', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opWebsite' }, fields: ['website'],
    en: 'Website', fr: 'Site Web', whyEn: 'Paste your website address.', whyFr: 'Collez l’adresse de votre site Web.', btnEn: 'Add website', btnFr: 'Ajouter', icon: '🌐' },
  { key: 'cuisine', group: 'basics', w: 4, fix: true, target: { task: 'more', id: 'cuisine' }, fields: ['cuisine'],
    en: 'What you serve (cuisine)', fr: 'Ce que vous servez (cuisine)', whyEn: 'Italian, sushi, steakhouse and so on. Pick it from the list.', whyFr: 'Italienne, sushis, grilladerie, etc. Choisissez-la dans la liste.', btnEn: 'Pick cuisine', btnFr: 'Choisir', icon: '🍽️' },
  { key: 'hours', group: 'hours', w: 8, fix: true, target: { task: 'hours', id: 'hours' }, fields: ['hours'],
    en: 'Weekly opening hours', fr: 'Heures d’ouverture', whyEn: 'The times you’re open each day.', whyFr: 'Vos heures d’ouverture chaque jour.', btnEn: 'Add your hours', btnFr: 'Ajouter vos heures', icon: '🕑' },
  { key: 'hours_fresh', group: 'hours', w: 4, fix: true, target: { task: 'hours', id: 'opHoursOk' }, fields: ['hours', 'hours_checked'],
    en: 'Are your hours still right?', fr: 'Vos heures sont-elles toujours exactes?', whyEn: 'If nothing has changed, one tap is enough.', whyFr: 'Si rien n’a changé, un seul toucher suffit.', btnEn: 'Check them', btnFr: 'Vérifier', icon: '🔄' },
  { key: 'photo_main', group: 'photos', w: 8, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'A real photo of your place', fr: 'Une vraie photo de votre établissement', whyEn: 'Real photos only, taken by you. Never a stand-in.', whyFr: 'De vraies photos seulement, prises par vous.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'photo_extra', group: 'photos', w: 6, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'At least 3 photos', fr: 'Au moins 3 photos', whyEn: 'Food, your room, your patio.', whyFr: 'Plats, salle, terrasse.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'avg_spend', group: 'menu', w: 4, fix: true, target: { task: 'more', id: 'opAvg' }, fields: ['avg_spend'],
    en: 'Average spend per person', fr: 'Dépense moyenne par personne', whyEn: 'One main and a non-alcoholic drink, in dollars.', whyFr: 'Un plat principal et une boisson sans alcool, en dollars.', btnEn: 'Enter amount', btnFr: 'Indiquer', icon: '💵' },
  { key: 'menu', group: 'menu', w: 8, fix: true, target: { href: 'menu' }, fields: ['menu_url'],
    en: 'Link to your menu, or snap a photo of it', fr: 'Lien vers votre menu, ou une photo de celui-ci', whyEn: 'Guests want to see the dishes and prices. A “Menu” line in Plan your visit doesn’t count as the menu.', whyFr: 'Les clients veulent voir les plats et les prix. Une ligne « Menu » dans Planifier la visite ne compte pas comme le menu.', btnEn: 'Add menu', btnFr: 'Ajouter le menu', icon: '📖' },
  { key: 'dietary', noneEn: 'No vegan, veggie or gluten-free options', noneFr: 'Pas d’options végé ou sans gluten', group: 'menu', w: 6, fix: true, target: { task: 'more', id: 'badges' }, fields: ['badge:vegan', 'badge:vegetarian', 'badge:gluten_free'],
    en: 'Dietary options', fr: 'Options alimentaires', whyEn: 'Tick vegan, vegetarian or gluten-free if you offer them. A dietary note in Plan your visit counts too.', whyFr: 'Cochez végétalien, végétarien ou sans gluten si vous en offrez. Une note alimentaire dans Planifier la visite compte aussi.', btnEn: 'Tick options', btnFr: 'Cocher', icon: '🥗' },
  { key: 'happy_hour', noneEn: 'We don’t have a happy hour', noneFr: 'Nous n’avons pas de happy hour', group: 'offers', w: 4, fix: true, target: { task: 'happy', id: 'happy' }, fields: ['happy_hour', 'happy_hour_deals'],
    en: 'Happy hour times and deals', fr: 'Heures et spéciaux du happy hour', whyEn: 'When it runs and what’s on special.', whyFr: 'Quand il a lieu et ce qui est en spécial.', btnEn: 'Add happy hour', btnFr: 'Ajouter', icon: '🍹' },
  { key: 'specials', noneEn: 'We don’t run specials', noneFr: 'Nous n’avons pas de spéciaux', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'specials' }, fields: ['specials'],
    en: 'Weekly specials', fr: 'Spéciaux de la semaine', whyEn: 'Nightly deals or a weekly feature.', whyFr: 'Spéciaux du soir ou de la semaine.', btnEn: 'Add specials', btnFr: 'Ajouter', icon: '⭐' },
  { key: 'entertainment', noneEn: 'We don’t host music or events', noneFr: 'Ni musique ni événements chez nous', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'weekly-nights' }, fields: ['weekly_nights', 'badge:live_music', 'badge:sports_tv'],
    en: 'Live music or events', fr: 'Musique en direct ou événements', whyEn: 'Trivia night, live music, sports on the TV.', whyFr: 'Soirée-questionnaire, musique en direct, sports à la télé.', btnEn: 'Add a night', btnFr: 'Ajouter', icon: '🎶' },
  // "Plan your visit" lines (2026-11-08): the owner writes them in the "Plan your visit" section of the edit page.
  { key: 'pyv_known', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitKnown' }, fields: ['visit_rows'],
    en: 'Known for', fr: 'Connu pour', whyEn: 'One line on what people come back for.', whyFr: 'Une ligne sur ce pour quoi les gens reviennent.', btnEn: 'Write it', btnFr: 'Écrire', icon: '👍' },
  { key: 'pyv_reservations', noneEn: 'We don’t take reservations', noneFr: 'Nous ne prenons pas de réservations', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitReservations' }, fields: ['visit_rows', 'booking_url'],
    en: 'Reservations', fr: 'Réservations', whyEn: 'How to book, or walk-ins only.', whyFr: 'Comment réserver, ou sans réservation seulement.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '📅' },
  { key: 'pyv_takeout', noneEn: 'No takeout or delivery', noneFr: 'Ni plats à emporter ni livraison', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitTakeout' }, fields: ['visit_rows'],
    en: 'Takeout and delivery', fr: 'À emporter et livraison', whyEn: 'Order to go? Which delivery apps?', whyFr: 'Pour emporter? Quelles applis de livraison?', btnEn: 'Add it', btnFr: 'Ajouter', icon: '🥡' },
  // The "Dietary" line of Plan your visit is no longer its own item (live check 2026-11-08: owners were asked about
  // dietary twice). It still counts toward "Dietary options" above, and its box stays optional in Plan your visit.
  { key: 'pyv_groups', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitGroups' }, fields: ['visit_rows'],
    en: 'Groups and good to know', fr: 'Groupes et bon à savoir', whyEn: 'Large parties, parking, kids, anything that helps.', whyFr: 'Grands groupes, stationnement, enfants, tout ce qui aide.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '👥' },
  { key: 'description', group: 'about', w: 6, fix: true, target: { task: 'contact', id: 'opDescription' }, fields: ['description'],
    en: 'A description (120+ characters)', fr: 'Une description (120 caractères ou plus)', whyEn: 'A few sentences about your place, in your words.', whyFr: 'Quelques phrases sur votre établissement, dans vos mots.', btnEn: 'Write it', btnFr: 'Écrire', icon: '✍️' },
  { key: 'instagram', noneEn: 'We’re not on Instagram', noneFr: 'Nous ne sommes pas sur Instagram', group: 'social', w: 3, fix: true, target: { task: 'contact', id: 'opInstagram' }, fields: ['instagram_url'],
    en: 'Instagram link', fr: 'Lien Instagram', whyEn: 'Paste your @name or the link to your profile.', whyFr: 'Collez votre @nom ou le lien de votre profil.', btnEn: 'Add Instagram', btnFr: 'Ajouter', icon: '📸' },
  { key: 'facebook', noneEn: 'We’re not on Facebook', noneFr: 'Nous ne sommes pas sur Facebook', group: 'social', w: 3, fix: true, target: { task: 'contact', id: 'opFacebook' }, fields: ['facebook_url'],
    en: 'Facebook link', fr: 'Lien Facebook', whyEn: 'Your Facebook page, if you have one.', whyFr: 'Votre page Facebook, si vous en avez une.', btnEn: 'Add Facebook', btnFr: 'Ajouter', icon: '👍' },
  { key: 'arrival', group: 'finding', w: 3, fix: true, target: { task: 'arrival', id: '' }, fields: [],
    en: 'Storefront photo and exact spot', fr: 'Photo de la devanture et emplacement exact', whyEn: 'Stand at your front door and take one photo. It helps people find you.', whyFr: 'Placez-vous devant la porte et prenez une photo. Cela aide les gens à vous trouver.', btnEn: 'At the door', btnFr: 'À la porte', icon: '📍' },
  { key: 'owner_confirmed', group: 'confirmed', w: 3, fix: false,
    en: 'Confirmed by you', fr: 'Confirmée par vous', whyEn: 'Saving a change to your page adds the Verified mark. A one-tap “my page is right” button is coming.', whyFr: 'Enregistrer une modification ajoute la mention Vérifiée. Un bouton « ma fiche est exacte » s’en vient.', icon: '✅' },
];
if (ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: weights must sum to 100');
// "We don't have one" (2026-11-08): the items a restaurant may genuinely not offer. Never the core of a page (address,
// phone, hours, photos, menu, average spend, description, storefront spot): those are always worth adding.
const NONE_KEYS = ITEMS.filter((i) => i.noneEn).map((i) => i.key);
const NONE_MAX = NONE_KEYS.length;
// Happy Hour badge on the page but no times or deals (live check 2026-11-08, 21 restaurants): the item asks for the
// times, and "We don't have a happy hour" is not offered (it would contradict the badge). Still missing, just worded right.
const HAPPY_HOUR_BADGE_COPY = {
  en: 'Add your happy hour times', fr: 'Ajoutez les heures de votre happy hour',
  whyEn: 'Your page shows a Happy Hour badge. Add when it runs and what’s on special.', whyFr: 'Votre fiche affiche un badge Happy hour. Indiquez quand il a lieu et ce qui est en spécial.',
  btnEn: 'Add the times', btnFr: 'Ajouter les heures',
};
// The last steps to 100% for almost every restaurant (live check: 546 of 552 have one photo, and the storefront spot is
// new), named plainly in the panel so owners know where the ceiling comes from.
const CEILING_KEYS = ['photo_main', 'photo_extra', 'arrival'];

// "About X minutes left" (2026-11-08): rough seconds an owner needs on a phone to do each item. Estimates, not measured.
// Free text and photos take longest; one-tap confirms take seconds.
const SECONDS = {
  address_pin: 60, phone: 20, website: 20, cuisine: 15, hours: 180, hours_fresh: 10, photo_main: 120, photo_extra: 180,
  avg_spend: 10, menu: 120, dietary: 20, happy_hour: 150, specials: 90, entertainment: 60,
  pyv_known: 45, pyv_reservations: 45, pyv_takeout: 30, pyv_groups: 45,
  description: 180, instagram: 30, facebook: 30, arrival: 90, owner_confirmed: 0,
};
if (ITEMS.some((i) => !(i.key in SECONDS))) throw new Error('portal-completeness: every item needs a time estimate');
// Whole minutes for the items an owner can still do (not the ones waiting for review). Saving hours also makes them
// fresh, so "hours checked" adds nothing when the hours themselves are missing. Never less than 1 while anything is left.
// Quick ones (2026-11-08, Dayton: "people are busy"): items that take half a minute or less lead the bar and the panel,
// so an owner can raise the score in under a minute; the longer jobs are offered for "when you have a few minutes".
const QUICK_SECONDS = 30;
const QUICK_CAP_SECONDS = 60;
const isQuick = (it) => !it.waiting && (SECONDS[it.key] || 0) <= QUICK_SECONDS;
function minutesLeft(missing) {
  const keys = new Set(missing.filter((it) => !it.waiting).map((it) => it.key));
  if (!keys.size) return 0;
  let s = 0;
  for (const k of keys) if (!(k === 'hours_fresh' && keys.has('hours'))) s += SECONDS[k] || 0;
  return Math.max(1, Math.round(s / 60));
}

const GROUPS = [
  { key: 'basics', en: 'Basics', fr: 'Essentiel' },
  { key: 'hours', en: 'Hours', fr: 'Heures' },
  { key: 'photos', en: 'Photos', fr: 'Photos' },
  { key: 'menu', en: 'Menu', fr: 'Menu' },
  { key: 'offers', en: 'Offers', fr: 'Offres' },
  { key: 'visit', en: 'Plan your visit', fr: 'Planifier la visite' },
  { key: 'about', en: 'About', fr: 'À propos' },
  { key: 'social', en: 'Social links', fr: 'Réseaux sociaux' },
  { key: 'finding', en: 'Finding you', fr: 'Vous trouver' },
  { key: 'confirmed', en: 'Confirmed by you', fr: 'Confirmée par vous' },
];

const nonBlank = (s) => typeof s === 'string' && s.trim() !== '';
const dayNumber = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };

// input: plain values gathered by server.js (see gatherCompletenessInput there).
function doneMap(input, today) {
  const i = input || {};
  const labels = new Set((i.visitLabels || []).map((l) => String(l).trim().toLowerCase()));
  const a = dayNumber(i.hoursCheckedAt), b = dayNumber(today);
  const ownPhoto = /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(i.imageUrl || '').trim());
  return {
    address_pin: nonBlank(i.address) && i.latitude != null && i.longitude != null,
    phone: nonBlank(i.phone),
    website: nonBlank(i.website),
    cuisine: nonBlank(i.cuisine),
    hours: !!i.hasHours,
    hours_fresh: !!i.hasHours && a != null && b != null && b - a <= HOURS_FRESH_DAYS,
    photo_main: ownPhoto,
    photo_extra: Number(i.photoCount) >= PHOTOS_MIN,
    // A research estimate counts once the owner confirms it ("Yes, that's right"), so confirming earns the points.
    avg_spend: Number.isInteger(i.avgSpend) && i.avgSpendSource !== 'research',
    menu: nonBlank(i.menuUrl) || !!i.hasPublishedMenu,
    dietary: !!(i.vegan || i.vegetarian || i.glutenFree) || labels.has('dietary'),
    happy_hour: !!i.hasHappyHour,
    specials: Number(i.specialsCount) > 0,
    entertainment: !!(i.liveMusic || i.sportsTv) || Number(i.nightsCount) > 0,
    pyv_known: labels.has('known for'),
    pyv_reservations: labels.has('reservations') || nonBlank(i.bookingUrl),
    pyv_takeout: labels.has('takeout') || labels.has('to go'),
    pyv_groups: labels.has('groups') || labels.has('good to know'),
    description: String(i.description || '').trim().length >= DESCRIPTION_MIN,
    instagram: nonBlank(i.instagramUrl),
    facebook: nonBlank(i.facebookUrl),
    arrival: !!i.hasArrival,
    owner_confirmed: !!i.claimed,
  };
}

// -> { pct, got, max, complete, groups: [{ key, got, max, full }], missing: [item + {waiting}], coming: [item],
//      declined: [item] (told us "we don't have one" and we hold nothing for it), declared: [keys as stored] }
// opts: { today: 'YYYY-MM-DD', pending: Set of fields waiting for review }
function scoreCompleteness(input, opts) {
  const o = opts || {};
  const done = doneMap(input, o.today);
  const declaredAll = ((input && input.declaredNone) || []).filter((k) => NONE_KEYS.includes(k));
  const none = new Set(declaredAll);
  const pending = o.pending || new Set();
  const photosWaiting = Math.max(0, Number(input && input.pendingPhotos) || 0);
  const na = {};
  // Happy hour is only asked of places that serve alcohol: a non-alcoholic place with no happy hour is exempt.
  if (input && input.nonalcoholic && !done.happy_hour) na.happy_hour = true;
  // A Happy Hour badge with no times: a stored "we don't have one" would contradict the badge, so it doesn't count.
  const hhBadgeOnly = !!(input && input.happyHourBadge) && !done.happy_hour && !na.happy_hour;
  if (hhBadgeOnly) none.delete('happy_hour');
  let got = 0, max = 0;
  const per = new Map(GROUPS.map((g) => [g.key, { key: g.key, got: 0, max: 0 }]));
  const missing = [], coming = [];
  for (const base of ITEMS) {
    if (na[base.key]) continue;
    const it = base.key === 'happy_hour' && hhBadgeOnly ? { ...base, ...HAPPY_HOUR_BADGE_COPY, noneEn: undefined, noneFr: undefined } : base;
    const ok = done[it.key] || none.has(it.key);
    // No hours at all (live check 2026-11-08, 42 restaurants): "Are your hours still right?" has nothing to confirm.
    // It is part of "Add your hours" until there are hours (saving hours from the portal marks them checked too).
    if (it.key === 'hours_fresh' && !ok && !done.hours) {
      max += it.w; per.get(it.group).max += it.w;
      continue;
    }
    if (!ok && !it.fix) { coming.push({ ...it }); continue; }
    max += it.w; per.get(it.group).max += it.w;
    if (ok) { got += it.w; per.get(it.group).got += it.w; } else {
      // Waiting = something the owner already sent for this item is in our review queue (field-precise: a badge only
      // flags the item that badge belongs to). Photos count by uploads waiting (fresh-eyes 2026-11-08).
      let waiting = (it.fields || []).some((f) => pending.has(f));
      let sent = 0;
      if (it.key === 'photo_main' && photosWaiting > 0) { waiting = true; sent = photosWaiting; }
      if (it.key === 'photo_extra' && photosWaiting > 0 && Number(input && input.photoCount || 0) + photosWaiting >= PHOTOS_MIN) { waiting = true; sent = photosWaiting; }
      missing.push({ ...it, waiting, sent });
    }
  }
  const complete = missing.length === 0;
  const pct = complete ? 100 : Math.min(99, Math.floor((got / max) * 100));
  const groups = [...per.values()].filter((g) => g.max > 0).map((g) => ({ ...g, full: g.got === g.max }));
  // Biggest first, then the order of the spec.
  missing.sort((x, y) => (x.waiting - y.waiting) || (y.w - x.w));
  const declined = ITEMS.filter((it) => none.has(it.key) && !done[it.key] && !na[it.key]).map((it) => ({ ...it }));
  // Capped at a minute (Dayton): the quickest ones that fit in 60 seconds; the rest wait in the second list.
  const quick = [];
  let quickSeconds = 0;
  for (const it of missing.filter(isQuick).sort((x, y) => (SECONDS[x.key] - SECONDS[y.key]) || (y.w - x.w))) {
    if (quickSeconds + SECONDS[it.key] > QUICK_CAP_SECONDS) break;
    quick.push(it); quickSeconds += SECONDS[it.key];
  }
  const waitingList = missing.filter((it) => it.waiting);
  const later = missing.filter((it) => !it.waiting && !quick.includes(it));
  // The lighter part of the ring: what will count once we approve what was sent.
  const waitingW = waitingList.reduce((a, it) => a + it.w, 0);
  const pctWithWaiting = waitingW ? Math.min(100, Math.floor(((got + waitingW) / max) * 100)) : pct;
  return { pct, pctWithWaiting, got, max, complete, groups, missing, coming, declined, declared: [...declaredAll], minutes: minutesLeft(missing), quick, later, waiting: waitingList, quickSeconds };
}

// The weekly hours as one short line for "Are your hours still right?" (fresh-eyes 2026-11-08):
// "Mon closed · Tue–Thu 11:30 AM–9 PM · Fri 11:30 AM–10 PM". Days with the same times are grouped.
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_EN = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_FR = { mon: 'lun.', tue: 'mar.', wed: 'mer.', thu: 'jeu.', fri: 'ven.', sat: 'sam.', sun: 'dim.' };
function clockText(t, fr) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return String(t || '');
  const h = Number(m[1]), mi = m[2];
  if (fr) return mi === '00' ? `${h} h` : `${h} h ${mi}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mi === '00' ? '' : `:${mi}`} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}
function hoursLine(week, fr) {
  if (!week || typeof week !== 'object') return '';
  const key = (d) => JSON.stringify(Array.isArray(week[d]) ? week[d] : []);
  const parts = [];
  let i = 0;
  while (i < WEEK.length) {
    let j = i;
    while (j + 1 < WEEK.length && key(WEEK[j + 1]) === key(WEEK[i])) j++;
    const names = fr ? DAY_FR : DAY_EN;
    const days = i === j ? names[WEEK[i]] : `${names[WEEK[i]]}–${names[WEEK[j]]}`;
    const ranges = Array.isArray(week[WEEK[i]]) ? week[WEEK[i]] : [];
    const times = ranges.length ? ranges.map((r) => `${clockText(r[0], fr)}–${clockText(r[1], fr)}`).join(fr ? ' et ' : ' and ') : (fr ? 'fermé' : 'closed');
    parts.push(`${days} ${times}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The bar and its panel. `menuHref`: where "Add menu" goes. Nothing here is public: it is only ever put in the owner page.
function renderCompleteness(result, opts) {
  const o = opts || {};
  const fr = !!o.fr;
  const L = (en, f) => (fr ? f : en);
  const r = result;
  const waitingList = r.waiting || r.missing.filter((it) => it.waiting);
  const nw = waitingList.length;
  const left = r.missing.length - nw;
  const gName = new Map(GROUPS.map((g) => [g.key, fr ? g.fr : g.en]));
  const headline = r.complete ? L('Your page is complete', 'Votre fiche est complète') : L(`Your page is ${r.pct}% complete`, `Votre fiche est complète à ${r.pct} %`);
  // Never a big total up front: lead with what takes under a minute or two (2026-11-08).
  const quick = r.quick || [], later = r.later || r.missing;
  const nq = quick.length;
  const qMin = Math.ceil((r.quickSeconds || 0) / 60);
  const qTime = qMin <= 1 ? L('under a minute', 'moins d’une minute') : L(`about ${qMin} minutes`, `environ ${qMin} min`);
  // Things already sent and waiting for our check are never "left" (fresh-eyes 2026-11-08): they get their own count.
  const waitTxt = nw ? L(` · ${nw} waiting for our check${left ? '' : ' (usually within a day)'}`, ` · ${nw} en attente de notre vérification${left ? '' : ' (habituellement en moins d’une journée)'}`) : '';
  const sub = r.complete
    ? L('Nothing left to add. Thank you!', 'Il n’y a plus rien à ajouter. Merci!')
    : nq
      ? L(`${nq} quick ${nq === 1 ? 'one' : 'ones'}, ${qTime}${waitTxt}. Tap to start.`, `${nq} ${nq === 1 ? 'élément rapide' : 'éléments rapides'}, ${qTime}${waitTxt}. Touchez pour commencer.`)
      : left && r.missing.filter((it) => !it.waiting).every((it) => CEILING_KEYS.includes(it.key))
        ? L(`Last steps: ${r.missing.some((it) => !it.waiting && it.key === 'arrival') ? (r.missing.some((it) => !it.waiting && it.key !== 'arrival') ? 'photos and your storefront spot' : 'your storefront spot') : 'photos'}${waitTxt}. Tap to see.`,
          `Dernières étapes : ${r.missing.some((it) => !it.waiting && it.key === 'arrival') ? (r.missing.some((it) => !it.waiting && it.key !== 'arrival') ? 'les photos et l’emplacement de votre devanture' : 'l’emplacement de votre devanture') : 'les photos'}${waitTxt}. Touchez pour voir.`)
      : left
        ? L(`${left} ${left === 1 ? 'thing' : 'things'} left for when you have a few minutes${waitTxt}. Tap to see.`, `Il reste ${left} ${left === 1 ? 'élément' : 'éléments'} pour quand vous aurez quelques minutes${waitTxt}. Touchez pour voir.`)
        : L(`Nothing left for you to do${waitTxt}.`, `Rien d’autre à faire pour vous${waitTxt}.`);
  const btn = (it) => {
    const label = esc(fr ? it.btnFr : it.btnEn);
    if (it.waiting) return `<span class="op-cb-wait">${L('Waiting for review', 'En attente de vérification')}</span>`;
    if (it.target && it.target.href) return `<a class="op-cb-btn" href="${esc(o.menuHref || '#')}">${label}</a>`;
    if (it.target) return `<button type="button" class="op-cb-btn" data-cb-task="${esc(it.target.task)}" data-cb-id="${esc(it.target.id || '')}">${label}</button>`;
    return '';
  };
  // "We don't have one" (2026-11-08): a second, quieter button on the items a place may not offer. Only when the
  // owner can say so (o.canDecline) and nothing is waiting for review on that item.
  const noneBtn = (it) => (o.canDecline && it.noneEn && !it.waiting
    ? `<button type="button" class="op-cb-none" data-cb-none="${esc(it.key)}">${esc(fr ? it.noneFr : it.noneEn)}</button>` : '');
  // One tap right in the row (fresh-eyes 2026-11-08): the hours as text with "Yes, these are right", and the
  // average-spend estimate with "Yes, that's right". "Change them/it" jumps to the editor. Saved in place, no reload.
  const oneTap = (it) => {
    if (it.waiting) return null;
    if (it.key === 'hours_fresh' && o.hoursText) {
      return { val: o.hoursText, save: { hours_checked: true }, yes: L('Yes, these are right', 'Oui, elles sont exactes'),
        done: L('Thanks! Your hours are marked as checked today.', 'Merci! Vos heures sont marquées comme vérifiées aujourd’hui.'),
        change: L('Change them', 'Les modifier'), task: 'hours', id: 'hours' };
    }
    if (it.key === 'avg_spend' && Number.isInteger(o.avgEstimate)) {
      const money = fr ? `${o.avgEstimate} $` : `$${o.avgEstimate}`;
      return { val: L(`Our estimate from your menu: about ${money}`, `Notre estimation selon votre menu : environ ${money}`), save: { avg_spend: String(o.avgEstimate) },
        yes: L('Yes, that’s right', 'Oui, c’est exact'), done: L(`Thanks! Your page shows about ${money}.`, `Merci! Votre fiche indique environ ${money}.`),
        change: L('Change it', 'La modifier'), task: 'more', id: 'opAvg' };
    }
    return null;
  };
  const row = (it) => {
    const t = oneTap(it);
    // The hours read one day group per line.
    const why = t ? `<span>${esc(fr ? it.whyFr : it.whyEn)}</span><span class="op-cb-val">${esc(t.val).split(' · ').join('<br>')}</span>` : `<span>${esc(fr ? it.whyFr : it.whyEn)}</span>`;
    const act = t
      ? `<button type="button" class="op-cb-btn" data-cb-save="${esc(JSON.stringify(t.save))}" data-cb-done="${esc(t.done)}">${esc(t.yes)}</button><button type="button" class="op-cb-link" data-cb-task="${esc(t.task)}" data-cb-id="${esc(t.id)}">${esc(t.change)}</button>`
      : btn(it);
    return `<li class="op-cb-row" data-cb-item="${esc(it.key)}"><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><div class="op-cb-txt"><strong>${esc(fr ? it.fr : it.en)}</strong>${why}</div><div class="op-cb-act">${act}</div>${noneBtn(it) ? `<div class="op-cb-alt">${noneBtn(it)}</div>` : ''}</li>`;
  };
  const quickHtml = nq ? `<h3>${L('Quick ones', 'Rapides')}</h3><p class="op-cb-note op-cb-lead">${qMin <= 1 ? L('Under a minute for all of them.', 'Moins d’une minute en tout.') : L(`About ${qMin} minutes for all of them.`, `Environ ${qMin} min en tout.`)}</p><ul class="op-cb-list">${quick.map(row).join('')}</ul>` : '';
  const laterHtml = later.length ? `<h3${nq ? ' class="op-cb-h3"' : ''}>${L('When you have a few minutes', 'Quand vous aurez quelques minutes')}</h3><p class="op-cb-note op-cb-lead">${L('Do them one at a time, whenever suits you. Photos and a description make the biggest difference.', 'Faites-les un à la fois, quand ça vous convient. Les photos et une description font la plus grande différence.')}</p><ul class="op-cb-list">${later.map(row).join('')}</ul>` : '';
  const waitingHtml = nw ? `<h3 class="op-cb-h3">${L('Waiting for our check', 'En attente de notre vérification')}</h3><p class="op-cb-note op-cb-lead">${L('You sent these. We usually check within a day, and then they count.', 'Vous avez envoyé ceci. Nous vérifions habituellement en moins d’une journée, puis cela compte.')}</p><ul class="op-cb-declined op-cb-waiting">${waitingList.map((it) => `<li><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><span class="op-cb-dtxt"><strong>${esc(fr ? it.fr : it.en)}</strong><span class="op-cb-sent">${it.sent ? L(`${it.sent} photo${it.sent === 1 ? '' : 's'} sent`, `${it.sent} photo${it.sent === 1 ? '' : 's'} envoyée${it.sent === 1 ? '' : 's'}`) : L('Sent', 'Envoyé')} &middot; ${L('waiting for our check', 'en attente de vérification')}</span></span></li>`).join('')}</ul>` : '';
  // The last steps (live check 2026-11-08): photos and the storefront spot, said plainly once they are among what's left.
  const leftKeys = r.missing.filter((it) => !it.waiting).map((it) => it.key);
  const ceilPhotos = leftKeys.includes('photo_main') || leftKeys.includes('photo_extra');
  const ceilDoor = leftKeys.includes('arrival');
  const onlyCeiling = leftKeys.length > 0 && leftKeys.every((k) => CEILING_KEYS.includes(k));
  const ceilingText = ceilPhotos && ceilDoor ? L('Photos and your storefront spot are the last steps to 100%.', 'Les photos et l’emplacement de votre devanture sont les dernières étapes vers 100 %.')
    : ceilPhotos ? L('Photos are the last step to 100%.', 'Les photos sont la dernière étape vers 100 %.')
      : ceilDoor ? L('Your storefront spot is the last step to 100%.', 'L’emplacement de votre devanture est la dernière étape vers 100 %.') : '';
  const ceilingHtml = ceilingText ? `<p class="op-cb-note op-cb-ceiling">${ceilingText}${onlyCeiling ? '' : L(' Do them when you’re at your place with a few minutes.', ' Faites-les quand vous êtes sur place avec quelques minutes.')}</p>` : '';
  const still = quickHtml + laterHtml + ceilingHtml + waitingHtml;
  // Items the owner can't fill in yet but CAN already say they don't offer (Reservations, Takeout) get their own short
  // list, so "You can't fill these in yet" never sits next to a button that does something (2026-11-08).
  const comingAsk = r.coming.filter((it) => noneBtn(it));
  const comingPlain = r.coming.filter((it) => !noneBtn(it));
  const askHtml = comingAsk.length ? `<h3 class="op-cb-h3">${L('Don’t offer these?', 'Vous n’offrez pas ceci?')}</h3><p class="op-cb-note">${L('If you don’t, tap to tell us. It counts as done.', 'Si c’est le cas, touchez pour nous le dire. Cela compte comme fait.')}</p><ul class="op-cb-soon">${comingAsk.map((it) => `<li><strong>${esc(fr ? it.fr : it.en)}</strong><div>${noneBtn(it)}</div></li>`).join('')}</ul>` : '';
  const comingHtml = askHtml + (comingPlain.length ? `<h3 class="op-cb-h3">${L('We’re adding these', 'Nous ajoutons ceci')}</h3><p class="op-cb-note">${L('You can’t fill these in yet. They’ll count once you can.', 'Vous ne pouvez pas encore les remplir. Ils compteront dès que ce sera possible.')}</p><ul class="op-cb-soon">${comingPlain.map((it) => `<li><strong>${esc(fr ? it.fr : it.en)}</strong> <span>${esc(fr ? it.whyFr : it.whyEn)}</span></li>`).join('')}</ul>` : '');
  const groups = r.groups.map((g) => `<div class="op-cb-g${g.full ? ' full' : ''}"><b>${esc(gName.get(g.key))}${g.full ? ' ✓' : ''}</b><em>${L(`${g.got} of ${g.max}`, `${g.got} sur ${g.max}`)}</em><div class="op-cb-bar"><i style="width:${Math.round((g.got / g.max) * 100)}%"></i></div></div>`).join('');
  const declined = r.declined || [];
  const declinedHtml = o.canDecline && declined.length ? `<h3 class="op-cb-h3">${L('You told us you don’t have these', 'Vous nous avez dit ne pas avoir ceci')}</h3><ul class="op-cb-declined">${declined.map((it) => `<li><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><span class="op-cb-dtxt"><strong>${esc(fr ? it.fr : it.en)}</strong><span>${L('Not offered', 'Non offert')} ✓</span></span><button type="button" class="op-cb-undo" data-cb-undo="${esc(it.key)}">${L('Undo', 'Annuler')}</button></li>`).join('')}</ul><p class="op-cb-note">${L('These count as done. Only you see them: nothing about them shows on your public page.', 'Ils comptent comme faits. Vous seul les voyez : rien n’en paraît sur votre fiche publique.')}</p>` : '';
  // Next to the edit-page fields: the same button, placed by the page script under each field it fills.
  const inline = o.canDecline ? r.missing.filter((it) => it.noneEn && !it.waiting && it.target && it.target.id).map((it) => ({ key: it.key, id: it.target.id, label: fr ? it.noneFr : it.noneEn })) : [];
  const dataAttrs = o.canDecline ? ` data-cb-declared="${esc(JSON.stringify(r.declared || []))}" data-cb-inline="${esc(JSON.stringify(inline))}" data-cb-wrong="${esc(L('Sorry, that could not be saved. Please reload the page and try again.', 'Désolé, cela n’a pas pu être enregistré. Rechargez la page et réessayez.'))}"` : '';
  const yay = ` data-cb-pct="${r.pct}" data-cb-yay="${esc(L('Nice! You’re now at {p}%.', 'Bravo! Vous êtes maintenant à {p} %.'))}"`;
  return `<section class="op-cb" id="opComplete" data-task="home all" aria-labelledby="opCbHead"${dataAttrs}${yay}>
      <button type="button" class="op-cb-head" id="opCbToggle" aria-expanded="false" aria-controls="opCbPanel"><span class="op-cb-ring${r.pct >= 100 ? ' op-cb-ring-100' : ''}" style="--p:${r.pct};--w:${r.pctWithWaiting != null ? r.pctWithWaiting : r.pct}" aria-hidden="true"><b>${r.pct}%</b></span><span class="op-cb-title"><strong id="opCbHead">${esc(headline)}</strong><span>${esc(sub)}</span></span><span class="op-cb-chev" aria-hidden="true"></span></button>
      <p class="op-cb-yay" id="opCbYay" role="status" hidden></p>
      <div class="op-cb-panel" id="opCbPanel" hidden>${o.canDecline ? `
        <p class="op-cb-err" id="opCbErr" role="alert" hidden></p>` : ''}
        ${still}
        <h3 class="op-cb-h3">${L('Done so far', 'Déjà fait')}</h3><div class="op-cb-groups">${groups}</div>
        ${declinedHtml}
        ${comingHtml}
        <p class="op-cb-note">${L('Only you see this score. It never changes where you show up in search.', 'Vous seul voyez ce pointage. Il ne change jamais votre position dans les recherches.')}</p>
      </div>
    </section>`;
}

const COMPLETENESS_CSS = `
    body.owner-page .op-cb { margin: 14px 0 6px; background: #fff; border-radius: 16px; box-shadow: 0 1px 2px rgba(42,32,25,.06), 0 6px 18px rgba(42,32,25,.06); }
    body.owner-page .op-cb-head { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 44px; padding: 14px 16px; background: none; border: 0; border-radius: 16px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    body.owner-page .op-cb-ring { --p: 0; position: relative; flex: 0 0 60px; width: 60px; height: 60px; border-radius: 50%; --w: 0; background: conic-gradient(#2A6B67 calc(var(--p) * 1%), #A9CFC9 0 calc(var(--w) * 1%), #EAE6D9 0); }
    body.owner-page .op-cb-ring::before { content: ""; position: absolute; inset: 7px; background: #fff; border-radius: 50%; }
    body.owner-page .op-cb-ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 1rem; font-weight: 800; color: #1E4F4C; }
    body.owner-page .op-cb-ring-100 b { font-size: .8rem; }
    body.owner-page .op-cb-title { display: block; min-width: 0; }
    body.owner-page .op-cb-title strong { display: block; font-size: 1.15rem; line-height: 1.2; color: #1B2B3A; }
    body.owner-page .op-cb-title span { display: block; margin-top: 2px; font-size: .92rem; color: #6B5D54; font-weight: 600; }
    body.owner-page .op-cb-chev { margin-left: auto; flex: none; width: 12px; height: 12px; border-right: 3px solid #1E4F4C; border-bottom: 3px solid #1E4F4C; transform: rotate(45deg); transition: transform .2s; }
    body.owner-page .op-cb-head[aria-expanded="true"] .op-cb-chev { transform: rotate(-135deg); }
    body.owner-page .op-cb-panel { padding: 4px 16px 16px; }
    body.owner-page .op-cb-panel h3 { margin: 14px 0 6px; font-size: 1.05rem; color: #1B2B3A; }
    body.owner-page .op-cb-list, body.owner-page .op-cb-soon { list-style: none; margin: 0; padding: 0; }
    body.owner-page .op-cb-row { display: grid; grid-template-columns: 36px 1fr; gap: 6px 12px; padding: 12px 0; border-top: 1px solid rgba(42,32,25,.1); }
    body.owner-page .op-cb-row:first-child { border-top: 0; }
    body.owner-page .op-cb-ico { width: 36px; height: 36px; border-radius: 10px; background: #F8EBCB; display: grid; place-items: center; font-size: 1.1rem; }
    body.owner-page .op-cb-txt strong { display: block; font-weight: 800; }
    body.owner-page .op-cb-txt span { display: block; color: #6B5D54; font-size: .9rem; font-weight: 600; }
    body.owner-page .op-cb-act { grid-column: 2; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    body.owner-page .op-cb-pts { padding: 3px 10px; border-radius: 999px; background: #F8EBCB; color: #67470C; font-size: .8rem; font-weight: 800; box-shadow: inset 0 0 0 1px #E6CF93; }
    body.owner-page .op-cb-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #1E4F4C; color: #fff; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
    body.owner-page .op-cb-wait { color: #67470C; font-weight: 800; font-size: .88rem; }
    body.owner-page .op-cb-groups { display: grid; gap: 10px; }
    body.owner-page .op-cb-g { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; }
    body.owner-page .op-cb-g b { font-weight: 800; font-size: .95rem; }
    body.owner-page .op-cb-g.full b { color: #1E6B3A; }
    body.owner-page .op-cb-g em { font-style: normal; color: #6B5D54; font-weight: 800; font-size: .85rem; }
    body.owner-page .op-cb-bar { grid-column: 1 / -1; height: 7px; background: #EAE6D9; border-radius: 99px; overflow: hidden; }
    body.owner-page .op-cb-bar i { display: block; height: 100%; background: #2A6B67; border-radius: 99px; }
    body.owner-page .op-cb-g.full .op-cb-bar i { background: #1E6B3A; }
    body.owner-page .op-cb-note { margin: 10px 0 0; color: #6B5D54; font-size: .85rem; font-weight: 600; }
    body.owner-page .op-cb-soon li { padding: 6px 0; font-size: .9rem; }
    body.owner-page .op-cb-soon li span { display: block; color: #6B5D54; font-weight: 600; }
    body.owner-page .op-cb-alt { grid-column: 2 / -1; }
    body.owner-page .op-cb-none, body.owner-page .op-cb-undo { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid rgba(42,32,25,.25); border-radius: 999px; background: #fff; color: #4A3B32; font: inherit; font-size: .9rem; font-weight: 700; text-align: left; cursor: pointer; }
    body.owner-page .op-cb-none:disabled, body.owner-page .op-cb-undo:disabled { opacity: .6; cursor: progress; }
    body.owner-page .op-cb-soon .op-cb-none { margin-top: 6px; }
    body.owner-page .op-cb-inline { margin: 8px 0 4px; }
    body.owner-page .op-cb-declined { list-style: none; margin: 0; padding: 0; }
    body.owner-page .op-cb-declined li { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid rgba(42,32,25,.1); }
    body.owner-page .op-cb-declined li:first-child { border-top: 0; }
    body.owner-page .op-cb-dtxt strong { display: block; font-weight: 800; }
    body.owner-page .op-cb-dtxt span { display: block; color: #1E6B3A; font-size: .88rem; font-weight: 800; }
    body.owner-page .op-cb-lead { margin: 0 0 6px; }
    body.owner-page .op-cb-txt .op-cb-val { margin-top: 4px; color: #1B2B3A; font-weight: 800; }
    body.owner-page .op-cb-act { flex-wrap: wrap; justify-content: flex-start; }
    body.owner-page .op-cb-link { min-height: 44px; padding: 0 12px; border: 0; background: none; color: #1E4F4C; font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; }
    body.owner-page .op-cb-btn:disabled { opacity: .6; cursor: progress; }
    body.owner-page .op-cb-waiting .op-cb-sent { color: #67470C; }
    body.owner-page .op-cb-hl { outline: 3px solid #E9B949; outline-offset: 4px; border-radius: 8px; }
    body.owner-page .op-cb-yay { margin: 0 16px 14px; padding: 10px 12px; border-radius: 10px; background: #E7F3EC; color: #1E6B3A; font-weight: 800; }
    body.owner-page .op-cb-err { margin: 8px 0 0; padding: 10px 12px; border-radius: 10px; background: #FBE9E7; color: #8A2A1B; font-weight: 700; }
    @media (min-width: 900px) { body.owner-page .op-cb-row { grid-template-columns: 36px 1fr auto; align-items: center; } body.owner-page .op-cb-act { grid-column: 3; } }`;

// Runs inside the owner page script (setTask and TASK_OF are in scope there).
// Fresh-eyes fixes (2026-11-08):
//   - every answer saved from the bar ("We don't have one", Undo, "Yes, these are right", "Yes, that's right") saves in
//     place and redraws the bar from /completeness: no reload, so nothing the owner typed elsewhere is ever lost and the
//     browser never asks "Leave site?";
//   - jump buttons open the section, scroll the named field just under the header (no smooth-scroll drift), focus it
//     and highlight it for a moment;
//   - window.opCbRefresh() lets the page's other live saves (cuisine, Plan your visit, average spend) redraw the bar.
// No backslashes or regexes in here: this text is pasted into a template literal.
const COMPLETENESS_SCRIPT = `
  (function(){
    var sec = document.getElementById('opComplete'), tg = document.getElementById('opCbToggle'), pn = document.getElementById('opCbPanel');
    if (!sec || !tg || !pn) return;
    var canDecline = sec.hasAttribute('data-cb-declared');
    var declared = [];
    function readDeclared(){ try { declared = JSON.parse(sec.getAttribute('data-cb-declared') || '[]') || []; } catch (e) { declared = []; } }
    readDeclared();
    function setOpen(open){ tg.setAttribute('aria-expanded', open ? 'true' : 'false'); pn.hidden = !open; }
    function storeKey(){ var lp = location.pathname; return 'opCbPct:' + (lp.indexOf('/fr/') === 0 ? lp.slice(3) : lp); }
    // Progress: when the score went up since this owner last saw it, say so once (with what was just saved, if any).
    function progress(lead){
      var y = document.getElementById('opCbYay'); if (!y) return;
      var now = Number(sec.getAttribute('data-cb-pct')), msg = lead || '';
      try {
        var was = Number(sessionStorage.getItem(storeKey()) || localStorage.getItem(storeKey()));
        if (was && now > was) msg = (msg ? msg + ' ' : '') + sec.getAttribute('data-cb-yay').split('{p}').join(String(now));
        sessionStorage.setItem(storeKey(), String(now)); localStorage.setItem(storeKey(), String(now));
      } catch (e) { /* storage off: only the lead */ }
      if (msg) { y.textContent = msg; y.hidden = false; }
    }
    progress('');
    try { if (sessionStorage.getItem('opCbOpen') === '1') { sessionStorage.removeItem('opCbOpen'); setOpen(true); } } catch (e) { /* storage off */ }
    // "We don't have one" next to the edit-page fields, placed under each field it answers.
    function placeInline(){
      Array.prototype.forEach.call(document.querySelectorAll('.op-cb-inline'), function(x){ x.parentNode.removeChild(x); });
      if (!canDecline) return;
      var inline = []; try { inline = JSON.parse(sec.getAttribute('data-cb-inline') || '[]') || []; } catch (e) { inline = []; }
      inline.forEach(function(x){
        var el = document.getElementById(x.id); if (!el || !el.parentNode) return;
        var p = document.createElement('p'); p.className = 'op-cb-inline';
        var b = document.createElement('button'); b.type = 'button'; b.className = 'op-cb-none'; b.setAttribute('data-cb-none', x.key); b.textContent = x.label;
        // A section (happy hour, specials, nights, badges) gets it inside, so it shows and hides with that section.
        p.appendChild(b); if (el.tagName === 'DETAILS') el.appendChild(p); else el.parentNode.insertBefore(p, el.nextSibling);
      });
    }
    placeInline();
    // Jumps land on the field: open every enclosing section, put it just under the header, focus, highlight.
    function headerOffset(){
      var h = document.querySelector('header'); var off = 16;
      if (h) { var cs = getComputedStyle(h); if (cs.position === 'fixed' || cs.position === 'sticky') off += Math.max(0, h.getBoundingClientRect().bottom); }
      return off;
    }
    function jumpTo(id){
      var el = id ? document.getElementById(id) : null; if (!el) return;
      if (el.tagName === 'DETAILS') el.open = true;
      var d = el.parentElement ? el.parentElement.closest('details') : null;
      while (d) { d.open = true; d = d.parentElement ? d.parentElement.closest('details') : null; }
      var root = document.documentElement;
      // A text box lines up with its label, so the owner sees what it is for.
      var box = (el.matches('input,select,textarea') && el.closest('.form-field,.op-visit-field')) || el;
      var lb = el.getAttribute('aria-labelledby'); var lab = lb ? document.getElementById(lb) : null;
      function go(){
        var prev = root.style.scrollBehavior; root.style.scrollBehavior = 'auto';
        var top = box.getBoundingClientRect().top;
        if (lab && lab.getBoundingClientRect().height) top = Math.min(top, lab.getBoundingClientRect().top);
        window.scrollTo(0, Math.max(0, top + window.pageYOffset - headerOffset()));
        root.style.scrollBehavior = prev;
      }
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        go();
        var f = el.matches('input,select,textarea') ? el : null;
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
        el.classList.add('op-cb-hl'); setTimeout(function(){ el.classList.remove('op-cb-hl'); }, 1800);
        setTimeout(go, 300);
      }); });
    }
    window.opCbJump = jumpTo;
    function val(id){ var e = document.getElementById(id); return e ? e.value : ''; }
    function post(changes){
      var body = { changes: changes, note: '', contact_name: val('opName'), contact_email: typeof emailVal === 'function' ? emailVal('opEmail') : val('opEmail'),
        company_website: val('opHp'), started_at: typeof startedAt !== 'undefined' ? startedAt : Date.now() };
      return fetch(location.pathname + '/changes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r){ return r.json(); });
    }
    function showErr(m){
      var err = document.getElementById('opCbErr');
      if (err) { err.textContent = m || sec.getAttribute('data-cb-wrong') || ''; err.hidden = false; setOpen(true); err.scrollIntoView({ block: 'center' }); }
    }
    // Redraw the bar from what is stored now. Keeps it open or shut, and the page view it was in.
    function refresh(lead){
      return fetch(location.pathname + '/completeness', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if (!j || !j.ok || !j.html) return;
          var wasOpen = tg.getAttribute('aria-expanded') === 'true';
          var tmp = document.createElement('div'); tmp.innerHTML = j.html;
          var n = tmp.querySelector('#opComplete'); if (!n) return;
          n.className = sec.className;
          sec.parentNode.replaceChild(n, sec);
          sec = n; tg = document.getElementById('opCbToggle'); pn = document.getElementById('opCbPanel');
          readDeclared(); setOpen(wasOpen); placeInline(); progress(lead || '');
        })
        .catch(function(){ /* the bar just stays as it was */ });
    }
    window.opCbRefresh = refresh;
    function saveNone(list, btn){
      var err = document.getElementById('opCbErr'); if (err) err.hidden = true;
      btn.disabled = true;
      post({ not_offered: list }).then(function(j){
        if (j && j.ok) { declared = list; return refresh(''); }
        btn.disabled = false;
        showErr((j && j.errors && (j.errors.not_offered || j.errors.form)) || (j && j.error));
      }).catch(function(){ btn.disabled = false; showErr(''); });
    }
    function saveOne(btn){
      var changes; try { changes = JSON.parse(btn.getAttribute('data-cb-save')); } catch (e) { return; }
      var err = document.getElementById('opCbErr'); if (err) err.hidden = true;
      btn.disabled = true;
      post(changes).then(function(j){
        if (j && j.ok) {
          // Keep the matching boxes further down the page in step.
          if (changes.hours_checked) {
            var hb = document.getElementById('opHoursOkBtn'), hn = document.getElementById('opHoursOkNote'), hd = document.getElementById('opHoursOkDone'), hx = document.getElementById('opHoursOk');
            if (hb) hb.hidden = true; if (hn) hn.hidden = true; if (hd && hx) { hd.textContent = hx.getAttribute('data-done'); hd.hidden = false; }
          }
          if (changes.avg_spend && typeof avgSaved === 'function') avgSaved(Number(changes.avg_spend));
          return refresh(btn.getAttribute('data-cb-done') || '');
        }
        btn.disabled = false;
        var e2 = (j && j.errors) || {};
        showErr(e2.hours_checked || e2.avg_spend || e2.form || (j && j.error));
      }).catch(function(){ btn.disabled = false; showErr(''); });
    }
    document.addEventListener('click', function(e){
      if (!e.target.closest) return;
      if (e.target.closest('#opCbToggle')) { setOpen(tg.getAttribute('aria-expanded') !== 'true'); return; }
      var j = e.target.closest('#opComplete [data-cb-task]');
      if (j) { setTask(j.getAttribute('data-cb-task')); jumpTo(j.getAttribute('data-cb-id')); return; }
      var sv = e.target.closest('#opComplete [data-cb-save]');
      if (sv) { saveOne(sv); return; }
      var b = e.target.closest('[data-cb-none],[data-cb-undo]'); if (!b || !canDecline) return;
      var k = b.getAttribute('data-cb-none');
      if (k) { if (declared.indexOf(k) < 0) saveNone(declared.concat([k]), b); return; }
      k = b.getAttribute('data-cb-undo');
      saveNone(declared.filter(function(x){ return x !== k; }), b);
    });
  })();`;

module.exports = { HAPPY_HOUR_BADGE_COPY, CEILING_KEYS, ITEMS, GROUPS, NONE_KEYS, NONE_MAX, SECONDS, minutesLeft, hoursLine, QUICK_SECONDS, QUICK_CAP_SECONDS, isQuick, doneMap, HOURS_FRESH_DAYS, DESCRIPTION_MIN, PHOTOS_MIN, scoreCompleteness, renderCompleteness, COMPLETENESS_CSS, COMPLETENESS_SCRIPT };
