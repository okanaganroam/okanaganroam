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
    en: 'Weekly opening hours', fr: 'Heures d’ouverture', whyEn: 'The times you’re open each day.', whyFr: 'Vos heures d’ouverture chaque jour.', btnEn: 'Add hours', btnFr: 'Ajouter', icon: '🕑' },
  { key: 'hours_fresh', group: 'hours', w: 4, fix: true, target: { task: 'hours', id: 'opHoursOk' }, fields: ['hours', 'hours_checked'],
    en: 'Hours checked in the last 90 days', fr: 'Heures vérifiées ces 90 derniers jours', whyEn: 'Still right? One tap tells visitors they were checked today.', whyFr: 'Toujours exactes? Un seul toucher indique aux visiteurs qu’elles ont été vérifiées aujourd’hui.', btnEn: 'Confirm hours', btnFr: 'Confirmer', icon: '🔄' },
  { key: 'photo_main', group: 'photos', w: 8, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'A real photo of your place', fr: 'Une vraie photo de votre établissement', whyEn: 'Real photos only, taken by you. Never a stand-in.', whyFr: 'De vraies photos seulement, prises par vous.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'photo_extra', group: 'photos', w: 6, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'At least 3 photos', fr: 'Au moins 3 photos', whyEn: 'Food, your room, your patio.', whyFr: 'Plats, salle, terrasse.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'avg_spend', group: 'menu', w: 4, fix: true, target: { task: 'more', id: 'avgspend' }, fields: ['avg_spend'],
    en: 'Average spend per person', fr: 'Dépense moyenne par personne', whyEn: 'One main and a non-alcoholic drink, in dollars.', whyFr: 'Un plat principal et une boisson sans alcool, en dollars.', btnEn: 'Enter amount', btnFr: 'Indiquer', icon: '💵' },
  { key: 'menu', group: 'menu', w: 8, fix: true, target: { href: 'menu' }, fields: ['menu_url'],
    en: 'Your menu', fr: 'Votre menu', whyEn: 'Add a link, or just take a photo of the menu.', whyFr: 'Ajoutez un lien, ou prenez simplement le menu en photo.', btnEn: 'Add menu', btnFr: 'Ajouter le menu', icon: '📖' },
  { key: 'dietary', noneEn: 'No vegan, veggie or gluten-free options', noneFr: 'Pas d’options végé ou sans gluten', group: 'menu', w: 4, fix: true, target: { task: 'more', id: 'badges' }, fields: ['badges'],
    en: 'Dietary options', fr: 'Options alimentaires', whyEn: 'Tick vegan, vegetarian or gluten-free if you offer them.', whyFr: 'Cochez végétalien, végétarien ou sans gluten si vous en offrez.', btnEn: 'Tick options', btnFr: 'Cocher', icon: '🥗' },
  { key: 'happy_hour', noneEn: 'We don’t have a happy hour', noneFr: 'Nous n’avons pas de happy hour', group: 'offers', w: 4, fix: true, target: { task: 'happy', id: 'happy' }, fields: ['happy_hour', 'happy_hour_deals'],
    en: 'Happy hour times and deals', fr: 'Heures et spéciaux du happy hour', whyEn: 'When it runs and what’s on special.', whyFr: 'Quand il a lieu et ce qui est en spécial.', btnEn: 'Add happy hour', btnFr: 'Ajouter', icon: '🍹' },
  { key: 'specials', noneEn: 'We don’t run specials', noneFr: 'Nous n’avons pas de spéciaux', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'specials' }, fields: ['specials'],
    en: 'Weekly specials', fr: 'Spéciaux de la semaine', whyEn: 'Nightly deals or a weekly feature.', whyFr: 'Spéciaux du soir ou de la semaine.', btnEn: 'Add specials', btnFr: 'Ajouter', icon: '⭐' },
  { key: 'entertainment', noneEn: 'We don’t host music or events', noneFr: 'Ni musique ni événements chez nous', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'weekly-nights' }, fields: ['weekly_nights', 'badges'],
    en: 'Live music or events', fr: 'Musique en direct ou événements', whyEn: 'Trivia night, live music, sports on the TV.', whyFr: 'Soirée-questionnaire, musique en direct, sports à la télé.', btnEn: 'Add a night', btnFr: 'Ajouter', icon: '🎶' },
  // "Plan your visit" lines (2026-11-08): the owner writes them in the "Plan your visit" section of the edit page.
  { key: 'pyv_known', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitKnown' }, fields: ['visit_rows'],
    en: 'Known for', fr: 'Connu pour', whyEn: 'One line on what people come back for.', whyFr: 'Une ligne sur ce pour quoi les gens reviennent.', btnEn: 'Write it', btnFr: 'Écrire', icon: '👍' },
  { key: 'pyv_reservations', noneEn: 'We don’t take reservations', noneFr: 'Nous ne prenons pas de réservations', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitReservations' }, fields: ['visit_rows', 'booking_url'],
    en: 'Reservations', fr: 'Réservations', whyEn: 'How to book, or walk-ins only.', whyFr: 'Comment réserver, ou sans réservation seulement.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '📅' },
  { key: 'pyv_takeout', noneEn: 'No takeout or delivery', noneFr: 'Ni plats à emporter ni livraison', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitTakeout' }, fields: ['visit_rows'],
    en: 'Takeout and delivery', fr: 'À emporter et livraison', whyEn: 'Order to go? Which delivery apps?', whyFr: 'Pour emporter? Quelles applis de livraison?', btnEn: 'Add it', btnFr: 'Ajouter', icon: '🥡' },
  { key: 'pyv_dietary', group: 'visit', w: 2, fix: true, target: { task: 'more', id: 'opVisitDietary' }, fields: ['visit_rows'],
    en: 'Dietary note', fr: 'Note alimentaire', whyEn: 'What you can do for allergies and diets.', whyFr: 'Ce que vous pouvez faire pour les allergies et les régimes.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '🌱' },
  { key: 'pyv_groups', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitGroups' }, fields: ['visit_rows'],
    en: 'Groups and good to know', fr: 'Groupes et bon à savoir', whyEn: 'Large parties, parking, kids, anything that helps.', whyFr: 'Grands groupes, stationnement, enfants, tout ce qui aide.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '👥' },
  { key: 'description', group: 'about', w: 6, fix: true, target: { task: 'contact', id: 'opDescriptionLabel' }, fields: ['description'],
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
    avg_spend: Number.isInteger(i.avgSpend),
    menu: nonBlank(i.menuUrl) || !!i.hasPublishedMenu,
    dietary: !!(i.vegan || i.vegetarian || i.glutenFree) || labels.has('dietary'),
    happy_hour: !!i.hasHappyHour,
    specials: Number(i.specialsCount) > 0,
    entertainment: !!(i.liveMusic || i.sportsTv) || Number(i.nightsCount) > 0,
    pyv_known: labels.has('known for'),
    pyv_reservations: labels.has('reservations') || nonBlank(i.bookingUrl),
    pyv_takeout: labels.has('takeout') || labels.has('to go'),
    pyv_dietary: labels.has('dietary'),
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
  const none = new Set(((input && input.declaredNone) || []).filter((k) => NONE_KEYS.includes(k)));
  const pending = o.pending || new Set();
  const na = {};
  // Happy hour is only asked of places that serve alcohol: a non-alcoholic place with no happy hour is exempt.
  if (input && input.nonalcoholic && !done.happy_hour) na.happy_hour = true;
  let got = 0, max = 0;
  const per = new Map(GROUPS.map((g) => [g.key, { key: g.key, got: 0, max: 0 }]));
  const missing = [], coming = [];
  for (const it of ITEMS) {
    if (na[it.key]) continue;
    const ok = done[it.key] || none.has(it.key);
    if (!ok && !it.fix) { coming.push({ ...it }); continue; }
    max += it.w; per.get(it.group).max += it.w;
    if (ok) { got += it.w; per.get(it.group).got += it.w; } else {
      missing.push({ ...it, waiting: (it.fields || []).some((f) => pending.has(f)) });
    }
  }
  const complete = missing.length === 0;
  const pct = complete ? 100 : Math.min(99, Math.floor((got / max) * 100));
  const groups = [...per.values()].filter((g) => g.max > 0).map((g) => ({ ...g, full: g.got === g.max }));
  // Biggest first, then the order of the spec.
  missing.sort((x, y) => (x.waiting - y.waiting) || (y.w - x.w));
  const declined = ITEMS.filter((it) => none.has(it.key) && !done[it.key] && !na[it.key]).map((it) => ({ ...it }));
  return { pct, got, max, complete, groups, missing, coming, declined, declared: [...none] };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The bar and its panel. `menuHref`: where "Add menu" goes. Nothing here is public: it is only ever put in the owner page.
function renderCompleteness(result, opts) {
  const o = opts || {};
  const fr = !!o.fr;
  const L = (en, f) => (fr ? f : en);
  const r = result;
  const left = r.missing.length;
  const gName = new Map(GROUPS.map((g) => [g.key, fr ? g.fr : g.en]));
  const headline = r.complete ? L('Your page is complete', 'Votre fiche est complète') : L(`Your page is ${r.pct}% complete`, `Votre fiche est complète à ${r.pct} %`);
  const sub = r.complete
    ? L('Nothing left to add. Thank you!', 'Il n’y a plus rien à ajouter. Merci!')
    : L(`${left} ${left === 1 ? 'thing' : 'things'} left. Tap to see what.`, `Il reste ${left} ${left === 1 ? 'élément' : 'éléments'}. Touchez pour voir lesquels.`);
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
  const row = (it) => `<li class="op-cb-row"><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><div class="op-cb-txt"><strong>${esc(fr ? it.fr : it.en)}</strong><span>${esc(fr ? it.whyFr : it.whyEn)}</span></div><div class="op-cb-act"><span class="op-cb-pts">+${it.w}</span>${btn(it)}</div>${noneBtn(it) ? `<div class="op-cb-alt">${noneBtn(it)}</div>` : ''}</li>`;
  const still = r.missing.length ? `<h3>${L('Still to add', 'Reste à ajouter')}</h3><ul class="op-cb-list">${r.missing.map(row).join('')}</ul>` : '';
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
  return `<section class="op-cb" id="opComplete" data-task="home all" aria-labelledby="opCbHead"${dataAttrs}>
      <button type="button" class="op-cb-head" id="opCbToggle" aria-expanded="false" aria-controls="opCbPanel"><span class="op-cb-ring${r.pct >= 100 ? ' op-cb-ring-100' : ''}" style="--p:${r.pct}" aria-hidden="true"><b>${r.pct}%</b></span><span class="op-cb-title"><strong id="opCbHead">${esc(headline)}</strong><span>${esc(sub)}</span></span><span class="op-cb-chev" aria-hidden="true"></span></button>
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
    body.owner-page .op-cb-ring { --p: 0; position: relative; flex: 0 0 60px; width: 60px; height: 60px; border-radius: 50%; background: conic-gradient(#2A6B67 calc(var(--p) * 1%), #EAE6D9 0); }
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
    body.owner-page .op-cb-err { margin: 8px 0 0; padding: 10px 12px; border-radius: 10px; background: #FBE9E7; color: #8A2A1B; font-weight: 700; }
    @media (min-width: 900px) { body.owner-page .op-cb-row { grid-template-columns: 36px 1fr auto; align-items: center; } body.owner-page .op-cb-act { grid-column: 3; } }`;

// Runs inside the owner page script (setTask and TASK_OF are in scope there).
const COMPLETENESS_SCRIPT = `
  (function(){
    var tg = document.getElementById('opCbToggle'), pn = document.getElementById('opCbPanel');
    if (!tg || !pn) return;
    tg.addEventListener('click', function(){ var open = tg.getAttribute('aria-expanded') !== 'true'; tg.setAttribute('aria-expanded', open ? 'true' : 'false'); pn.hidden = !open; });
    Array.prototype.forEach.call(pn.querySelectorAll('[data-cb-task]'), function(b){
      b.addEventListener('click', function(){
        var id = b.getAttribute('data-cb-id');
        setTask(b.getAttribute('data-cb-task'));
        if (id) setTimeout(function(){ var el = document.getElementById(id); if (el) { if (el.tagName === 'DETAILS') el.open = true; var dd = el.closest ? el.closest('details') : null; if (dd) dd.open = true; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); var f = el.matches('input,select,textarea') ? el : null; if (f) f.focus({ preventScroll: true }); } }, 60);
      });
    });
    // "We don't have one" (2026-11-08): saves the whole list (it goes live at once, like the average spend), then
    // reloads so the score, the panel and the field buttons all start from what is now stored. The panel reopens.
    var sec = document.getElementById('opComplete');
    try { if (sessionStorage.getItem('opCbOpen') === '1') { sessionStorage.removeItem('opCbOpen'); tg.setAttribute('aria-expanded', 'true'); pn.hidden = false; } } catch (e) { /* storage off */ }
    if (!sec || !sec.hasAttribute('data-cb-declared')) return;
    var declared = []; try { declared = JSON.parse(sec.getAttribute('data-cb-declared')) || []; } catch (e) { declared = []; }
    var inline = []; try { inline = JSON.parse(sec.getAttribute('data-cb-inline')) || []; } catch (e) { inline = []; }
    inline.forEach(function(x){
      var el = document.getElementById(x.id); if (!el || !el.parentNode) return;
      var p = document.createElement('p'); p.className = 'op-cb-inline';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'op-cb-none'; b.setAttribute('data-cb-none', x.key); b.textContent = x.label;
      p.appendChild(b); el.parentNode.insertBefore(p, el.nextSibling);
    });
    var err = document.getElementById('opCbErr');
    function val(id){ var e = document.getElementById(id); return e ? e.value : ''; }
    function saveNone(list, btn){
      if (err) err.hidden = true;
      btn.disabled = true;
      var body = { changes: { not_offered: list }, note: '', contact_name: val('opName'), contact_email: typeof emailVal === 'function' ? emailVal('opEmail') : val('opEmail'),
        company_website: val('opHp'), started_at: typeof startedAt !== 'undefined' ? startedAt : Date.now() };
      fetch(location.pathname + '/changes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if (j && j.ok) { try { sessionStorage.setItem('opCbOpen', '1'); } catch (e) { /* storage off */ } location.reload(); return; }
          btn.disabled = false;
          var m = (j && j.errors && (j.errors.not_offered || j.errors.form)) || (j && j.error) || sec.getAttribute('data-cb-wrong');
          if (err) { err.textContent = m; err.hidden = false; tg.setAttribute('aria-expanded', 'true'); pn.hidden = false; err.scrollIntoView({ block: 'center' }); }
        })
        .catch(function(){ btn.disabled = false; if (err) { err.textContent = sec.getAttribute('data-cb-wrong'); err.hidden = false; } });
    }
    document.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('[data-cb-none],[data-cb-undo]'); if (!b) return;
      var k = b.getAttribute('data-cb-none');
      if (k) { if (declared.indexOf(k) < 0) saveNone(declared.concat([k]), b); return; }
      k = b.getAttribute('data-cb-undo');
      saveNone(declared.filter(function(x){ return x !== k; }), b);
    });
  })();`;

module.exports = { ITEMS, GROUPS, NONE_KEYS, NONE_MAX, doneMap, HOURS_FRESH_DAYS, DESCRIPTION_MIN, PHOTOS_MIN, scoreCompleteness, renderCompleteness, COMPLETENESS_CSS, COMPLETENESS_SCRIPT };
