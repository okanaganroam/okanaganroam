// Words for the full easy setup (2026-11-09), English and French. One question per screen, plain words, buttons that
// say exactly what they do. {placeholders} are filled in by the page script. Approved mockup:
// drafts/easy-setup-mockup-2026-11-09/full-setup.html (v5).
'use strict';

const en = {
  title: 'Set up your page', exit: 'Exit setup', back: '← Back', skip: 'Skip this for now', step: 'Step {n} of {total}', allDone: 'All done',
  hi: 'Hi {name} 👋', hiLead: 'Let’s get your page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.', start: 'Start',
  welcome: 'Welcome back 👋', welcomeLead: 'Here’s what you’ve done so far.', carryOn: 'Carry on', nextIs: 'Next: {step}', seeFinish: 'See how your page looks',
  st: { live: 'on your page', day: 'on your page within a day', email: 'waiting for your email', skip: 'skipped', later: 'next time you’re at your place', none: 'not done yet', half: 'hours saved, holidays and closures still to do' },
  labels: {
    basics: 'Address, phone and website', hours: 'Hours', season: 'Seasons', closures: 'Holidays and closures', spend: 'Price per person', cuisine: 'What you serve',
    photos: 'Photos', menu: 'Menu', offer: 'What you offer', happy: 'Happy hour', specials: 'Weekly specials', music: 'Weekly events', story: 'Your story',
    book: 'Booking', takeout: 'Takeout', known: 'Known for', groups: 'Groups', instagram: 'Instagram', facebook: 'Facebook', door: 'Your front door',
  },
  savedTitle: 'Saved', savedLive: 'It’s on your page now.', savedDay: 'It’ll show on your page within a day.', emailTitle2: 'Thanks!', savedEmail: 'Great. Once you’ve emailed it, we’ll add it within a day.',
  laterTitle: 'No problem', savedLater: 'We’ll remind you next time. You can do it any time from your page settings.',
  changeAnswer: 'Change an answer',
  nextStep: 'Next: {step}', finish: 'Finish', alreadyDone: '✓ Saved. You can change it here.',
  failed: 'That didn’t go through. Please check your connection and try again.', tooFast: 'You’ve saved a lot in a short time, so saving is paused for a few minutes. Nothing you entered is lost: please wait a little and tap the button again.', tryAgain: 'Try again', sending: 'Sending…',
  yes: 'Yes', no: 'No', putBack: 'Put it back', example: 'For example: {x}', remove: 'Remove',
  basicsQ: 'Is this your address, phone and website?', address: 'Address', phone: 'Phone', website: 'Website', noWebsiteYet: 'No website yet', noWebsiteSaid: 'You don’t have a website', yesRight: 'Yes, that’s right', changeThem: 'Change them',
  basicsEditQ: 'Change your address, phone or website', streetLabel: 'Street address', phoneLabel: 'Phone number', websiteLabel: 'Website', websiteEx: 'For example: yourbusiness.com', noWebsiteBtn: 'We don’t have a website', websiteBad: 'Please check the web address, for example yourbusiness.com', saveThese: 'Save these', noChange: 'Nothing changed. If they’re right, tap Back and then “Yes, that’s right”.',
  hoursQ: 'Are these still your hours?', closed: 'Closed', open: 'Open', hoursEditQ: 'Change your hours', hoursEditLead: 'Tap a time to change it.',
  sameAs: 'Same as {day}', opens: '{day} opens', closes: '{day} closes', to: 'to', saveHours: 'Save my hours', needOpenDay: 'Please set at least one day you’re open.',
  winterQ: 'Different hours part of the year?', winterHint: 'For example, shorter winter hours from November to April.', whichMonths: 'Which months?', hoursThen: 'Hours in those months',
  winterNeedMonths: 'Please tap the months for your other hours.', noHours: 'We don’t have your hours yet. Tap “Change them” to add them.', addHours: 'Add my hours',
  seasonQ: 'Do you close for part of the year?', seasonLead: 'For example, open May to October, or closed in January.', allYear: 'No, we’re open all year', partYear: 'Yes, we close for part of the year',
  monthsQ: 'Which months are you open?', monthsLead: 'Tap every month you’re open. When you’re closed, your page says “Closed for the season” and when you reopen.', saveSeason: 'Save my season',
  monthsInRow: 'Please pick months in a row, like May to October.', monthsNeed: 'Please tap the months you’re open.',
  closuresQ: 'Any days you’ll be closed coming up?', closuresLead: 'Tap the holidays you’re closed. They show as closed on your page on those days.', anotherDay: '+ Another day or dates',
  saveClosures: 'Save my closures', nothingComing: 'No, nothing coming up', closeAddQ: 'When are you closed?', closeAddLead: 'For renovations, a private event or a holiday that’s not on the list.',
  firstDay: 'First day closed', lastDay: 'Last day closed (if more than one day)', why: 'Why? (optional, shown on your page)', whyEx: 'Closed for renovations. Back on March 1.', addDates: 'Add these dates', needFirst: 'Please pick the first day you’re closed.',
  holidays: { xmasEve: 'Christmas Eve', xmas: 'Christmas Day', boxing: 'Boxing Day', nye: 'New Year’s Eve', nyd: 'New Year’s Day', family: 'Family Day', goodFri: 'Good Friday', easterMon: 'Easter Monday' },
  spendQ: 'About how much does one person spend?', spendLead: 'One main and a soft drink, before tax and tip.', spendGuess: 'We guessed ${n} from your menu.', less: 'Less', more: 'More', spendYes: 'Yes, about ${n}',
  cuisineQ: 'What kind of food do you serve?', cuisineLead: 'Pick up to 3.', picked: 'Picked: {list}', showMore: 'Don’t see yours? Show more kinds of food', typeToFind: 'Or type to find it',
  findEx: 'For example: Thai', notOnList: 'Not on the list? Pick the closest one.', pickOne: 'Please tap at least one kind of food, or tap Skip.', upTo3: 'You can pick up to 3. Tap one you picked to remove it.', cuisineNext: 'Next: what kind of place',
  placeQ: 'What kind of place is it?', placeLead: 'Pick the one that fits best.', placeNeed: 'Please tap the one that fits best.', saveFood: 'Save',
  photosQ: 'Add photos of your place', photosLead: 'Your food, your room, your patio. Three photos is perfect.', take: 'Take a photo', takeSub: 'Opens your camera', choose: 'Choose from my photos',
  photosSent: '✓ {n} photos sent. They’ll show on your page within a day.', photosMore: 'Want to add more photos?', photosNoMore: 'No, next: your menu',
  reviewQ: 'Your photos', reviewLead: 'Tap ✕ to remove one. Tap “Make main photo” to pick the big one at the top of your page.',
  removePhoto: 'Remove photo {n}', makeMain: 'Make main photo', isMain: '★ Main photo', tooSmall: 'This one is too small. Try another.', cantOpen: 'We couldn’t open this one. Try another.',
  wontAdd: 'Won’t be added', addAnother: '+ Add another photo', rights: 'These are my photos and Okanagan Roam can use them.', needRights: 'Please tick this box first, so we can use your photos.',
  needPhoto: 'Please add a photo first. The small one is too small to use.', sendOne: 'Send this photo', sendMany: 'Send these {n} photos', adding: 'Sending photo {i} of {n}…', tooMany: 'That’s plenty for now. We kept the first {n}.',
  menuQ: 'How should we add your menu?', menuLead: 'Pick the easiest one for you.', menuSent: '✓ Your menu is sent.',
  upload: 'Upload my menu', uploadSub: 'A PDF or photos from your phone or computer', snap: 'Take photos of my menu', snapSub: 'Snap each page', web: 'My menu is on my website', emailIt: 'Email it to us',
  upQ: 'Upload your menu', upQSome: 'Your menu', upLead: 'Pick the file your menu is in. A PDF or photos both work.', upLeadSome: 'Got another file? Add it. If not, send it.',
  upPick: 'Choose my menu file', upMore: 'Add another file', removeFile: 'Remove {name}', sendMenu: 'Send my menu ✓',
  camQ: 'Snap your first page', camLead: 'Hold your phone over the menu so the whole page fits.', camGot1: 'Got page 1', camGotN: 'Got {n} pages', camLeadSome: 'Got another page? Add it. Tap ✕ to retake one.',
  camTake: 'Take a photo', camMore: 'Add another page', page: 'Menu page {n}', removePage: 'Remove page {n}',
  webQ: 'Is this where your menu is?', webLead: 'We filled in your website’s address. If your menu has its own page, type its name after the last /, like /menu.', webLabel: 'Menu web address', useAddress: 'Use this address', webEmpty: 'Please type the address of your menu, like www.yourplace.com/menu.',
  emailQ: 'Email your menu to us', emailLead: 'Send a photo or a PDF of your menu. Put “{name}” in the subject.', openMail: 'Open my email', openMailSub: 'Starts an email to us', copy: 'Copy', copied: 'Copied ✓', selected: 'Selected. Press and hold to copy.', willEmail: 'I’ll email it',
  mailSubject: 'Menu for {name}',
  fileTooBig: '{name} is too big. Try photos instead.', pageSmall: 'This page is a bit small to read. Try taking it a little closer.', tooManyPages: 'That’s {n} pages, the most we can take at once.',
  offerQ: 'Tap everything that’s true', offerLead: 'Visitors use these to find places like yours.', saveOffer: 'Save these',
  offers: { patio: 'Patio', kid_friendly: 'Kids welcome', dog_friendly: 'Dogs welcome', vegan: 'Vegan options', vegetarian: 'Vegetarian options', gluten_free: 'Gluten-free options', nonalcoholic: 'Non-alcoholic drinks', lake_view: 'Lake view', sports_tv: 'Sports on TV', live_music: 'Live music', great_groups: 'Great for groups', happy_hour: 'Happy hour' },
  dogQ: 'Where are dogs allowed?', dogEx: 'Dogs welcome on the patio, not inside. Water bowls at the door.',
  happyQ: 'Do you have a happy hour?', happyYes: 'Yes, we do', howQ: 'How would you like to tell us?', howLead: 'Pick the easiest one for you.',
  happyUp: 'Upload my happy hour menu', specialsUp: 'Upload my specials', upSub: 'A PDF or a photo from your phone', happyPhoto: 'Take a photo of it', specialsPhoto: 'Take a photo of them', photoSub: 'Like a sign, a chalkboard or a table card',
  happyWeb: 'It’s on my website', specialsWeb: 'They’re on my website', happyType: 'Type it in', happyTypeSub: 'Days, times and what’s on', specialsType: 'Type them in', specialsTypeSub: 'One for each day if you like',
  sheetHappyQ: 'Your happy hour menu', sheetSpecialsQ: 'Your specials', sheetLead: 'A PDF, a photo of a sign, a table card or a chalkboard all work. We’ll type it up for you.', sheetLeadSome: 'Got another one? Add it. Otherwise send it.',
  chooseFile: 'Choose a file', sendIt: 'Send it',
  webWhereQ: 'Where on your website?', webWhereHappy: 'We filled in your website. If your happy hour is on another page, add to the end.', webWhereSpecials: 'We filled in your website. If your specials are on another page, add to the end.',
  webExHappy: '{site}/happy-hour', webExSpecials: '{site}/specials', webCopy: 'We’ll copy it onto your page',
  happyTypeQ: 'Your happy hours', happyTypeLead: 'Different days or times? Add one for each.', happyN: 'Happy hour {n}', whichDays: 'Which days?', whatTime: 'What time?', starts: 'Starts', ends: 'Ends',
  whatsOn: 'What’s on special?', whatsOnEx: '$6 pints and half-price apps', happyEx: 'Mon–Thu 3–5 PM, $6 pints. Fri 2–6 PM, $5 wings.', addHappy: '+ Add another happy hour', saveHappy: 'Save my happy hours',
  needDays: 'Please tap at least one day for each one.', twoPerDay: 'A day can have at most two happy hours. Please check {day}.',
  specialsQ: 'Any weekly specials?', specialsLead: 'Like Taco Tuesday or Wing Wednesday. You can add one for every day.',
  specialsTypeQ: 'Your weekly specials', upTo7: 'Add as many as you have, up to 7.', specialN: 'Special {n}', whichDaysOr: 'Which day or days?', whatIsIt: 'What is it?', specialEx: 'Taco Tuesday, 3 tacos',
  priceIf: 'Price, if there is one', priceEx: '$12', addSpecial: '+ Add another special', saveSpecials: 'Save my specials', needText: 'Please say what each one is.',
  musicQ: 'Anything on each week?', musicLead: 'Like trivia, live music, karaoke, open mic, comedy, bingo, paint night or a run club.',
  musicTypeQ: 'Your weekly events', eventN: 'Event {n}', whatEvent: 'What is it? Tap one or type your own.', eventEx: 'Trivia night, 7 PM, free to play', whichNights: 'Which day or days?', addEvent: '+ Add another event', saveEvents: 'Save my events',
  kinds: { trivia: 'Trivia', live_music: 'Live music', karaoke: 'Karaoke', open_mic: 'Open mic', comedy: 'Comedy', bingo: 'Bingo', paint: 'Paint night', run_club: 'Run club', dj: 'DJ night', games: 'Game night', sports: 'Sports night', other: 'Something else' },
  storyQ: 'Tell visitors about your place', storyLead: 'A few sentences in your own words.', storyLabel: 'About your place', storyCount: '{n} of 120 letters', storyGood: '{n} letters ✓ Great', storyEx: 'A family bistro on the lake. We make our pasta by hand and the patio catches the sunset.', storyShort: 'Please write a little more, at least 30 letters.', saveThis: 'Save this',
  bookQ: 'Do people need to book a table?', bookYes: 'Yes, they book', bookHowQ: 'How do people book?', bookEx: 'Call us or book on our website',
  takeoutQ: 'Do you do takeout or delivery?', takeoutHowQ: 'How do people order?', takeoutEx: 'Call to order, or on DoorDash',
  knownQ: 'What are you known for?', knownLead: 'One line is perfect.', knownEx: 'Wood-fired pizza and the lakeside patio',
  groupsQ: 'Can you take big groups?', groupsHowQ: 'Anything groups should know?', groupsEx: 'Groups of 10 or more, please call ahead', needLine: 'Please type a short line, or tap Back.',
  igQ: 'Are you on Instagram?', igLead: 'Type your Instagram name, like @{handle}.', igLabel: 'Instagram name', igNo: 'We’re not on Instagram',
  fbQ: 'Are you on Facebook?', fbLead: 'Paste the link to your Facebook page.', fbLabel: 'Facebook page', fbNo: 'We’re not on Facebook', saveBtn: 'Save', needValue: 'Please type it in, or tap “{no}”.',
  doorQ: 'Help people find your front door', doorLead: 'Visitors using our Roam Now map walk right to your door. It takes one photo, taken outside your place.',
  doorHere: 'Are you at your restaurant right now?', imHere: 'Yes, I’m here', notNow: 'Not right now', notNowSub: 'We’ll remind you next time',
  doorPhotoQ: 'Take a photo of your front door', doorPhotoLead: 'Stand on the sidewalk so the door and your sign are in the picture. Your device will ask to share your location, so visitors get directions to this spot.',
  takeAgain: 'Take it again', checkPin: 'Next: check the pin', pinQ: 'Is the pin on your door?', pinLead: 'If not, drag it to your door.', finding: 'Finding your location…', noGps: 'We couldn’t get your location. Drag the pin to your door.',
  doorRights: 'I took this photo or have permission to share it, and Okanagan Roam may show it to help visitors find this business.', doorRightsNeed: 'Please tick the box first.', doorSend: 'Yes, send it', needPin: 'Please wait for the map, or drag the pin to your door.',
  finishQ: 'You’re all set!', pctNow: 'Your page is {n}% complete', pctSoon: 'About {n}% once we add what you sent, usually within a day.', pctDone: 'Everything is done. Thank you!', niceWork: 'Nice work.',
  toReach: 'To reach 100%', laterSub: 'Next time you’re at your place', howLooks: 'Here’s how your page will look:', seePage: 'See my page', backSettings: 'Back to my page settings',
  badgeEarn: 'Reach 100% to earn the Complete & Verified badge for your page.', badgeEarned: '🎉 You earned the Complete & Verified badge.', badgePaused: 'Your Complete & Verified badge is paused. Confirm your hours to bring it back.',
  aPerson: 'about ${n} a person', noJs: 'Please turn on JavaScript, or email your details to',
  menuNote: 'Sent from the easy setup. Please turn these pages into our menu.', sheetNote: 'Sent from the easy setup: our {what}. Please add it to our page.', sheetWebNote: 'Our {what} is on our website: {url}',
  whatHappy: 'happy hour', whatSpecials: 'weekly specials',
};

const fr = {
  title: 'Configurez votre page', exit: 'Quitter', back: '← Retour', skip: 'Passer pour l’instant', step: 'Étape {n} sur {total}', allDone: 'Terminé',
  hi: 'Bonjour {name} 👋', hiLead: 'Préparons votre page, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.', start: 'Commencer',
  welcome: 'Bon retour 👋', welcomeLead: 'Voici ce que vous avez déjà fait.', carryOn: 'Continuer', nextIs: 'Suivant : {step}', seeFinish: 'Voir à quoi ressemble votre page',
  st: { live: 'sur votre page', day: 'sur votre page d’ici un jour', email: 'en attente de votre courriel', skip: 'passé', later: 'la prochaine fois que vous serez sur place', none: 'pas encore fait', half: 'heures enregistrées, jours fériés et fermetures à faire' },
  labels: {
    basics: 'Adresse, téléphone et site Web', hours: 'Heures', season: 'Saisons', closures: 'Jours fériés et fermetures', spend: 'Prix par personne', cuisine: 'Ce que vous servez',
    photos: 'Photos', menu: 'Menu', offer: 'Ce que vous offrez', happy: 'Happy hour', specials: 'Spéciaux de la semaine', music: 'Événements de la semaine', story: 'Votre histoire',
    book: 'Réservations', takeout: 'À emporter', known: 'Reconnu pour', groups: 'Groupes', instagram: 'Instagram', facebook: 'Facebook', door: 'Votre porte d’entrée',
  },
  savedTitle: 'Enregistré', savedLive: 'C’est sur votre page maintenant.', savedDay: 'Cela s’affichera sur votre page d’ici un jour.', emailTitle2: 'Merci!', savedEmail: 'Parfait. Dès que vous l’aurez envoyé, nous l’ajouterons d’ici un jour.',
  laterTitle: 'Aucun problème', savedLater: 'Nous vous le rappellerons la prochaine fois. Vous pouvez le faire à tout moment depuis les réglages de votre page.',
  changeAnswer: 'Modifier une réponse',
  nextStep: 'Suivant : {step}', finish: 'Terminer', alreadyDone: '✓ Enregistré. Vous pouvez le modifier ici.',
  failed: 'Cela n’a pas fonctionné. Vérifiez votre connexion et réessayez.', tooFast: 'Vous avez enregistré beaucoup de choses en peu de temps : l’enregistrement est en pause quelques minutes. Rien de ce que vous avez entré n’est perdu. Patientez un peu, puis touchez de nouveau le bouton.', tryAgain: 'Réessayer', sending: 'Envoi…',
  yes: 'Oui', no: 'Non', putBack: 'Remettre comme avant', example: 'Par exemple : {x}', remove: 'Retirer',
  basicsQ: 'Est-ce bien votre adresse, votre téléphone et votre site Web?', address: 'Adresse', phone: 'Téléphone', website: 'Site Web', noWebsiteYet: 'Pas encore de site Web', noWebsiteSaid: 'Vous n’avez pas de site Web', yesRight: 'Oui, c’est exact', changeThem: 'Les modifier',
  basicsEditQ: 'Modifier votre adresse, votre téléphone ou votre site Web', streetLabel: 'Adresse', phoneLabel: 'Numéro de téléphone', websiteLabel: 'Site Web', websiteEx: 'Par exemple : votreentreprise.com', noWebsiteBtn: 'Nous n’avons pas de site Web', websiteBad: 'Vérifiez l’adresse Web, par exemple votreentreprise.com', saveThese: 'Enregistrer', noChange: 'Rien n’a changé. S’ils sont exacts, touchez Retour puis « Oui, c’est exact ».',
  hoursQ: 'Est-ce que ce sont toujours vos heures?', closed: 'Fermé', open: 'Ouvert', hoursEditQ: 'Modifier vos heures', hoursEditLead: 'Touchez une heure pour la changer.',
  sameAs: 'Comme {day}', opens: '{day} ouverture', closes: '{day} fermeture', to: 'à', saveHours: 'Enregistrer mes heures', needOpenDay: 'Indiquez au moins un jour d’ouverture.',
  winterQ: 'D’autres heures une partie de l’année?', winterHint: 'Par exemple, des heures d’hiver plus courtes de novembre à avril.', whichMonths: 'Quels mois?', hoursThen: 'Heures pendant ces mois',
  winterNeedMonths: 'Touchez les mois de vos autres heures.', noHours: 'Nous n’avons pas encore vos heures. Touchez « Les modifier » pour les ajouter.', addHours: 'Ajouter mes heures',
  seasonQ: 'Fermez-vous une partie de l’année?', seasonLead: 'Par exemple, ouvert de mai à octobre, ou fermé en janvier.', allYear: 'Non, nous sommes ouverts toute l’année', partYear: 'Oui, nous fermons une partie de l’année',
  monthsQ: 'Quels mois êtes-vous ouvert?', monthsLead: 'Touchez chaque mois où vous êtes ouvert. Quand vous êtes fermé, votre page indique « Fermé pour la saison » et la date de réouverture.', saveSeason: 'Enregistrer ma saison',
  monthsInRow: 'Choisissez des mois qui se suivent, comme de mai à octobre.', monthsNeed: 'Touchez les mois où vous êtes ouvert.',
  closuresQ: 'Des jours de fermeture à venir?', closuresLead: 'Touchez les jours fériés où vous êtes fermé. Ils s’affichent comme fermés sur votre page ces jours-là.', anotherDay: '+ Une autre date',
  saveClosures: 'Enregistrer mes fermetures', nothingComing: 'Non, rien à venir', closeAddQ: 'Quand êtes-vous fermé?', closeAddLead: 'Pour des rénovations, un événement privé ou un jour férié qui n’est pas sur la liste.',
  firstDay: 'Premier jour de fermeture', lastDay: 'Dernier jour de fermeture (si plus d’un jour)', why: 'Pourquoi? (facultatif, affiché sur votre page)', whyEx: 'Fermé pour rénovations. De retour le 1er mars.', addDates: 'Ajouter ces dates', needFirst: 'Choisissez le premier jour de fermeture.',
  holidays: { xmasEve: 'Veille de Noël', xmas: 'Noël', boxing: 'Lendemain de Noël', nye: 'Veille du jour de l’An', nyd: 'Jour de l’An', family: 'Jour de la famille', goodFri: 'Vendredi saint', easterMon: 'Lundi de Pâques' },
  spendQ: 'Environ combien dépense une personne?', spendLead: 'Un plat principal et une boisson sans alcool, avant taxes et pourboire.', spendGuess: 'D’après votre menu, nous avons estimé {n} $.', less: 'Moins', more: 'Plus', spendYes: 'Oui, environ {n} $',
  cuisineQ: 'Quel genre de cuisine servez-vous?', cuisineLead: 'Choisissez-en jusqu’à 3.', picked: 'Choisi : {list}', showMore: 'Vous ne la voyez pas? Afficher plus de cuisines', typeToFind: 'Ou tapez pour la trouver',
  findEx: 'Par exemple : thaï', notOnList: 'Pas dans la liste? Choisissez la plus proche.', pickOne: 'Touchez au moins une cuisine, ou touchez Passer.', upTo3: 'Vous pouvez en choisir 3. Touchez-en une choisie pour la retirer.', cuisineNext: 'Suivant : le genre d’endroit',
  placeQ: 'Quel genre d’endroit est-ce?', placeLead: 'Choisissez celui qui convient le mieux.', placeNeed: 'Touchez celui qui convient le mieux.', saveFood: 'Enregistrer',
  photosQ: 'Ajoutez des photos de votre établissement', photosLead: 'Vos plats, votre salle, votre terrasse. Trois photos, c’est parfait.', take: 'Prendre une photo', takeSub: 'Ouvre votre appareil photo', choose: 'Choisir dans mes photos',
  photosSent: '✓ {n} photos envoyées. Elles s’afficheront sur votre page d’ici un jour.', photosMore: 'Voulez-vous ajouter d’autres photos?', photosNoMore: 'Non, suivant : votre menu',
  reviewQ: 'Vos photos', reviewLead: 'Touchez ✕ pour en retirer une. Touchez « Photo principale » pour choisir la grande photo en haut de votre page.',
  removePhoto: 'Retirer la photo {n}', makeMain: 'Photo principale', isMain: '★ Photo principale', tooSmall: 'Celle-ci est trop petite. Essayez-en une autre.', cantOpen: 'Nous n’avons pas pu ouvrir celle-ci. Essayez-en une autre.',
  wontAdd: 'Ne sera pas ajoutée', addAnother: '+ Ajouter une autre photo', rights: 'Ce sont mes photos et Okanagan Roam peut les utiliser.', needRights: 'Cochez d’abord cette case pour que nous puissions utiliser vos photos.',
  needPhoto: 'Ajoutez d’abord une photo. La petite est trop petite.', sendOne: 'Envoyer cette photo', sendMany: 'Envoyer ces {n} photos', adding: 'Envoi de la photo {i} sur {n}…', tooMany: 'C’est assez pour l’instant. Nous avons gardé les {n} premières.',
  menuQ: 'Comment ajouter votre menu?', menuLead: 'Choisissez ce qui est le plus simple pour vous.', menuSent: '✓ Votre menu est envoyé.',
  upload: 'Téléverser mon menu', uploadSub: 'Un PDF ou des photos de votre téléphone ou ordinateur', snap: 'Photographier mon menu', snapSub: 'Une photo par page', web: 'Mon menu est sur mon site Web', emailIt: 'Vous l’envoyer par courriel',
  upQ: 'Téléversez votre menu', upQSome: 'Votre menu', upLead: 'Choisissez le fichier de votre menu. Un PDF ou des photos, les deux fonctionnent.', upLeadSome: 'Un autre fichier? Ajoutez-le. Sinon, envoyez-le.',
  upPick: 'Choisir le fichier de mon menu', upMore: 'Ajouter un autre fichier', removeFile: 'Retirer {name}', sendMenu: 'Envoyer mon menu ✓',
  camQ: 'Photographiez la première page', camLead: 'Tenez votre téléphone au-dessus du menu pour que toute la page soit visible.', camGot1: 'Page 1 reçue', camGotN: '{n} pages reçues', camLeadSome: 'Une autre page? Ajoutez-la. Touchez ✕ pour en reprendre une.',
  camTake: 'Prendre une photo', camMore: 'Ajouter une autre page', page: 'Page de menu {n}', removePage: 'Retirer la page {n}',
  webQ: 'Votre menu est-il à cette adresse?', webLead: 'Nous avons inscrit l’adresse de votre site Web. Si votre menu a sa propre page, tapez son nom après le dernier /, comme /menu.', webLabel: 'Adresse Web du menu', useAddress: 'Utiliser cette adresse', webEmpty: 'Écrivez l’adresse de votre menu, comme www.votreendroit.com/menu.',
  emailQ: 'Envoyez-nous votre menu', emailLead: 'Envoyez une photo ou un PDF de votre menu. Indiquez « {name} » dans l’objet.', openMail: 'Ouvrir mon courriel', openMailSub: 'Commence un courriel à notre adresse', copy: 'Copier', copied: 'Copié ✓', selected: 'Sélectionné. Appuyez longuement pour copier.', willEmail: 'Je vais l’envoyer',
  mailSubject: 'Menu de {name}',
  fileTooBig: '{name} est trop gros. Essayez plutôt des photos.', pageSmall: 'Cette page est un peu petite pour être lue. Essayez de la prendre de plus près.', tooManyPages: 'Cela fait {n} pages, le maximum à la fois.',
  offerQ: 'Touchez tout ce qui est vrai', offerLead: 'Les visiteurs s’en servent pour trouver des endroits comme le vôtre.', saveOffer: 'Enregistrer',
  offers: { patio: 'Terrasse', kid_friendly: 'Enfants bienvenus', dog_friendly: 'Chiens bienvenus', vegan: 'Options véganes', vegetarian: 'Options végétariennes', gluten_free: 'Options sans gluten', nonalcoholic: 'Boissons sans alcool', lake_view: 'Vue sur le lac', sports_tv: 'Sports à la télé', live_music: 'Musique en direct', great_groups: 'Idéal pour les groupes', happy_hour: 'Happy hour' },
  dogQ: 'Où les chiens sont-ils permis?', dogEx: 'Chiens bienvenus sur la terrasse, pas à l’intérieur. Bols d’eau à l’entrée.',
  happyQ: 'Avez-vous un happy hour?', happyYes: 'Oui', howQ: 'Comment voulez-vous nous le dire?', howLead: 'Choisissez ce qui est le plus simple pour vous.',
  happyUp: 'Téléverser mon menu du happy hour', specialsUp: 'Téléverser mes spéciaux', upSub: 'Un PDF ou une photo de votre téléphone', happyPhoto: 'Le photographier', specialsPhoto: 'Les photographier', photoSub: 'Comme une affiche, un tableau ou un chevalet de table',
  happyWeb: 'C’est sur mon site Web', specialsWeb: 'Ils sont sur mon site Web', happyType: 'L’écrire', happyTypeSub: 'Jours, heures et spéciaux', specialsType: 'Les écrire', specialsTypeSub: 'Un par jour si vous voulez',
  sheetHappyQ: 'Votre menu du happy hour', sheetSpecialsQ: 'Vos spéciaux', sheetLead: 'Un PDF, une photo d’affiche, de chevalet ou de tableau, tout fonctionne. Nous le retranscrirons pour vous.', sheetLeadSome: 'Un autre? Ajoutez-le. Sinon, envoyez-le.',
  chooseFile: 'Choisir un fichier', sendIt: 'Envoyer',
  webWhereQ: 'Où sur votre site Web?', webWhereHappy: 'Nous avons inscrit votre site Web. Si votre happy hour est sur une autre page, ajoutez la fin de l’adresse.', webWhereSpecials: 'Nous avons inscrit votre site Web. Si vos spéciaux sont sur une autre page, ajoutez la fin de l’adresse.',
  webExHappy: '{site}/happy-hour', webExSpecials: '{site}/speciaux', webCopy: 'Nous le reporterons sur votre page',
  happyTypeQ: 'Vos happy hours', happyTypeLead: 'Des jours ou des heures différents? Ajoutez-en un pour chacun.', happyN: 'Happy hour {n}', whichDays: 'Quels jours?', whatTime: 'À quelle heure?', starts: 'Début', ends: 'Fin',
  whatsOn: 'Quels sont les spéciaux?', whatsOnEx: 'Pintes à 6 $ et entrées à moitié prix', happyEx: 'Lun.–jeu. 15 h–17 h, pintes à 6 $. Ven. 14 h–18 h, ailes à 5 $.', addHappy: '+ Ajouter un autre happy hour', saveHappy: 'Enregistrer mes happy hours',
  needDays: 'Touchez au moins un jour pour chacun.', twoPerDay: 'Un jour peut avoir au plus deux happy hours. Vérifiez {day}.',
  specialsQ: 'Des spéciaux chaque semaine?', specialsLead: 'Comme le mardi tacos ou le mercredi ailes. Vous pouvez en ajouter un pour chaque jour.',
  specialsTypeQ: 'Vos spéciaux de la semaine', upTo7: 'Ajoutez-en autant que vous en avez, jusqu’à 7.', specialN: 'Spécial {n}', whichDaysOr: 'Quel jour ou quels jours?', whatIsIt: 'Qu’est-ce que c’est?', specialEx: 'Mardi tacos, 3 tacos',
  priceIf: 'Prix, s’il y en a un', priceEx: '12 $', addSpecial: '+ Ajouter un autre spécial', saveSpecials: 'Enregistrer mes spéciaux', needText: 'Indiquez ce qu’est chacun.',
  musicQ: 'Quelque chose chaque semaine?', musicLead: 'Comme un quiz, de la musique en direct, du karaoké, une scène ouverte, de l’humour, du bingo, une soirée peinture ou un club de course.',
  musicTypeQ: 'Vos événements de la semaine', eventN: 'Événement {n}', whatEvent: 'Qu’est-ce que c’est? Touchez-en un ou écrivez le vôtre.', eventEx: 'Soirée quiz, 19 h, gratuit', whichNights: 'Quel jour ou quels jours?', addEvent: '+ Ajouter un autre événement', saveEvents: 'Enregistrer mes événements',
  kinds: { trivia: 'Quiz', live_music: 'Musique en direct', karaoke: 'Karaoké', open_mic: 'Scène ouverte', comedy: 'Humour', bingo: 'Bingo', paint: 'Soirée peinture', run_club: 'Club de course', dj: 'Soirée DJ', games: 'Soirée jeux', sports: 'Soirée sports', other: 'Autre chose' },
  storyQ: 'Parlez de votre établissement aux visiteurs', storyLead: 'Quelques phrases dans vos mots.', storyLabel: 'À propos de votre établissement', storyCount: '{n} sur 120 lettres', storyGood: '{n} lettres ✓ Parfait', storyEx: 'Un bistro familial au bord du lac. Nos pâtes sont faites à la main et la terrasse profite du coucher de soleil.', storyShort: 'Écrivez-en un peu plus, au moins 30 lettres.', saveThis: 'Enregistrer',
  bookQ: 'Faut-il réserver une table?', bookYes: 'Oui, on réserve', bookHowQ: 'Comment réserver?', bookEx: 'Appelez-nous ou réservez sur notre site Web',
  takeoutQ: 'Faites-vous des commandes à emporter ou la livraison?', takeoutHowQ: 'Comment commander?', takeoutEx: 'Appelez pour commander, ou sur DoorDash',
  knownQ: 'Pour quoi êtes-vous reconnu?', knownLead: 'Une ligne, c’est parfait.', knownEx: 'Pizza au four à bois et terrasse au bord du lac',
  groupsQ: 'Pouvez-vous accueillir de grands groupes?', groupsHowQ: 'Quelque chose à savoir pour les groupes?', groupsEx: 'Groupes de 10 ou plus, appelez à l’avance', needLine: 'Écrivez une courte ligne, ou touchez Retour.',
  igQ: 'Êtes-vous sur Instagram?', igLead: 'Écrivez votre nom Instagram, comme @{handle}.', igLabel: 'Nom Instagram', igNo: 'Nous ne sommes pas sur Instagram',
  fbQ: 'Êtes-vous sur Facebook?', fbLead: 'Collez le lien de votre page Facebook.', fbLabel: 'Page Facebook', fbNo: 'Nous ne sommes pas sur Facebook', saveBtn: 'Enregistrer', needValue: 'Écrivez-le, ou touchez « {no} ».',
  doorQ: 'Aidez les gens à trouver votre porte', doorLead: 'Les visiteurs qui utilisent la carte Roam Now marchent jusqu’à votre porte. Il suffit d’une photo, prise devant votre établissement.',
  doorHere: 'Êtes-vous à votre restaurant en ce moment?', imHere: 'Oui, j’y suis', notNow: 'Pas maintenant', notNowSub: 'Nous vous le rappellerons',
  doorPhotoQ: 'Prenez une photo de votre porte d’entrée', doorPhotoLead: 'Placez-vous sur le trottoir pour que la porte et votre enseigne soient sur la photo. Votre téléphone demandera votre position, pour guider les visiteurs jusqu’ici.',
  takeAgain: 'La reprendre', checkPin: 'Suivant : vérifier l’épingle', pinQ: 'L’épingle est-elle sur votre porte?', pinLead: 'Sinon, glissez-la jusqu’à votre porte.', finding: 'Recherche de votre position…', noGps: 'Impossible d’obtenir votre position. Glissez l’épingle jusqu’à votre porte.',
  doorRights: 'J’ai pris cette photo ou j’ai la permission de la partager, et Okanagan Roam peut l’afficher pour aider les visiteurs à trouver ce commerce.', doorRightsNeed: 'Cochez d’abord la case.', doorSend: 'Oui, l’envoyer', needPin: 'Attendez la carte, ou glissez l’épingle jusqu’à votre porte.',
  finishQ: 'C’est terminé!', pctNow: 'Votre page est complète à {n} %', pctSoon: 'Environ {n} % une fois ce que vous avez envoyé ajouté, en général d’ici un jour.', pctDone: 'Tout est fait. Merci!', niceWork: 'Beau travail.',
  toReach: 'Pour atteindre 100 %', laterSub: 'La prochaine fois que vous serez sur place', howLooks: 'Voici à quoi ressemblera votre page :', seePage: 'Voir ma page', backSettings: 'Retour aux réglages de ma page',
  badgeEarn: 'Atteignez 100 % pour obtenir le badge Complète et vérifiée.', badgeEarned: '🎉 Vous avez obtenu le badge Complète et vérifiée.', badgePaused: 'Votre badge Complète et vérifiée est en pause. Confirmez vos heures pour le récupérer.',
  aPerson: 'environ {n} $ par personne', noJs: 'Activez JavaScript, ou envoyez-nous vos renseignements à',
  menuNote: 'Envoyé depuis la configuration simple. Merci de faire notre menu à partir de ces pages.', sheetNote: 'Envoyé depuis la configuration simple : notre {what}. Merci de l’ajouter à notre page.', sheetWebNote: 'Notre {what} est sur notre site Web : {url}',
  whatHappy: 'happy hour', whatSpecials: 'spéciaux de la semaine',
};

// ----- Split in two + fresh-eyes fixes (2026-11-09) -----
// Part 1 "the essentials" (8 questions, in order), then Part 2 "more about your place" (optional, any order).
Object.assign(en, {
  hiLead: 'Let’s get your page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.',
  welcomeLead: 'Your answers so far are saved.',
  essBar: 'The essentials: done', moreProg: 'More about your place · {n} of {total} done', moreDone: 'Optional · {n} of {total} done',
  essQ: 'The essentials are done!', moreOpt: 'Add more about your place', moreOptSub: 'Optional: happy hour, specials, your story and more', doneNow: 'I’m done for now',
  moreQ: 'More about your place', moreLead: 'All optional. Tap any one, in any order. Each takes a minute or two.', backToMore: 'Back to the list',
  finishQ: 'Everything is done!', finishHome: 'Everything you can do from home is done', finishSoFar: 'Here’s your page so far',
  gotIt: 'Got it.', savedNo: 'Thanks for telling us.', youSaid: '✓ Saved. You said: {a}. You can change it here.',
  noLabels: { closures: 'nothing coming up', happy: 'no happy hour', specials: 'no weekly specials', music: 'no weekly events', book: 'walk-ins only', takeout: 'no takeout or delivery', groups: 'no big groups', instagram: 'not on Instagram', facebook: 'not on Facebook' },
  helpYes: 'Yes. When you see <strong>Saved ✓</strong>, we have it. Here’s what we have from you right now:', helpNone: 'Nothing yet. Start with the first question.',
  helpTail: 'Photos, your menu, your address, phone and description show on your page within a day. Everything else is on your page right away.',
  closuresLead: 'Tap the holidays you’re closed. Closing for longer? Add the dates below.', anotherDay: '+ Closed for a week or two (or other dates)', wholeMonths: '+ We close for whole months each year',
  monthsRow: 'Open {a} to {b} each year', monthsUse: 'Use these months', allYearBtn: 'We’re open all year',
  closeAddLead: 'For a winter break, renovations, a private event or a holiday that’s not on the list.', howLong: 'How long are you closed?', len1: '1 day', len7: '1 week', len14: '2 weeks', lenPick: 'Pick the last day', lastDay: 'Last day closed',
  uploadSub: 'A file or photos from your phone or computer', upLead: 'Pick the file your menu is in. A file or photos both work.', sendMenu: 'Send my menu',
  emailLead: 'Send a photo or a file of your menu. Put “{name}” in the subject.', upSub: 'A file or a photo from your phone', sheetLead: 'A file, a photo of a sign, a table card or a chalkboard all work. We’ll type it up for you.',
  dogLead: 'One short line is perfect.',
  whatsOnEx: '$6 pints and half-price appetizers', specialEx: 'Taco Tuesday, 3 tacos', priceEx: '$12', eventEx: 'Trivia night, free to play', eventTime: 'What time does it start? (optional)',
  storyCount: 'A bit more would be great (120 letters for full marks).', storyGood: 'Great length ✓',
  bookQ: 'Can people book a table?', bookYes: 'Yes', bookNo: 'No, walk-ins only', bookNoLink: 'Actually, we don’t take bookings', takeoutNoLink: 'Actually, we don’t do takeout', groupsNoLink: 'Actually, we can’t take big groups',
  groupsQ: 'Can you take groups of 10 or more?',
  igLead: 'Type your Instagram name, like @yourrestaurant.', fbQ: 'What’s your Facebook page called?', fbLead: 'Type the name of your page. If you have its link, you can paste that instead.', fbLabel: 'Facebook page name or link',
  socialSent: '✓ You told us the name. We’ll add the link within a day.', savedFbName: 'We’ll add your Facebook link within a day.', savedIgName: 'We’ll add your Instagram link within a day.',
  fbNote: 'Our Facebook page is called: “{name}”. Please find the link and add it to our page.', igNote: 'Our Instagram name is: “{name}”. Please find the link and add it to our page.',
});
en.st.no = 'no';
Object.assign(fr, {
  hiLead: 'Préparons votre page, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  welcomeLead: 'Vos réponses sont enregistrées.',
  essBar: 'L’essentiel : terminé', moreProg: 'Plus de détails · {n} sur {total}', moreDone: 'Facultatif · {n} sur {total}',
  essQ: 'L’essentiel est fait!', moreOpt: 'Ajouter plus de détails', moreOptSub: 'Facultatif : happy hour, spéciaux, votre histoire et plus', doneNow: 'J’ai terminé pour l’instant',
  moreQ: 'Plus de détails sur votre établissement', moreLead: 'Tout est facultatif. Touchez-en un, dans l’ordre que vous voulez. Chacun prend une minute ou deux.', backToMore: 'Retour à la liste',
  finishQ: 'Tout est fait!', finishHome: 'Tout ce que vous pouvez faire de chez vous est fait', finishSoFar: 'Voici votre page jusqu’ici',
  gotIt: 'C’est noté.', savedNo: 'Merci de nous l’avoir dit.', youSaid: '✓ Enregistré. Vous avez répondu : {a}. Vous pouvez le modifier ici.',
  noLabels: { closures: 'rien à venir', happy: 'pas de happy hour', specials: 'pas de spéciaux', music: 'pas d’événements', book: 'sans réservation', takeout: 'pas de commandes à emporter', groups: 'pas de grands groupes', instagram: 'pas sur Instagram', facebook: 'pas sur Facebook' },
  helpYes: 'Oui. Quand vous voyez <strong>Enregistré ✓</strong>, nous l’avons. Voici ce que nous avons reçu de vous en ce moment :', helpNone: 'Rien encore. Commencez par la première question.',
  helpTail: 'Les photos, votre menu, votre adresse, votre téléphone et votre description s’affichent d’ici un jour. Tout le reste est en ligne tout de suite.',
  closuresLead: 'Touchez les jours fériés où vous êtes fermé. Fermé plus longtemps? Ajoutez les dates ci-dessous.', anotherDay: '+ Fermé une semaine ou deux (ou d’autres dates)', wholeMonths: '+ Nous fermons des mois entiers chaque année',
  monthsRow: 'Ouvert de {a} à {b} chaque année', monthsUse: 'Utiliser ces mois', allYearBtn: 'Nous sommes ouverts toute l’année',
  closeAddLead: 'Pour une pause hivernale, des rénovations, un événement privé ou un jour férié qui n’est pas sur la liste.', howLong: 'Combien de temps êtes-vous fermé?', len1: '1 jour', len7: '1 semaine', len14: '2 semaines', lenPick: 'Choisir le dernier jour', lastDay: 'Dernier jour de fermeture',
  uploadSub: 'Un fichier ou des photos de votre téléphone ou ordinateur', upLead: 'Choisissez le fichier de votre menu. Un fichier ou des photos, les deux fonctionnent.', sendMenu: 'Envoyer mon menu',
  emailLead: 'Envoyez une photo ou un fichier de votre menu. Indiquez « {name} » dans l’objet.', upSub: 'Un fichier ou une photo de votre téléphone', sheetLead: 'Un fichier, une photo d’affiche, de chevalet ou de tableau, tout fonctionne. Nous le retranscrirons pour vous.',
  dogLead: 'Une courte ligne, c’est parfait.',
  whatsOnEx: 'Pintes à 6 $ et entrées à moitié prix', specialEx: 'Mardi tacos, 3 tacos', priceEx: '12 $', eventEx: 'Soirée quiz, gratuit', eventTime: 'À quelle heure ça commence? (facultatif)',
  storyCount: 'Un peu plus, ce serait parfait (120 caractères pour une page complète).', storyGood: 'Belle longueur ✓',
  bookQ: 'Peut-on réserver une table?', bookYes: 'Oui', bookNo: 'Non, sans réservation', bookNoLink: 'En fait, nous ne prenons pas de réservations', takeoutNoLink: 'En fait, nous ne faisons pas de commandes à emporter', groupsNoLink: 'En fait, nous ne pouvons pas accueillir de grands groupes',
  groupsQ: 'Pouvez-vous accueillir des groupes de 10 personnes ou plus?',
  igLead: 'Écrivez votre nom Instagram, comme @votrerestaurant.', fbQ: 'Comment s’appelle votre page Facebook?', fbLead: 'Écrivez le nom de votre page. Si vous avez son lien, vous pouvez le coller.', fbLabel: 'Nom ou lien de la page Facebook',
  socialSent: '✓ Vous nous avez donné le nom. Nous ajouterons le lien d’ici un jour.', savedFbName: 'Nous ajouterons votre lien Facebook d’ici un jour.', savedIgName: 'Nous ajouterons votre lien Instagram d’ici un jour.',
  fbNote: 'Notre page Facebook s’appelle : « {name} ». Merci de trouver le lien et de l’ajouter à notre page.', igNote: 'Notre nom Instagram est : « {name} ». Merci de trouver le lien et de l’ajouter à notre page.',
});
fr.st.no = 'non';

// Fresh-eyes fixes (2026-11-10).
Object.assign(en, {
  hiLead: 'Let’s get your page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.',
  nextPlain: 'Next', backToList: 'Back to the list', changeQ: 'Change something?', changeLead: 'Tap anything to change it.', welcomeLead: 'Your answers are saved. Tap any line to change it.',
  menuSentEmail: '✓ You said you’ll email your menu.',
  pctWill: 'Your page will be about {n}% complete', pctWillSub: 'once we add what you sent, usually within a day.', pctRightNow: 'It’s {n}% right now.',
  leftLater: '{n} left for later, whenever suits you.', leftLater1: '1 thing left for later, whenever suits you.', finishAlmost: 'Nearly there',
  exitQ: 'Save these first?', exitLead: 'You have answers on this screen that aren’t saved yet.', exitSave: 'Save and exit', exitDrop: 'Exit without saving', exitStay: 'Keep going',
  added: 'Added: {x}', holidaysH: 'Holidays', closuresLead: 'Closed for a while? Add the dates. Then tap the holidays you’re closed.',
  noneDiet: 'None of these', noneDietSub: 'No vegan, vegetarian or gluten-free options',
  savedSoon: 'It’ll show on your page soon.',
  upload: 'Upload my menu (a file or photos)', uploadSub: 'From your phone or computer',
  pickKind: 'Pick a kind', kindIs: 'Kind: {k}', fewMore: 'A few more', tapBigger: 'Tap a page to see it bigger.',
  helpTail: 'Photos, your menu and your description show on your page within a day. So does a new address or phone number, if you changed it. Everything else is on your page right away.',
});
en.noLabels = Object.assign({}, en.noLabels, { groups: 'no big groups' });
Object.assign(fr, {
  hiLead: 'Préparons votre page, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  nextPlain: 'Suivant', backToList: 'Retour à la liste', changeQ: 'Changer quelque chose?', changeLead: 'Touchez une ligne pour la modifier.', welcomeLead: 'Vos réponses sont enregistrées. Touchez une ligne pour la modifier.',
  menuSentEmail: '✓ Vous avez dit que vous enverrez votre menu par courriel.',
  pctWill: 'Votre fiche sera complète à environ {n} %', pctWillSub: 'dès que nous aurons ajouté ce que vous avez envoyé, habituellement d’ici un jour.', pctRightNow: 'Elle est à {n} % en ce moment.',
  leftLater: 'Il en reste {n} pour plus tard, quand vous voudrez.', leftLater1: 'Il en reste 1 pour plus tard, quand vous voudrez.', finishAlmost: 'Vous y êtes presque',
  exitQ: 'Enregistrer d’abord?', exitLead: 'Des réponses sur cet écran ne sont pas encore enregistrées.', exitSave: 'Enregistrer et quitter', exitDrop: 'Quitter sans enregistrer', exitStay: 'Continuer',
  added: 'Ajouté : {x}', holidaysH: 'Jours fériés', closuresLead: 'Fermé un certain temps? Ajoutez les dates. Touchez ensuite les jours fériés où vous êtes fermé.',
  noneDiet: 'Aucune de ces options', noneDietSub: 'Pas d’options véganes, végétariennes ou sans gluten',
  savedSoon: 'Cela s’affichera bientôt sur votre page.',
  upload: 'Téléverser mon menu (un fichier ou des photos)', uploadSub: 'De votre téléphone ou ordinateur',
  pickKind: 'Choisir un genre', kindIs: 'Genre : {k}', fewMore: 'Quelques autres', tapBigger: 'Touchez une page pour l’agrandir.',
  helpTail: 'Les photos, votre menu et votre description s’affichent d’ici un jour, tout comme une nouvelle adresse ou un nouveau numéro de téléphone si vous les avez modifiés. Tout le reste est en ligne tout de suite.',
});

// Fresh-eyes 3 (2026-11-10): typed answers always come back as typed; one number on the finish screens; tap-first answers.
Object.assign(en, {
  dealLong: 'Happy hour {n}: that’s a bit long. Please keep “What’s on special?” to {max} letters.', dealsMany: 'That’s more deals than fit on your page (6 at most). Please remove one.',
  textLong: 'Number {n} is a bit long. Please keep it to {max} letters.',
  soFarQ: 'Your answers so far', optional: 'Optional', sentTitle: 'Sent',
  essReady: 'Your page is ready', essCount: '{n} of {total} essentials done.', essSkipped: 'Skipped for now. Tap one to do it:',
  pctAbout: 'About {n}% complete', pctAboutSub: 'once we add what you sent (usually within a day).', pctRaise: 'Add more about your place to raise it.',
  saveClosures1: 'Save these closures ({n} new)', saveClosuresN: 'Save these closures ({n} new)',
  menuSentQ: 'Your menu is sent ✓', menuNewer: 'Want to send a newer menu?',
  quickLead: 'Tap what fits:', quickOr: 'Or type it in your own words:',
  quick: { reservations: ['Call us', 'Book on our website', 'Walk-ins welcome too'], takeout: ['Call to order', 'Order at the counter', 'DoorDash', 'SkipTheDishes', 'Uber Eats'],
    dogs: ['Patio only', 'Inside and patio', 'Water bowls at the door'], groups: ['Call ahead for 10 or more', 'Private room available'] },
  savedCuisine: 'Your food types and kind of place are on your page now.', stSoon: 'on your page soon',
  helpSpend: 'Your average spend will show on your page soon.',
  tooSmall: 'This photo is too small to look sharp. Try the original from your camera roll.',
  savedLater: 'We’ll remind you next time. You can do it any time from your edit page.', backSettings: 'Back to my edit page',
  helpTail: 'Photos, your menu and your description show on your page within a day. So does a new address or phone number, if you changed it. Everything else is on your page right away.',
});
en.offers.dog_friendly = 'Dogs welcome (even just the patio)';
Object.assign(fr, {
  dealLong: 'Happy hour {n} : c’est un peu long. Gardez « Qu’est-ce qui est en spécial? » à {max} caractères.', dealsMany: 'C’est plus d’offres que votre page peut en afficher (6 au plus). Retirez-en une.',
  textLong: 'Le numéro {n} est un peu long. Gardez-le à {max} caractères.',
  soFarQ: 'Vos réponses jusqu’ici', optional: 'Facultatif', sentTitle: 'Envoyé',
  essReady: 'Votre page est prête', essCount: '{n} éléments essentiels sur {total} sont faits.', essSkipped: 'Passés pour l’instant. Touchez-en un pour le faire :',
  pctAbout: 'Complète à environ {n} %', pctAboutSub: 'dès que nous aurons ajouté ce que vous avez envoyé (habituellement d’ici un jour).', pctRaise: 'Ajoutez plus de détails pour l’augmenter.',
  saveClosures1: 'Enregistrer ces fermetures ({n} nouvelle)', saveClosuresN: 'Enregistrer ces fermetures ({n} nouvelles)',
  menuSentQ: 'Votre menu est envoyé ✓', menuNewer: 'Voulez-vous envoyer un menu plus récent?',
  quickLead: 'Touchez ce qui convient :', quickOr: 'Ou écrivez-le dans vos mots :',
  quick: { reservations: ['Appelez-nous', 'Réservez sur notre site Web', 'Sans réservation aussi'], takeout: ['Appelez pour commander', 'Commandez au comptoir', 'DoorDash', 'SkipTheDishes', 'Uber Eats'],
    dogs: ['Terrasse seulement', 'Intérieur et terrasse', 'Bols d’eau à l’entrée'], groups: ['Appelez à l’avance pour 10 ou plus', 'Salle privée disponible'] },
  savedCuisine: 'Vos types de cuisine et votre genre d’endroit sont sur votre page maintenant.', stSoon: 'bientôt sur votre page',
  helpSpend: 'Votre dépense moyenne s’affichera bientôt sur votre page.',
  tooSmall: 'Cette photo est trop petite pour être nette. Essayez l’originale de votre pellicule.',
  savedLater: 'Nous vous le rappellerons la prochaine fois. Vous pouvez le faire à tout moment depuis votre page de modification.', backSettings: 'Retour à ma page de modification',
  helpTail: 'Les photos, votre menu et votre description s’affichent d’ici un jour, tout comme une nouvelle adresse ou un nouveau numéro de téléphone si vous les avez modifiés. Tout le reste est en ligne tout de suite.',
});
fr.offers.dog_friendly = 'Chiens bienvenus (même juste sur la terrasse)';

// Pubs (Dayton, 2026-11-10; mockup drafts/pub-portal-2026-11-10/pub-setup.html): pub examples and the pub-only screens,
// laid over the words above for a pub's setup (server.js renderOwnerSetupPage). Restaurants never see these.
en.pub = {
  hiLead: 'Let’s get your pub’s page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.',
  cuisineLead: 'We picked Pub Fare. Add up to 2 more, or change it.', cuisineLeadEmpty: 'Pick up to 3. Serving food now? Pick what you serve.', noFood: 'We don’t serve food',
  placeQ: 'What kind of pub is it?', placeLead: 'Pick the one that fits best.',
  groupsLead: 'Birthdays, work parties, team nights.', knownEx: 'Wing night and the hockey on the big screen', igLead: 'Type your Instagram name, like @yourpub.',
  kitchenQ: 'Does your kitchen close before the bar?', kitchenLead: 'Lots of pubs stop serving food before last call. Visitors want to know before they come in hungry.',
  kitchenEarlier: 'Yes, the kitchen closes earlier', kitchenSame: 'No, food until we close', kitchenNone: 'We don’t serve food',
  kitchenTimeQ: 'When does the kitchen close?', kitchenTimeLead: 'The same time every night is fine. If it changes on weekends, add a note.',
  kitchenAt: 'Kitchen closes at', kitchenNoteLabel: 'Different on some nights? (optional)', kitchenNoteEx: 'Fri and Sat, food until 11 PM', saveMyHours: 'Save my hours',
  kitchenSaid: { same: 'You said: food until you close.', earlier: 'You said: the kitchen closes at {t}.', none: 'You said: you don’t serve food.' },
  sportsQ: 'Which sports do you show?', sportsLead: 'Tap all that apply. Fans search for “where to watch the game”.', tvsQ: 'How many TVs?',
  sportsEx: 'Big games with sound? Say so in “Weekly events” later.', sportsNeed: 'Please tap at least one sport, or go back and untick Sports on TV.',
  minorsQ: 'Who’s welcome?', minorsLead: 'Families often check this before they come. Tell us your own rule.',
  minorsOpts: { adults: 'Adults only (19+)', minors_until: 'Minors welcome with an adult, until a set time', all_ages: 'All ages welcome' },
  minorsUntil: 'Minors welcome until', minorsNoteLabel: 'Anything else? (optional)', minorsNoteEx: 'Kids welcome in the dining room until 9 PM; patio is 19+.',
  minorsNeed: 'Please tap one of the three, so families know before they come.', saveThese: 'Save these', nextPlain: 'Next',
  noLabels: { cuisine: 'no food' },
  quick: Object.assign({}, en.quick, { groups: ['Call ahead for 10 or more', 'Private room available', 'Book the patio'] }),
};
fr.pub = {
  hiLead: 'Préparons la page de votre pub, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  cuisineLead: 'Nous avons choisi Cuisine de pub. Ajoutez-en jusqu’à 2 autres, ou changez-la.', cuisineLeadEmpty: 'Choisissez-en jusqu’à 3. Vous servez à manger maintenant? Choisissez ce que vous servez.', noFood: 'Nous ne servons pas de nourriture',
  placeQ: 'Quel genre de pub est-ce?', placeLead: 'Choisissez celui qui convient le mieux.',
  groupsLead: 'Anniversaires, fêtes de bureau, soirées d’équipe.', knownEx: 'La soirée ailes de poulet et le hockey sur grand écran', igLead: 'Écrivez votre nom Instagram, comme @votrepub.',
  kitchenQ: 'Votre cuisine ferme-t-elle avant le bar?', kitchenLead: 'Bien des pubs cessent de servir à manger avant le dernier service. Les visiteurs veulent le savoir avant d’arriver affamés.',
  kitchenEarlier: 'Oui, la cuisine ferme plus tôt', kitchenSame: 'Non, on sert à manger jusqu’à la fermeture', kitchenNone: 'Nous ne servons pas de nourriture',
  kitchenTimeQ: 'À quelle heure la cuisine ferme-t-elle?', kitchenTimeLead: 'La même heure tous les soirs, c’est parfait. Si elle change la fin de semaine, ajoutez une note.',
  kitchenAt: 'La cuisine ferme à', kitchenNoteLabel: 'Différent certains soirs? (facultatif)', kitchenNoteEx: 'Ven. et sam., nourriture jusqu’à 23 h', saveMyHours: 'Enregistrer mes heures',
  kitchenSaid: { same: 'Vous avez dit : nourriture jusqu’à la fermeture.', earlier: 'Vous avez dit : la cuisine ferme à {t}.', none: 'Vous avez dit : vous ne servez pas de nourriture.' },
  sportsQ: 'Quels sports diffusez-vous?', sportsLead: 'Touchez tout ce qui s’applique. Les amateurs cherchent « où regarder le match ».', tvsQ: 'Combien de téléviseurs?',
  sportsEx: 'De grands matchs avec le son? Dites-le plus tard dans « Événements de la semaine ».', sportsNeed: 'Touchez au moins un sport, ou revenez en arrière et décochez Sports à la télé.',
  minorsQ: 'Qui est le bienvenu?', minorsLead: 'Les familles vérifient souvent avant de venir. Dites-nous votre propre règle.',
  minorsOpts: { adults: 'Adultes seulement (19 ans et plus)', minors_until: 'Mineurs bienvenus avec un adulte, jusqu’à une heure donnée', all_ages: 'Tous les âges sont bienvenus' },
  minorsUntil: 'Mineurs bienvenus jusqu’à', minorsNoteLabel: 'Autre chose? (facultatif)', minorsNoteEx: 'Enfants bienvenus dans la salle à manger jusqu’à 21 h; terrasse 19 ans et plus.',
  minorsNeed: 'Touchez l’une des trois réponses, pour que les familles le sachent avant de venir.', saveThese: 'Enregistrer', nextPlain: 'Suivant',
  noLabels: { cuisine: 'pas de nourriture' },
  quick: Object.assign({}, fr.quick, { groups: ['Appelez à l’avance pour 10 ou plus', 'Salle privée disponible', 'Réservez la terrasse'] }),
};

// Pub fresh-eyes fixes (2026-11-10): a warmer greeting, an honest time, the kind of place in the front-door step, plain
// words instead of "Roam Now map", and only two ways of saying "when" (Saved ✓ / Sent ✓).
Object.assign(en, {
  hi: 'Hi, welcome to your page for {name} 👋',
  hiLead: 'Let’s get your page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.',
  doorLead: 'So visitors can walk right to your door. It takes one photo, taken outside your {type}.',
  doorHere: 'Are you at your {type} right now?',
  helpYes: 'Yes. When you see <strong>Saved ✓</strong> or <strong>Sent ✓</strong>, we have it. Here’s what we have from you right now:',
  mapFail: 'We couldn’t load the map. Send it with your address and we’ll place the pin for you.', mapFailSend: 'Send with my address', mapFailQ: 'Send your front door photo',
  sameEvery: 'Same every day', sameAsMon: 'Same as Monday', openOn: 'Open ✓', closedOff: 'Closed',
  allDay: 'All day (open to close)', everyYear: 'This year and next', everyYearSub: 'Ticked: we also mark you closed on that day next year.',
  moreKinds: 'More kinds', andMore: 'and more',
});
en.pub.hiLead = 'Let’s get your pub’s page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.';
Object.assign(fr, {
  hi: 'Bonjour, bienvenue sur votre page pour {name} 👋',
  hiLead: 'Préparons votre page, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  doorLead: 'Pour que les visiteurs marchent jusqu’à votre porte. Il suffit d’une photo, prise devant votre {type}.',
  doorHere: 'Êtes-vous à votre {type} en ce moment?',
  helpYes: 'Oui. Quand vous voyez <strong>Enregistré ✓</strong> ou <strong>Envoyé ✓</strong>, nous l’avons. Voici ce que nous avons reçu de vous en ce moment :',
  mapFail: 'Nous n’avons pas pu charger la carte. Envoyez-la avec votre adresse et nous placerons l’épingle pour vous.', mapFailSend: 'Envoyer avec mon adresse', mapFailQ: 'Envoyez la photo de votre devanture',
  sameEvery: 'Pareil tous les jours', sameAsMon: 'Comme lundi', openOn: 'Ouvert ✓', closedOff: 'Fermé',
  allDay: 'Toute la journée (de l’ouverture à la fermeture)', everyYear: 'cette année et l’an prochain', everyYearSub: 'Si coché, nous l’indiquons aussi l’an prochain.',
  moreKinds: 'Autres genres', andMore: 'et plus',
});
fr.pub.hiLead = 'Préparons la page de votre pub, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.';

// Second first-time pub test (2026-11-10). Shared with restaurants (same setup), except the pub-only lines.
Object.assign(en, {
  midnightNote: '= midnight', earlyNote: '{t} (early {day} morning)',
  sameEvery: 'Copy Monday to every day',
  tooSmall: 'This one would look blurry. Pick a different one.',
  reviewLeadKeep: 'Tap ✕ to remove one. Your main photo stays the same unless you pick a new one.',
  curMain: 'Your main photo now', keepMain: 'Keep my current main photo',
  everyDay: 'Every day', monFri: 'Mon–Fri',
  badgeReach: 'Reach 100% to earn it', badgeSoon: 'Yours once we’ve checked what you sent',
  spendGuess: 'We guessed ${n} from what we found online.',
  sentMeans: 'Sent means we check it first, usually within a day.',
});
Object.assign(fr, {
  midnightNote: '= minuit', earlyNote: '{t} (tôt {day} matin)',
  sameEvery: 'Copier lundi à tous les jours',
  tooSmall: 'Celle-ci serait floue. Choisissez-en une autre.',
  reviewLeadKeep: 'Touchez ✕ pour en retirer une. Votre photo principale reste la même, sauf si vous en choisissez une nouvelle.',
  curMain: 'Votre photo principale actuelle', keepMain: 'Garder ma photo principale actuelle',
  everyDay: 'Tous les jours', monFri: 'Lun–ven',
  badgeReach: 'Atteignez 100 % pour l’obtenir', badgeSoon: 'À vous dès que nous aurons vérifié ce que vous avez envoyé',
  spendGuess: 'Nous avons estimé {n} $ d’après ce que nous avons trouvé en ligne.',
  sentMeans: 'Envoyé veut dire que nous vérifions d’abord, habituellement en moins d’un jour.',
});
en.pub.sportsEx = 'Do you turn the sound on for big games? You can add that later under “Weekly events”.';
fr.pub.sportsEx = 'Vous mettez le son pour les grands matchs? Vous pourrez l’ajouter plus tard dans « Événements de la semaine ».';

// Third first-time pub test (2026-11-10; drafts/fresh-eyes-pub3-2026-11-10/REPORT.md). Shared with restaurants except the
// pub-only lines.
Object.assign(en, {
  clearField: 'Clear this box',
  lateHint: 'Open after midnight? Tap Midnight, 1 AM or 2 AM under that day. Friday until 1 AM means 1 AM early Saturday morning.',
  lateLbl: 'Closes later?', lateQ: '{day}: closes at midnight or later',
  // Winery test 4 (2026-11-12): "done" only when every essential is; with one or more left, "Nearly done".
  essReady: 'The essentials are done', essNearly: 'Nearly done', essBarNearly: 'The essentials: nearly done', finishBar: 'Your answers are saved',
  sentMeans: 'Sent means we check it first. It’ll show on your page within a day.',
  fbWhy: 'We find your Facebook link for you, so it shows within a day. Instagram goes on your page right away.',
  savedFbName: 'We find your Facebook link for you, so it shows within a day.',
  doorNextTime: 'Do this next time you’re at your {type}',
  spendAsk: 'About ${n} a person?', spendAskSub: 'That’s what we found online, for one main and a soft drink before tax and tip.', spendAskYes: 'Yes, about ${n}', spendAskNo: 'No, change it',
  saveKitchen: 'Save kitchen time',
  helpTail: 'Photos, your menu and your description show on your page within a day. So does a new address or website, if you changed it. A new phone number and everything else is on your page right away.',
});
Object.assign(fr, {
  clearField: 'Effacer ce champ',
  lateHint: 'Ouvert après minuit? Touchez minuit, 1 h ou 2 h sous cette journée. Vendredi jusqu’à 1 h veut dire 1 h tôt samedi matin.',
  lateLbl: 'Ferme plus tard?', lateQ: '{day} : ferme à minuit ou plus tard',
  essReady: 'L’essentiel est fait', essNearly: 'Presque terminé', essBarNearly: 'L’essentiel : presque terminé', finishBar: 'Vos réponses sont enregistrées',
  sentMeans: 'Envoyé veut dire que nous vérifions d’abord. Cela s’affichera sur votre page d’ici un jour.',
  fbWhy: 'Nous trouvons le lien de votre page Facebook pour vous, il s’affiche donc d’ici un jour. Instagram s’affiche sur votre page tout de suite.',
  savedFbName: 'Nous trouvons le lien de votre page Facebook pour vous, il s’affiche donc d’ici un jour.',
  doorNextTime: 'À faire la prochaine fois que vous serez à votre {type}',
  spendAsk: 'Environ {n} $ par personne?', spendAskSub: 'C’est ce que nous avons trouvé en ligne, pour un plat principal et une boisson sans alcool, avant taxes et pourboire.', spendAskYes: 'Oui, environ {n} $', spendAskNo: 'Non, le changer',
  saveKitchen: 'Enregistrer l’heure de la cuisine',
  helpTail: 'Les photos, votre menu et votre description s’affichent d’ici un jour, tout comme une nouvelle adresse ou un nouveau site Web si vous les avez modifiés. Un nouveau numéro de téléphone et tout le reste sont en ligne tout de suite.',
});
Object.assign(en.pub, { saveKitchen: 'Save kitchen time', saveMyHours: 'Save kitchen time',
  sportsEx: 'Tip: if you turn the sound on for big games, you can add that later under “Weekly events”.' });
Object.assign(fr.pub, { saveKitchen: 'Enregistrer l’heure de la cuisine', saveMyHours: 'Enregistrer l’heure de la cuisine',
  sportsEx: 'Astuce : si vous mettez le son pour les grands matchs, vous pourrez l’ajouter plus tard dans « Événements de la semaine ».' });

// Step 1 with a new phone AND a new address or website (2026-11-10): the phone is live already, the rest is checked first.
Object.assign(en, {
  phoneLiveNow: 'Your new phone number is on your page now.',
  phoneRestSite: 'Your website will show within a day, after we check it.',
  phoneRestAddr: 'Your new address will show within a day, after we check it.',
  phoneRestBoth: 'Your new address and website will show within a day, after we check them.',
});
Object.assign(fr, {
  phoneLiveNow: 'Votre nouveau numéro de téléphone est déjà sur votre page.',
  phoneRestSite: 'Votre site web s’affichera en moins d’un jour, après vérification.',
  phoneRestAddr: 'Votre nouvelle adresse s’affichera en moins d’un jour, après vérification.',
  phoneRestBoth: 'Votre nouvelle adresse et votre site web s’afficheront en moins d’un jour, après vérification.',
});

// Fourth first-time pub test (2026-11-10; drafts/fresh-eyes-pub4-2026-11-10/REPORT.md). Shared with restaurants.
Object.assign(en, {
  // Hours: a short list of the 7 days with a Change button each; only the days tapped open up.
  hoursEditLead: 'Tap Change beside any day that’s different. The other days stay as they are.',
  hoursChange: 'Change', hoursChangeDay: 'Change {day}', hoursDoneDay: 'Done ✓', copyTo: 'Copy these hours to:', copyAll: 'Every day', copyWeek: 'Mon–Fri',
  // Menu photos: "Add another page" comes first.
  camLeadSome: 'Got another page? Add it first. When every page is here, tap Send. Tap ✕ to retake one.',
  // No dogs: its own answer on "What you offer".
  noDogs: 'No dogs allowed', noDogsSub: 'Not inside or on the patio', noDogsSubInside: 'Not inside or outside',
  // "About $24 a person?": Not sure? Skip.
  spendSkip: 'Not sure? Skip',
  fbWhy: 'We find your Facebook link for you, so it shows within a day.',
  kitchenNeed: 'Please pick the time your kitchen closes.',
});
Object.assign(fr, {
  hoursEditLead: 'Touchez Modifier à côté d’une journée différente. Les autres journées restent telles quelles.',
  hoursChange: 'Modifier', hoursChangeDay: 'Modifier {day}', hoursDoneDay: 'Terminé ✓', copyTo: 'Copier ces heures à :', copyAll: 'Tous les jours', copyWeek: 'Lun–ven',
  camLeadSome: 'Une autre page? Ajoutez-la d’abord. Quand toutes les pages sont là, touchez Envoyer. Touchez ✕ pour en reprendre une.',
  noDogs: 'Chiens non admis', noDogsSub: 'Ni à l’intérieur ni sur la terrasse', noDogsSubInside: 'Ni à l’intérieur ni à l’extérieur',
  spendSkip: 'Je ne sais pas, passer',
  fbWhy: 'Nous trouvons le lien de votre page Facebook pour vous, il s’affiche donc d’ici un jour.',
  kitchenNeed: 'Choisissez l’heure à laquelle votre cuisine ferme.',
});

// Fifth first-time pub test (2026-11-10; drafts/fresh-eyes-pub5-2026-11-10/REPORT.md). Shared with restaurants.
Object.assign(en.holidays, { victoria: 'Victoria Day', canada: 'Canada Day', bcDay: 'BC Day', labour: 'Labour Day', truth: 'Truth and Reconciliation Day', thanks: 'Thanksgiving', remembrance: 'Remembrance Day' });
Object.assign(fr.holidays, { victoria: 'Fête de Victoria', canada: 'Fête du Canada', bcDay: 'Jour de la Colombie-Britannique', labour: 'Fête du Travail', truth: 'Journée de la vérité et de la réconciliation', thanks: 'Action de grâce', remembrance: 'Jour du Souvenir' });
Object.assign(en, {
  // Hours: copying never reopens a closed day.
  copyOpen: 'Every open day', copyClosedNote: 'Days marked Closed stay closed.',
  // Closures: the next few holidays, then the rest.
  holAll: 'Show all holidays ({n})', holFewer: 'Show fewer holidays',
  // Menu on Facebook or Instagram; no website filled in when there is none.
  menuSocial: 'My menu is on Facebook or Instagram', menuSocialQ: 'Where is your menu?', menuSocialLead: 'Paste the link to your Facebook or Instagram page or post with the menu. Or type the page name and we’ll find it.',
  menuSocialLabel: 'Link or page name', menuSocialEx: 'facebook.com/yourpub or @yourpub', menuSocialEmpty: 'Please paste the link, or type the name of your page.',
  menuSocialNote: 'Our menu is on our Facebook or Instagram page: “{name}”. Please find it and add it as our menu link.', savedMenuSocialName: 'We’ll find your menu on that page. It’ll show on your page within a day.',
  webQEmpty: 'Where is your menu online?', webLeadEmpty: 'Type the address of the page your menu is on.',
  // "What you offer": ticks from research; a description that still mentions sports.
  researchLine: 'We ticked these from what we found online. Untick anything that’s wrong.',
  storySportsQ: 'Your description still mentions sports', storySportsLead: 'It says “{bit}”. You can change that in your description.', storySportsBtn: 'Fix my description',
  storySportsHint: 'You said you don’t show sports, but your description says “{bit}”. Change or remove that part, then save. We check it first.',
});
Object.assign(fr, {
  copyOpen: 'Chaque jour ouvert', copyClosedNote: 'Les journées marquées Fermé restent fermées.',
  holAll: 'Voir tous les jours fériés ({n})', holFewer: 'Voir moins de jours fériés',
  menuSocial: 'Mon menu est sur Facebook ou Instagram', menuSocialQ: 'Où est votre menu?', menuSocialLead: 'Collez le lien de votre page ou publication Facebook ou Instagram avec le menu. Ou tapez le nom de la page et nous le trouverons.',
  menuSocialLabel: 'Lien ou nom de la page', menuSocialEx: 'facebook.com/votrepub ou @votrepub', menuSocialEmpty: 'Collez le lien ou tapez le nom de votre page.',
  menuSocialNote: 'Notre menu est sur notre page Facebook ou Instagram : « {name} ». Merci de le trouver et de l’ajouter comme lien de notre menu.', savedMenuSocialName: 'Nous trouverons votre menu sur cette page. Il s’affichera sur votre page d’ici un jour.',
  webQEmpty: 'Où est votre menu en ligne?', webLeadEmpty: 'Tapez l’adresse de la page où se trouve votre menu.',
  researchLine: 'Nous avons coché ceux-ci d’après ce que nous avons trouvé en ligne. Décochez tout ce qui est faux.',
  storySportsQ: 'Votre description parle encore de sports', storySportsLead: 'Elle dit « {bit} ». Vous pouvez changer cela dans votre description.', storySportsBtn: 'Corriger ma description',
  storySportsHint: 'Vous avez indiqué ne pas diffuser de sports, mais votre description dit « {bit} ». Modifiez ou retirez ce passage, puis enregistrez. Nous la vérifions d’abord.',
});

// Sixth first-time pub test (2026-11-10; drafts/fresh-eyes-pub6-2026-11-10/REPORT.md). Shared with restaurants.
Object.assign(en, {
  // Hours: one question after the usual week; the other season has its own day-by-day list.
  hoursNext: 'Next',
  allYearQ: 'Are these your hours all year?', allYearLead: 'If they change for part of the year, tap the season that’s different.',
  allYearYes: 'Yes, all year', allYearSummer: 'No, different in summer', allYearSummerSub: 'You add the summer hours next', allYearWinter: 'No, different in winter', allYearWinterSub: 'You add the winter hours next',
  seasonNow: 'Your page has different {kind} hours now, {a} to {b}.', seasonWord: { summer: 'summer', winter: 'winter' },
  seasonEditQ: { summer: 'Your summer hours', winter: 'Your winter hours' },
  seasonEditLead: 'Tap the months, then Change beside any day that’s different. Any day can be open, even one that’s closed the rest of the year.',
  seasonDaysH: 'Hours in those months', seasonNeedOpenDay: 'Please set at least one day you’re open in those months.',
  winterNeedMonths: 'Please tap the months when your hours are different.',
  // Weekly events: "Something else" empties the box.
  otherPh: 'Type the name, e.g. Meat draw', otherNeed: 'Please type the name of your event.',
  // What you offer (pubs): an explicit "no sports".
  noSports: 'No sports / no TVs', noSportsSub: 'We don’t show sports on TV',
  // Photos: where the photo on the page now came from.
  curMainGoogle: 'The photo we have now (from Google Maps)', curMainOther: 'The photo we have now', keepMainOther: 'Keep this photo for now',
  reviewLeadKeepOther: 'Tap ✕ to remove one. The photo we have now stays at the top unless you pick one of yours as the main photo.',
  // Instagram and Facebook: "Not sure" is an answer too.
  socialUnsure: 'Not sure / someone else runs it', socialUnsureSub: 'That’s fine. We won’t ask again.', savedUnsure: 'No problem. We won’t ask again. You can add it any time from your edit page.',
  // "I'm done for now" is the end.
  doneNowTitle: 'Nice work!', doneNowLead: 'Your answers are saved. That’s all for now.', addLater: 'Want to add more later?', addLaterLead: 'All optional. Each one raises your number a little.',
});
en.st = Object.assign({}, en.st, { unsure: 'not sure (that’s fine)' });
// The old one-time seasonal box is gone (its hint assumed the current hours were the summer ones).
delete en.winterQ; delete en.winterHint; delete en.hoursThen;
Object.assign(fr, {
  hoursNext: 'Suivant',
  allYearQ: 'Ces heures sont-elles les mêmes toute l’année?', allYearLead: 'Si elles changent une partie de l’année, touchez la saison qui est différente.',
  allYearYes: 'Oui, toute l’année', allYearSummer: 'Non, elles changent en été', allYearSummerSub: 'Vous ajoutez les heures d’été ensuite', allYearWinter: 'Non, elles changent en hiver', allYearWinterSub: 'Vous ajoutez les heures d’hiver ensuite',
  seasonNow: 'Votre page a des heures d’{kind} différentes en ce moment, de {a} à {b}.', seasonWord: { summer: 'été', winter: 'hiver' },
  seasonEditQ: { summer: 'Vos heures d’été', winter: 'Vos heures d’hiver' },
  seasonEditLead: 'Touchez les mois, puis Modifier à côté d’une journée différente. Toute journée peut être ouverte, même une qui est fermée le reste de l’année.',
  seasonDaysH: 'Heures pendant ces mois', seasonNeedOpenDay: 'Indiquez au moins un jour d’ouverture pendant ces mois.',
  winterNeedMonths: 'Touchez les mois où vos heures sont différentes.',
  otherPh: 'Écrivez le nom, p. ex. Tirage de viande', otherNeed: 'Écrivez le nom de votre événement.',
  noSports: 'Pas de sports / pas de télé', noSportsSub: 'Nous ne diffusons pas de sports à la télé',
  curMainGoogle: 'La photo que nous avons maintenant (de Google Maps)', curMainOther: 'La photo que nous avons maintenant', keepMainOther: 'Garder cette photo pour l’instant',
  reviewLeadKeepOther: 'Touchez ✕ pour en retirer une. La photo que nous avons maintenant reste en haut, sauf si vous choisissez une des vôtres comme photo principale.',
  socialUnsure: 'Je ne sais pas / quelqu’un d’autre s’en occupe', socialUnsureSub: 'Aucun problème. Nous ne le redemanderons pas.', savedUnsure: 'Aucun problème. Nous ne le redemanderons pas. Vous pouvez l’ajouter à tout moment depuis votre page de modification.',
  doneNowTitle: 'Beau travail!', doneNowLead: 'Vos réponses sont enregistrées. C’est tout pour l’instant.', addLater: 'Ajouter plus de détails plus tard?', addLaterLead: 'Tout est facultatif. Chacun augmente un peu votre pourcentage.',
});
fr.st = Object.assign({}, fr.st, { unsure: 'pas certain (c’est correct)' });
delete fr.winterQ; delete fr.winterHint; delete fr.hoursThen;

// Pub test 7 (2026-11-10): seasons for happy hour, specials and events (and exact season dates), one-tap Closed, months
// closed, the seasonal kitchen time, the story box, the menu link and the new main photo.
Object.assign(en, {
  seasonQ2: 'When does it run?', seasonAll: 'All year', seasonSome: 'Only some months', seasonHint: 'Tap the months it runs.',
  seasonExactLink: 'Starts or ends mid-month? Pick the exact dates', seasonExactMonths: 'Use whole months instead', seasonFrom: 'Starts on', seasonTo: 'Ends on',
  seasonNeedMonths: 'Please tap the months it runs, or tap “All year”.', seasonNeedDates: 'Please pick the first and last day, or use whole months.',
  happySeasonH: 'Is your happy hour all year?',
  closedWarn: 'Heads up: you’re closed on {days}{when}. It won’t show as on that day.', closedWarnSeason: ' (in your {kind} hours)', closedWarnUsual: ' (in your usual hours)',
  seasonExactLead: 'Or pick the exact first and last day:',
  monthsClosedQ: 'Which months are you closed?', monthsClosedLead: 'Tap each month you’re closed. Your page says “Closed for the season” then, and when you reopen.',
  monthsClosedNeed: 'Please tap the months you’re closed.', monthsClosedInRow: 'Please pick closed months in a row, like November to March.', monthsAllClosed: 'That’s every month. Please leave the months you’re open untapped.',
  monthsClosedRow: 'Closed {a} to {b} each year', monthsClosedOne: 'Closed in {a} each year',
  closeDay: 'Closed', closeDayAria: 'Mark {day} closed', openDayAria: 'Open {day} again',
  kitchenSeasonQ: 'In your {kind} hours ({range}), when does the kitchen close?', kitchenSeasonSame: 'Same time as the rest of the year', kitchenSeasonClose: 'Food until we close',
  kitchenSeasonAt: 'Kitchen closes at', kitchenSeasonNeed: 'Please pick the time, or tap “Same time as the rest of the year”.',
  storyEditHint: 'This is what your page says now. Change any words right in the box, or tap ✕ to clear it and start fresh.', storyClear: 'Clear the text',
  useSite: 'Use {site}', useSiteSub: 'Your website',
  curMainPending: 'Your new main photo (on your page within a day)', keepMainPending: 'Keep this one',
  hoursDoneDayAria: 'Done with {day}',
});
Object.assign(fr, {
  seasonQ2: 'Quand est-ce offert?', seasonAll: 'Toute l’année', seasonSome: 'Seulement certains mois', seasonHint: 'Touchez les mois où c’est offert.',
  seasonExactLink: 'Ça commence ou finit en milieu de mois? Choisissez les dates exactes', seasonExactMonths: 'Utiliser des mois entiers', seasonFrom: 'Commence le', seasonTo: 'Finit le',
  seasonNeedMonths: 'Touchez les mois où c’est offert, ou touchez « Toute l’année ».', seasonNeedDates: 'Choisissez le premier et le dernier jour, ou utilisez des mois entiers.',
  happySeasonH: 'Votre happy hour est-il offert toute l’année?',
  closedWarn: 'Attention : vous êtes fermé le {days}{when}. Ce ne sera pas affiché comme offert ce jour-là.', closedWarnSeason: ' (selon vos heures d’{kind})', closedWarnUsual: ' (selon vos heures habituelles)',
  seasonExactLead: 'Ou choisissez le premier et le dernier jour exacts :',
  monthsClosedQ: 'Quels mois êtes-vous fermé?', monthsClosedLead: 'Touchez chaque mois où vous êtes fermé. Votre page indique alors « Fermé pour la saison » et la date de réouverture.',
  monthsClosedNeed: 'Touchez les mois où vous êtes fermé.', monthsClosedInRow: 'Choisissez des mois de fermeture qui se suivent, comme de novembre à mars.', monthsAllClosed: 'Ce sont tous les mois. Ne touchez pas les mois où vous êtes ouvert.',
  monthsClosedRow: 'Fermé de {a} à {b} chaque année', monthsClosedOne: 'Fermé en {a} chaque année',
  closeDay: 'Fermé', closeDayAria: 'Indiquer {day} fermé', openDayAria: 'Rouvrir {day}',
  kitchenSeasonQ: 'Pendant vos heures d’{kind} ({range}), à quelle heure la cuisine ferme-t-elle?', kitchenSeasonSame: 'Même heure que le reste de l’année', kitchenSeasonClose: 'Nourriture jusqu’à la fermeture',
  kitchenSeasonAt: 'La cuisine ferme à', kitchenSeasonNeed: 'Choisissez l’heure, ou touchez « Même heure que le reste de l’année ».',
  storyEditHint: 'Voici ce que dit votre page maintenant. Modifiez les mots directement dans la boîte, ou touchez ✕ pour l’effacer et recommencer.', storyClear: 'Effacer le texte',
  useSite: 'Utiliser {site}', useSiteSub: 'Votre site Web',
  curMainPending: 'Votre nouvelle photo principale (sur votre page d’ici un jour)', keepMainPending: 'Garder celle-ci',
  hoursDoneDayAria: 'Terminé pour {day}',
});

// Pub test 8 (2026-11-10): "Free. No cost, ever.", a safer "Mark closed" with Undo, full day names, "Open after midnight?",
// service dogs, a clearer photo tick box and optional times for a special.
Object.assign(en, {
  freeLine: 'Free. No cost, ever.',
  closeDayBtn: 'Mark closed', openDayBtn: 'Open this day', dayClosedNow: '{day} closed', undo: 'Undo', reopenDay: 'Reopen',
  lateLbl: 'Open after midnight?', lateQ: '{day}: open after midnight?',
  serviceDogsSub: 'Your page will say “No dogs (service dogs welcome)”',
  rightsStep: 'Tick this, then send',
  specialTimeQ: 'What time? (optional)', specialTimeEx: '10 AM to 1 PM for Sunday brunch. Leave it empty if it’s on all day.', specialTimeSame: 'The start and end times are the same. Please check them, or clear them.',
});
Object.assign(fr, {
  freeLine: 'Gratuit. Sans frais, pour toujours.',
  closeDayBtn: 'Indiquer fermé', openDayBtn: 'Ouvrir ce jour', dayClosedNow: '{day} : fermé', undo: 'Annuler', reopenDay: 'Rouvrir',
  lateLbl: 'Ouvert après minuit?', lateQ: '{day} : ouvert après minuit?',
  serviceDogsSub: 'Votre page indiquera « Pas de chiens (chiens d’assistance bienvenus) »',
  rightsStep: 'Cochez ceci, puis envoyez',
  specialTimeQ: 'À quelle heure? (facultatif)', specialTimeEx: 'de 10 h à 13 h pour le brunch du dimanche. Laissez vide si c’est offert toute la journée.', specialTimeSame: 'L’heure de début et l’heure de fin sont les mêmes. Vérifiez-les ou effacez-les.',
});

// The one time promise (pub test 6, 2026-11-10: the essentials took a careful owner about 30 minutes, not 10 to 15).
// The start screen, the green card and the help topic all use these exact words.
en.timeLine = 'About 15 to 30 minutes. You can stop any time and carry on later.';
fr.timeLine = 'Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.';

// Ninth first-time pub test (2026-11-10; drafts/fresh-eyes-pub9-2026-11-10/REPORT.md). Shared with restaurants.
Object.assign(en, {
  untilClose: 'Until close', untilCloseShort: 'close', closeUnknown: 'We don’t have your closing time for {day}. Please pick an end time instead, or add your hours first.',
  noGames: 'No games', noGamesSub: 'No pool, darts or other games',
  staffLine: 'Managers and staff can use this link too. Each person can make their own login from it, and you’ll all see each other under “People with access”.',
  staffLineIn: 'Managers and staff can have their own login: send them your private edit link. You’ll see them under “People with access”.',
  photoEarlier: 'Move photo {n} earlier', photoLater: 'Move photo {n} later', photoOrderHint: 'Your page shows your photos in this order, after your main photo. Use ◀ ▶ to change it. You can change it later on your edit page too.',
  bookLinkLabel: 'Booking link (optional)', bookLinkEx: 'opentable.ca/r/yourplace or your website’s booking page', bookLinkHint: 'This is the link behind the Book button on your page. We check a new link first, usually within a day.',
  linkInLine: 'That looks like your booking link. It works best in its own box, so your page shows a Book button.', moveLink: 'Move it to the booking link box',
  charsLeft: '{n} characters left', charLeft1: '1 character left', charsOver: '{n} characters too many', charOver1: '1 character too many',
});
Object.assign(fr, {
  untilClose: 'Jusqu’à la fermeture', untilCloseShort: 'la fermeture', closeUnknown: 'Nous n’avons pas votre heure de fermeture du {day}. Choisissez plutôt une heure de fin, ou ajoutez d’abord vos heures.',
  noGames: 'Pas de jeux', noGamesSub: 'Pas de billard, de fléchettes ni d’autres jeux',
  staffLine: 'Les gérants et le personnel peuvent aussi utiliser ce lien. Chaque personne peut créer son propre compte à partir de celui-ci, et vous vous verrez tous sous « Personnes ayant accès ».',
  staffLineIn: 'Les gérants et le personnel peuvent avoir leur propre compte : envoyez-leur votre lien de modification privé. Vous les verrez sous « Personnes ayant accès ».',
  photoEarlier: 'Avancer la photo {n}', photoLater: 'Reculer la photo {n}', photoOrderHint: 'Votre page montre vos photos dans cet ordre, après votre photo principale. Utilisez ◀ ▶ pour le changer. Vous pourrez aussi le changer plus tard sur votre page de modification.',
  bookLinkLabel: 'Lien de réservation (facultatif)', bookLinkEx: 'opentable.ca/r/votreendroit ou la page de réservation de votre site', bookLinkHint: 'C’est le lien du bouton Réserver de votre page. Nous vérifions d’abord un nouveau lien, en général d’ici un jour.',
  linkInLine: 'On dirait votre lien de réservation. Il fonctionne mieux dans sa propre case, pour que votre page affiche un bouton Réserver.', moveLink: 'Le déplacer dans la case du lien de réservation',
  charsLeft: 'Il reste {n} caractères', charLeft1: 'Il reste 1 caractère', charsOver: '{n} caractères de trop', charOver1: '1 caractère de trop',
});

// Cafés (Dayton, 2026-11-10; drafts/cafe-portal-2026-11-10/SPEC-cafes.md, "Decided"): café words and the café-only
// screens, laid over the words above for a café's setup (server.js renderOwnerSetupPage). Restaurants and pubs never see
// these. {words} is the price wording for the café's kind ("a coffee and a pastry", "a single scoop", "one drink"...).
en.cafe = {
  hiLead: 'Let’s get your café’s page ready, one question at a time. About 15 to 30 minutes. You can stop any time and carry on later.',
  labels: { cuisine: 'Kind of café and what you serve', spend: 'Price per person', stay: 'Staying a while', order: 'Ordering', diet: 'Dietary details', coffee: 'Your coffee', sellout: 'Sells out early?' },
  photosLead: 'Your counter, your coffee, your baking. Three photos is perfect.',
  kindQ: 'What kind of café is it?', kindLead: 'Pick the one that fits best. Chocolatiers and donut shops: pick “Dessert & sweets”.',
  kindGuess: 'We picked “{kind}” from your name. Tap another one if it’s not right. Nothing is saved until you tap Next.',
  kindNeed: 'Please tap the one that fits best.', kindNext: 'Next: what you serve',
  serveQ: 'What do you serve?', serveLead: 'Tap all that apply.', serveNeed: 'Please tap at least one, or tap Skip.', saveServe: 'Save',
  styleMore: 'Add a food style (optional)', styleLead: 'For example French or Ukrainian. Pick up to 3.', styleNone: 'No food style picked. That’s fine.',
  savedCuisine: 'Your kind of café and what you serve are on your page now.',
  spendQ: 'About how much is {words}?', spendLead: 'Before tax and tip. Your page will say “About ${n} for {words}”.',
  laptopQ: 'When are laptops welcome?', laptopLead: 'People who want to work for a while look for this. Pick what fits your café.',
  laptops: { all_day: 'All day', not_busy: 'Not at busy times', none: 'No laptops' },
  laptopSub: { all_day: 'Your page shows “Laptop friendly”', not_busy: 'Your page says “Laptops welcome, except at busy times”', none: 'Nothing about laptops shows on your page' },
  laptopNeed: 'Please tap one of the three.',
  stayQ: 'Staying a while', stayLead: 'People looking for a seat, a quiet corner or a place to work check this.',
  seatsQ: 'Seats inside?', seats: { takeout: 'Takeout only', few: 'A few seats', lots: 'Lots of seats' }, laptopsQ: 'Laptops?',
  stayExtras: 'Also true?', outlets: 'Power outlets for guests', quiet: 'A quiet spot', stayNeed: 'Please tap an answer for seats or laptops, or tap Skip.',
  orderQ: 'How can people order?', orderLead: 'Tap all that apply.', orderOnline: 'Order online', orderUrlLabel: 'Your online ordering link',
  orderUrlEx: 'yourcafe.com/order, or your Square or DoorDash page', preorder: 'Custom cakes and pre-orders',
  preorderHowLabel: 'How do people pre-order? (optional)', preorderHowEx: 'Call us 48 hours ahead', preorderUrlLabel: 'Pre-order link (optional)',
  linkHint: 'We check a new link first, usually within a day. Everything else is on your page right away.',
  counterOnly: 'Order at the counter only', counterOnlySub: 'No online ordering or pre-orders', counterOnlySubNoCakes: 'No online ordering', orderNeed: 'Please tap at least one, or tap “Order at the counter only”.',
  orderUrlNeed: 'Please type your ordering link, or untick “Order online”.', badLink: 'Please check the link, for example yourcafe.com/order.',
  dietQ: 'Dietary details', dietLead: 'Visitors with allergies or diets check this before they come.',
  milksQ: 'Dairy-free milks?', milkExtraQ: 'Do they cost extra?', milkExtra: { no: 'No extra charge', yes: 'Yes, extra' },
  gfQ: 'Gluten-free baking?', gf: { dedicated: 'Yes, from a gluten-free kitchen', shared: 'Yes, made in a shared kitchen' },
  dietMore: 'Also true?', veganBaking: 'Vegan baking', nutFree: 'Nut-free options', dietNeed: 'Please tap at least one, or tap Skip.',
  coffeeQ: 'Your coffee', coffeeLead: 'Coffee lovers like to know where the beans come from.', roastOwn: 'We roast our own beans',
  sourceLabel: 'Our beans come from… (optional)', sourceEx: 'A local roaster’s name', beansForSale: 'Beans for sale', coffeeNeed: 'Please tap an answer or type where your beans come from, or tap Skip.',
  selloutQ: 'Anything that sells out early?', selloutLead: 'It shows as a tip on your page, so people come in time.', selloutLabel: 'What sells out, and when',
  selloutEx: 'Cinnamon buns usually gone by 11', selloutNo: 'Nothing sells out',
  noLabels: { sellout: 'nothing sells out', order: 'order at the counter only' },
  specialsQ: 'Any daily specials?', specialsLead: 'Like a loyalty card, or $1 off any drink before 9 AM.',
  musicQ: 'Anything on at your café?', musicLead: 'Like open mic, live music, art on the walls or a workshop.',
  knownEx: 'Cinnamon buns and the window seats', igLead: 'Type your Instagram name, like @yourcafe.',
  groupsLead: 'Book clubs, meetings, a birthday coffee.', storyEx: 'A small bakery café by the lake. Everything is baked here each morning, and the window seats catch the sun.',
  happyQ: 'Do you have a happy hour?', styleDone: 'Done', aPersonCafe: 'about ${n} for {words}', noWifi: 'No Wi-Fi', noWifiSub: 'We don’t have Wi-Fi for guests',
};
fr.cafe = {
  hiLead: 'Préparons la page de votre café, une question à la fois. Environ 15 à 30 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  labels: { cuisine: 'Genre de café et ce que vous servez', spend: 'Prix par personne', stay: 'Rester un moment', order: 'Commander', diet: 'Détails alimentaires', coffee: 'Votre café', sellout: 'Épuisé tôt?' },
  photosLead: 'Votre comptoir, votre café, vos pâtisseries. Trois photos, c’est parfait.',
  kindQ: 'Quel genre de café est-ce?', kindLead: 'Choisissez celui qui convient le mieux. Chocolatiers et beigneries : choisissez « Desserts et sucreries ».',
  kindGuess: 'Nous avons choisi « {kind} » d’après votre nom. Touchez-en un autre s’il ne convient pas. Rien n’est enregistré avant que vous touchiez Suivant.',
  kindNeed: 'Touchez celui qui convient le mieux.', kindNext: 'Suivant : ce que vous servez',
  serveQ: 'Que servez-vous?', serveLead: 'Touchez tout ce qui s’applique.', serveNeed: 'Touchez au moins une réponse, ou touchez Passer.', saveServe: 'Enregistrer',
  styleMore: 'Ajouter un style de cuisine (facultatif)', styleLead: 'Par exemple française ou ukrainienne. Choisissez-en jusqu’à 3.', styleNone: 'Aucun style de cuisine choisi. C’est correct.',
  savedCuisine: 'Votre genre de café et ce que vous servez sont sur votre page maintenant.',
  spendQ: 'Combien coûte environ {words}?', spendLead: 'Avant taxes et pourboire. Votre page indiquera « Environ {n} $ pour {words} ».',
  laptopQ: 'Quand les ordinateurs portables sont-ils bienvenus?', laptopLead: 'Les gens qui veulent travailler un moment cherchent cette information. Choisissez ce qui convient à votre café.',
  laptops: { all_day: 'Toute la journée', not_busy: 'Pas aux heures de pointe', none: 'Pas d’ordinateurs portables' },
  laptopSub: { all_day: 'Votre page affiche « Ordinateurs portables bienvenus »', not_busy: 'Votre page indique « Ordinateurs portables bienvenus, sauf aux heures de pointe »', none: 'Rien sur les ordinateurs portables ne s’affiche sur votre page' },
  laptopNeed: 'Touchez l’une des trois réponses.',
  stayQ: 'Rester un moment', stayLead: 'Les gens qui cherchent une place, un coin tranquille ou un endroit pour travailler vérifient ceci.',
  seatsQ: 'Des places à l’intérieur?', seats: { takeout: 'Pour emporter seulement', few: 'Quelques places', lots: 'Beaucoup de places' }, laptopsQ: 'Ordinateurs portables?',
  stayExtras: 'Aussi vrai?', outlets: 'Prises électriques pour les clients', quiet: 'Un coin tranquille', stayNeed: 'Touchez une réponse pour les places ou les ordinateurs, ou touchez Passer.',
  orderQ: 'Comment les gens peuvent-ils commander?', orderLead: 'Touchez tout ce qui s’applique.', orderOnline: 'Commande en ligne', orderUrlLabel: 'Votre lien de commande en ligne',
  orderUrlEx: 'votrecafe.com/commande, ou votre page Square ou DoorDash', preorder: 'Gâteaux sur commande et précommandes',
  preorderHowLabel: 'Comment précommander? (facultatif)', preorderHowEx: 'Appelez-nous 48 heures à l’avance', preorderUrlLabel: 'Lien de précommande (facultatif)',
  linkHint: 'Nous vérifions d’abord un nouveau lien, en général d’ici un jour. Tout le reste est sur votre page tout de suite.',
  counterOnly: 'Commande au comptoir seulement', counterOnlySub: 'Ni commande en ligne, ni précommandes', counterOnlySubNoCakes: 'Pas de commande en ligne', orderNeed: 'Touchez au moins une réponse, ou touchez « Commande au comptoir seulement ».',
  orderUrlNeed: 'Écrivez votre lien de commande, ou décochez « Commande en ligne ».', badLink: 'Vérifiez le lien, par exemple votrecafe.com/commande.',
  dietQ: 'Détails alimentaires', dietLead: 'Les visiteurs qui ont des allergies ou un régime vérifient ceci avant de venir.',
  milksQ: 'Laits sans produits laitiers?', milkExtraQ: 'Coûtent-ils plus cher?', milkExtra: { no: 'Sans frais', yes: 'Oui, en supplément' },
  gfQ: 'Options sans gluten?', gf: { dedicated: 'Oui, d’une cuisine sans gluten', shared: 'Oui, faites dans une cuisine partagée' },
  dietMore: 'Aussi vrai?', veganBaking: 'Pâtisseries véganes', nutFree: 'Options sans noix', dietNeed: 'Touchez au moins une réponse, ou touchez Passer.',
  coffeeQ: 'Votre café', coffeeLead: 'Les amateurs de café aiment savoir d’où viennent les grains.', roastOwn: 'Nous torréfions nos propres grains',
  sourceLabel: 'Nos grains viennent de… (facultatif)', sourceEx: 'Le nom d’un torréfacteur local', beansForSale: 'Grains en vente', coffeeNeed: 'Touchez une réponse ou écrivez d’où viennent vos grains, ou touchez Passer.',
  selloutQ: 'Quelque chose s’épuise tôt?', selloutLead: 'Cela s’affiche comme un conseil sur votre page, pour que les gens arrivent à temps.', selloutLabel: 'Ce qui s’épuise, et quand',
  selloutEx: 'Les brioches à la cannelle partent souvent avant 11 h', selloutNo: 'Rien ne s’épuise',
  noLabels: { sellout: 'rien ne s’épuise', order: 'commande au comptoir seulement' },
  specialsQ: 'Des spéciaux du jour?', specialsLead: 'Comme une carte de fidélité, ou 1 $ de rabais sur toute boisson avant 9 h.',
  musicQ: 'Il se passe quelque chose à votre café?', musicLead: 'Comme une scène ouverte, de la musique en direct, de l’art aux murs ou un atelier.',
  knownEx: 'Les brioches à la cannelle et les places près de la fenêtre', igLead: 'Écrivez votre nom Instagram, comme @votrecafe.',
  groupsLead: 'Clubs de lecture, réunions, un café d’anniversaire.', storyEx: 'Un petit café-boulangerie au bord du lac. Tout est cuit ici chaque matin, et les places près de la fenêtre ont le soleil.',
  happyQ: 'Avez-vous un happy hour?', styleDone: 'Terminé', aPersonCafe: 'environ {n} $ pour {words}', noWifi: 'Pas de Wi-Fi', noWifiSub: 'Nous n’avons pas de Wi-Fi pour les clients',
};

// First café test (Dayton, 2026-11-11; drafts/fresh-eyes-cafe1-2026-11-11/REPORT.md). Shared words first, then café words.
// One set of success words (item 11): "It's on your page now" for what goes live, "We'll add it within a day" for what we
// check first. While prices aren't public (AVG_SPEND_PUBLIC off) the price question promises nothing (item 4).
Object.assign(en, {
  savedDay: 'We’ll add it within a day.', photosSent: '✓ {n} photos sent. We’ll add them within a day.',
  // Café test 3 (2026-11-11): plainer.
  sentMeans: 'We check it first, then add it to your page within a day.',
  savedFbName: 'We’ll find your Facebook link and add it within a day.', savedIgName: 'We’ll add your Instagram link within a day.',
  savedMenuSocialName: 'We’ll find your menu on that page and add it within a day.',
  phoneRestSite: 'We’ll add your website within a day, after we check it.', phoneRestAddr: 'We’ll add your new address within a day, after we check it.',
  phoneRestBoth: 'We’ll add your new address and website within a day, after we check them.',
  savedSpendOff: 'Thanks, it’s saved. Prices don’t show on pages yet. Your price will show when they do.', stSoon: 'saved (prices aren’t on pages yet)',
  helpSpend: 'Prices aren’t shown on pages yet. We’ll use yours when they are.',
  snapSub: 'Snap your menu (a board or each page)',
  closeYearly: 'Every year', closeYearlySub: 'Ticked: we also mark the same dates next year, like the holidays.', closeEnds: 'Closed {a} to {b}', addedYearly: '{x} (this year and next)',
});
en.st = Object.assign({}, en.st, { day: 'we’ll add it within a day' });
en.spendLeadOff = en.spendLead;
Object.assign(fr, {
  savedDay: 'Nous l’ajouterons d’ici un jour.', photosSent: '✓ {n} photos envoyées. Nous les ajouterons d’ici un jour.',
  sentMeans: 'Nous vérifions d’abord, puis nous l’ajoutons à votre page d’ici un jour.',
  savedFbName: 'Nous trouverons le lien de votre page Facebook et l’ajouterons d’ici un jour.', savedIgName: 'Nous ajouterons votre lien Instagram d’ici un jour.',
  savedMenuSocialName: 'Nous trouverons votre menu sur cette page et l’ajouterons d’ici un jour.',
  phoneRestSite: 'Nous ajouterons votre site Web d’ici un jour, après vérification.', phoneRestAddr: 'Nous ajouterons votre nouvelle adresse d’ici un jour, après vérification.',
  phoneRestBoth: 'Nous ajouterons votre nouvelle adresse et votre site Web d’ici un jour, après vérification.',
  savedSpendOff: 'Merci, c’est enregistré. Les prix ne s’affichent pas encore sur les pages. Votre prix s’affichera à ce moment-là.', stSoon: 'enregistré (les prix ne sont pas encore sur les pages)',
  helpSpend: 'Les prix ne sont pas encore affichés sur les pages. Nous utiliserons le vôtre quand ils le seront.',
  snapSub: 'Un tableau ou chaque page',
  closeYearly: 'Chaque année', closeYearlySub: 'Si coché, nous indiquons aussi les mêmes dates l’an prochain, comme pour les jours fériés.', closeEnds: 'Fermé du {a} au {b}', addedYearly: '{x} (cette année et l’an prochain)',
});
fr.st = Object.assign({}, fr.st, { day: 'nous l’ajouterons d’ici un jour' });
// Winery test 3 (2026-11-12): « Photos · nous les ajouterons d’ici un jour » (plural).
en.stDayPlural = 'we’ll add them within a day'; fr.stDayPlural = 'nous les ajouterons d’ici un jour';
fr.spendLeadOff = fr.spendLead;
Object.assign(en.cafe, {
  // Café test 3 (2026-11-11): the step is named for what it asks ("Price of one drink"), and no "for one person" beside it.
  spendLabel: 'Price of {words}', spendLeadOff: 'Before tax and tip.',
  // Café test 3 (2026-11-11): café examples, not restaurant ones (soup, brunch).
  specialEx: 'Buy 9, get the 10th free', priceEx: '$1 off', specialsTypeQ: 'Your specials',
  specialTimeEx: '7 AM to 9 AM for an early-morning deal. Leave it empty if it’s on all day.',
  laptopSub: Object.assign({}, en.cafe.laptopSub, { none: 'Your page says “No laptops: a place to talk”' }),
  noWifiSub: 'Your page says “No Wi-Fi: a place to talk”',
  dietNoteLabel: 'Anything to add? (optional)', dietNoteEx: 'Oat & almond milk +50¢ · Gluten-free: macarons only',
});
Object.assign(fr.cafe, {
  spendLabel: 'Prix : {words}', spendLeadOff: 'Avant taxes et pourboire.',
  specialEx: 'Achetez-en 9, le 10e est gratuit', priceEx: '1 $ de rabais', specialsTypeQ: 'Vos spéciaux',
  specialTimeEx: 'de 7 h à 9 h pour un spécial du matin. Laissez vide si c’est offert toute la journée.',
  laptopSub: Object.assign({}, fr.cafe.laptopSub, { none: 'Votre page indique « Pas d’ordinateurs portables : un endroit pour discuter »' }),
  noWifiSub: 'Votre page indique « Pas de Wi-Fi : un endroit pour discuter »',
  dietNoteLabel: 'Autre chose à ajouter? (facultatif)', dietNoteEx: 'Lait d’avoine et d’amande +50 ¢ · Sans gluten : macarons seulement',
});

// Second first-time café test (Dayton, 2026-11-11; drafts/fresh-eyes-cafe2-2026-11-11/REPORT.md). Shared words first.
// "We're closed part of the year" in the Hours step (every type), month + day pickers that repeat every year, and one
// yearly rule for "Every year" closures.
Object.assign(en, {
  allYearClosed: 'We’re closed part of the year', allYearClosedSub: 'Like open spring to fall. You pick the dates.',
  openQ: 'When are you open each year?', openLead: 'Outside these dates your page says “Closed for the season”, and when you reopen.',
  openFrom: 'Open from', openTo: 'Open until (your last day)', repeatsYearly: 'These dates repeat every year. No need to pick a year.',
  openSame: 'Save: same hours all season', openSameSub: 'The hours you just set', openSummer: 'Save, and add different summer hours', openSummerSub: 'Like longer hours in July and August',
  openSaveOnly: 'Save these dates', openMonthsLink: 'Closed for whole months? Tap the months instead',
  openNeed: 'Please pick the first and last day you’re open.', openSameDay: 'The first and last day are the same. Please check them.',
  openNow: 'Open {a} to {b} every year', openChange: 'Change', partYearBtn: '+ We’re closed part of the year (pick your open dates)',
  mdMonth: 'Month', mdDay: 'Day',
  everyYearRow: 'Every year: {a} – {b}', yearlyTooLong: 'A yearly closure must be shorter than a year. Please pick a shorter closure.',
  closeYearlySub: 'Ticked: saved once as a yearly closure, the same dates every year.', addedYearly: '{x} (every year)',
});
Object.assign(fr, {
  allYearClosed: 'Nous fermons une partie de l’année', allYearClosedSub: 'Par exemple ouvert du printemps à l’automne. Vous choisissez les dates.',
  openQ: 'Quand êtes-vous ouverts chaque année?', openLead: 'En dehors de ces dates, votre page indique « Fermé pour la saison » et la date de réouverture.',
  openFrom: 'Ouvert à partir du', openTo: 'Ouvert jusqu’au (votre dernier jour)', repeatsYearly: 'Ces dates reviennent chaque année. Pas besoin de choisir l’année.',
  openSame: 'Enregistrer : mêmes heures toute la saison', openSameSub: 'Les heures que vous venez d’indiquer', openSummer: 'Enregistrer et ajouter des heures d’été différentes', openSummerSub: 'Comme des heures plus longues en juillet et août',
  openSaveOnly: 'Enregistrer ces dates', openMonthsLink: 'Fermé des mois entiers? Touchez plutôt les mois',
  openNeed: 'Choisissez le premier et le dernier jour d’ouverture.', openSameDay: 'Le premier et le dernier jour sont les mêmes. Vérifiez-les.',
  openNow: 'Ouvert du {a} au {b} chaque année', openChange: 'Modifier', partYearBtn: '+ Nous fermons une partie de l’année (choisissez vos dates d’ouverture)',
  mdMonth: 'Mois', mdDay: 'Jour',
  everyYearRow: 'Chaque année : du {a} au {b}', yearlyTooLong: 'Une fermeture annuelle doit durer moins d’un an. Choisissez une fermeture plus courte.',
  closeYearlySub: 'Si coché, ces dates reviennent chaque année.', addedYearly: '{x} (chaque année)',
});

// Café words by kind (café test 2, 2026-11-11): the photos prompt and the story example for each of the 11 kinds in
// SPEC-cafes.md, gelato's own dietary questions, "No seats inside" and "No washroom" on "What you offer".
Object.assign(en.cafe, {
  // Café test 3 (2026-11-11): cafeKinds, not kinds (that name replaced the weekly-event kinds, so their buttons were blank).
  cafeKinds: {
    'Coffee shop': { photos: 'Your counter, your coffee, your seats. Three photos is perfect.', story: 'A small coffee shop on the main street. Beans from a local roaster, and the window seats catch the morning sun.' },
    Bakery: { photos: 'Your shop front, your bread and pastries, your counter. Three photos is perfect.', story: 'A family bakery on Main Street. The bread comes out of the oven at 7, and the croissants sell out by noon.' },
    'Bakery café': { photos: 'Your counter, your coffee, your baking. Three photos is perfect.', story: 'A small bakery café by the lake. Everything is baked here each morning, and the window seats catch the sun.' },
    Roastery: { photos: 'Your roaster, your coffee bar, a cup being poured. Three photos is perfect.', story: 'We roast our beans right here in small batches. Come in for a pour-over, and take a bag home.' },
    'Tea house': { photos: 'Your tea room, your teapots and cups, your tea wall. Three photos is perfect.', story: 'A quiet tea room with over 40 loose-leaf teas. Sit by the window with a pot, or take a tin home.' },
    'Bubble tea': { photos: 'Your shop front, a few drinks, your menu board. Three photos is perfect.', story: 'Bubble tea made to order, with fresh tapioca pearls through the day. Try the brown sugar milk tea.' },
    'Ice cream & gelato': { photos: 'Your shop front, your gelato case, a cone. Three photos is perfect.', story: 'Gelato made here every morning, with 24 flavours in the case and dairy-free sorbets too. Right on the lake walk.' },
    'Dessert & sweets': { photos: 'Your shop front, your display case, a favourite treat. Three photos is perfect.', story: 'Cakes, macarons and chocolates, made here by hand. Order a custom cake, or pick a box of treats to take home.' },
    'Brunch café': { photos: 'Your room, a brunch plate, your coffee. Three photos is perfect.', story: 'Brunch all day: eggs Benedict, big pancakes and good coffee. Grab a patio table on a sunny morning.' },
    'Juice & smoothie bar': { photos: 'Your counter, a few drinks, your fruit. Three photos is perfect.', story: 'Fresh juices and smoothies made to order, plus acai bowls. Grab one on your way to the beach.' },
    'Deli & sandwiches': { photos: 'Your counter, a sandwich, your deli case. Three photos is perfect.', story: 'Sandwiches made to order on bread from down the street, and soup every day. Call ahead and it’s ready.' },
  },
  servePre: 'We ticked “{x}” for your kind of café. Untick it if it’s not right.',
  iceDfQ: 'Dairy-free or vegan?', dfSorbet: 'Dairy-free sorbet', veganIce: 'Vegan gelato or ice cream',
  gfConesQ: 'Gluten-free?', gfCones: { cups: 'Gluten-free in a cup (our cones have gluten)', cones: 'Gluten-free cones too' },
  nutFreeIce: 'Nut-free flavours', dietNoteExIce: 'Sorbets are vegan · Ask for a clean scoop',
  noWifiSubTakeout: 'Your page says “No Wi-Fi”',
  noWashroom: 'No customer washroom', noWashroomSub: 'Only for our records. It isn’t shown on your page.',
  takeoutOnly: 'No seats inside (takeout only)', takeoutOnlySub: 'Your page says “Takeout only”',
});
Object.assign(fr.cafe, {
  // Café test 3 (2026-11-11): cafeKinds, not kinds (that name replaced the weekly-event kinds, so their buttons were blank).
  cafeKinds: {
    'Coffee shop': { photos: 'Votre comptoir, votre café, vos places assises. Trois photos, c’est parfait.', story: 'Un petit café sur la rue principale. Des grains d’un torréfacteur local, et les places près de la fenêtre ont le soleil du matin.' },
    Bakery: { photos: 'Votre devanture, vos pains et pâtisseries, votre comptoir. Trois photos, c’est parfait.', story: 'Une boulangerie familiale sur la rue Main. Le pain sort du four à 7 h, et les croissants sont épuisés avant midi.' },
    'Bakery café': { photos: 'Votre comptoir, votre café, vos pâtisseries. Trois photos, c’est parfait.', story: 'Un petit café-boulangerie au bord du lac. Tout est cuit ici chaque matin, et les places près de la fenêtre ont le soleil.' },
    Roastery: { photos: 'Votre torréfacteur, votre bar à café, une tasse qu’on verse. Trois photos, c’est parfait.', story: 'Nous torréfions nos grains ici, en petits lots. Venez prendre un café filtre, et repartez avec un sac.' },
    'Tea house': { photos: 'Votre salon de thé, vos théières et tasses, votre mur de thés. Trois photos, c’est parfait.', story: 'Un salon de thé tranquille avec plus de 40 thés en vrac. Asseyez-vous près de la fenêtre avec une théière, ou rapportez une boîte.' },
    'Bubble tea': { photos: 'Votre devanture, quelques boissons, votre menu. Trois photos, c’est parfait.', story: 'Du thé aux perles fait sur commande, avec des perles de tapioca fraîches toute la journée. Essayez le thé au lait à la cassonade.' },
    'Ice cream & gelato': { photos: 'Votre devanture, votre comptoir à gelato, un cornet. Trois photos, c’est parfait.', story: 'Du gelato fait ici chaque matin, 24 saveurs au comptoir et des sorbets sans produits laitiers. Juste sur la promenade du lac.' },
    'Dessert & sweets': { photos: 'Votre devanture, votre vitrine, une gâterie préférée. Trois photos, c’est parfait.', story: 'Gâteaux, macarons et chocolats faits ici à la main. Commandez un gâteau, ou choisissez une boîte de gâteries à emporter.' },
    'Brunch café': { photos: 'Votre salle, une assiette de brunch, votre café. Trois photos, c’est parfait.', story: 'Brunch toute la journée : œufs bénédictine, grosses crêpes et bon café. Prenez une table sur la terrasse un matin ensoleillé.' },
    'Juice & smoothie bar': { photos: 'Votre comptoir, quelques boissons, vos fruits. Trois photos, c’est parfait.', story: 'Jus et smoothies frais faits sur commande, et des bols açaï. Prenez-en un en allant à la plage.' },
    'Deli & sandwiches': { photos: 'Votre comptoir, un sandwich, votre comptoir de charcuterie. Trois photos, c’est parfait.', story: 'Des sandwichs faits sur commande avec le pain de la boulangerie voisine, et une soupe chaque jour. Appelez d’avance et c’est prêt.' },
  },
  servePre: 'Nous avons coché « {x} » pour votre genre de café. Décochez-le s’il ne convient pas.',
  iceDfQ: 'Sans produits laitiers ou végane?', dfSorbet: 'Sorbet sans produits laitiers', veganIce: 'Gelato ou crème glacée véganes',
  gfConesQ: 'Sans gluten?', gfCones: { cups: 'Sans gluten dans une coupe (nos cornets contiennent du gluten)', cones: 'Cornets sans gluten aussi' },
  nutFreeIce: 'Saveurs sans noix', dietNoteExIce: 'Les sorbets sont véganes · Demandez une cuillère propre',
  noWifiSubTakeout: 'Votre page indique « Pas de Wi-Fi »',
  noWashroom: 'Pas de toilettes pour les clients', noWashroomSub: 'Seulement pour nos dossiers. Ce n’est pas affiché sur votre page.',
  takeoutOnly: 'Pas de places à l’intérieur (pour emporter seulement)', takeoutOnlySub: 'Votre page indique « Pour emporter seulement »',
});

// "Our menu changes daily" (café test 2, 2026-11-11), neutral menu examples and the Instagram name from the menu answer.
Object.assign(en, {
  menuSocialEx: '@yourname, or the link to your page or post',
  menuDaily: 'Our menu changes daily', menuDailyIce: 'Our flavours change daily', menuDailySub: 'See Instagram, Facebook or the board in the shop',
  menuDailyQ: 'Where do people see today’s menu?', menuDailyQIce: 'Where do people see today’s flavours?', menuDailyLead: 'Tap one. Your page says so, and it counts as your menu.',
  menuDailyWhere: { instagram: 'On our Instagram', facebook: 'On our Facebook page', board: 'On the board in the shop' },
  menuDailyLine: 'Our menu changes daily: ', menuDailyLineIce: 'Flavours change daily: ', menuDailySee: { instagram: 'see Instagram', facebook: 'see Facebook', board: 'see the board in the shop' },
  menuDailyShows: 'Your page will say “{x}”.', savedMenuDaily: 'It’s on your page now: “{x}”.',
  igFromMenu: 'From your menu answer: {x}. Tap Save if it’s right.',
});
Object.assign(fr, {
  menuSocialEx: '@votrenom, ou le lien de votre page ou publication',
  menuDaily: 'Notre menu change chaque jour', menuDailyIce: 'Nos saveurs changent chaque jour', menuDailySub: 'Voir Instagram, Facebook ou le tableau en boutique',
  menuDailyQ: 'Où les gens voient-ils le menu du jour?', menuDailyQIce: 'Où les gens voient-ils les saveurs du jour?', menuDailyLead: 'Touchez-en un. Votre page l’indique, et cela compte comme votre menu.',
  menuDailyWhere: { instagram: 'Sur notre Instagram', facebook: 'Sur notre page Facebook', board: 'Sur le tableau en boutique' },
  menuDailyLine: 'Le menu change chaque jour : ', menuDailyLineIce: 'Les saveurs changent chaque jour : ', menuDailySee: { instagram: 'voir Instagram', facebook: 'voir Facebook', board: 'voir le tableau en boutique' },
  menuDailyShows: 'Votre page indiquera « {x} ».', savedMenuDaily: 'C’est sur votre page maintenant : « {x} ».',
  igFromMenu: 'D’après votre réponse sur le menu : {x}. Touchez Enregistrer si c’est bien ça.',
});

// Cents on the café price (café test 2, 2026-11-11).
Object.assign(en, { centsLabel: 'Cents', centsLess: '25 cents less', centsMore: '25 cents more', centsDown: '−25¢', centsUp: '+25¢' });
Object.assign(fr, { centsLabel: 'Cents', centsLess: '25 cents de moins', centsMore: '25 cents de plus', centsDown: '−\u202f25\u00a0¢', centsUp: '+\u202f25\u00a0¢' });

// Fourth first-time café test (Dayton, 2026-11-11): café words that fit a takeout window or a café with no patio.
Object.assign(en.cafe, {
  quickDogsWindow: ['Dogs welcome at the window', 'Dog treats at the window'], quickDogsNoPatio: ['Dogs welcome inside', 'Water bowls at the door'],
  photosTakeout: 'Your window, your coffee, your sign. Three photos is perfect.',
  // One name for a café's specials (the tile said "Weekly specials", the question "Any daily specials?").
  specialsQ: 'Any specials?',
});
en.cafe.labels = Object.assign({}, en.cafe.labels, { specials: 'Specials' });
en.cafe.noLabels = Object.assign({}, en.cafe.noLabels, { specials: 'no specials' });
Object.assign(fr.cafe, {
  quickDogsWindow: ['Chiens bienvenus au comptoir', 'Gâteries pour chiens au comptoir'], quickDogsNoPatio: ['Chiens bienvenus à l’intérieur', 'Bols d’eau à l’entrée'],
  photosTakeout: 'Votre comptoir extérieur, votre café, votre enseigne. Trois photos, c’est parfait.',
  specialsQ: 'Des spéciaux?',
});
fr.cafe.labels = Object.assign({}, fr.cafe.labels, { specials: 'Spéciaux' });
fr.cafe.noLabels = Object.assign({}, fr.cafe.noLabels, { specials: 'pas de spéciaux' });

// Fourth first-time café test (Dayton, 2026-11-11; drafts/fresh-eyes-cafe4-2026-11-11/REPORT.md). Shared words.
Object.assign(en, {
  holCovered: 'Covered by your closed dates', holSeason: 'You’re closed for the season',
  // The Facebook link goes on the page as soon as it's saved ("It's on your page now"); only a page name waits for us.
  fbWhy: 'Paste the link and it shows on your page right away. Only know the name? Type it and we’ll find the link.',
  fbFromSite: 'That’s your Facebook page. We’ve added it as your Facebook link.', menuFbKnown: 'Your Facebook: {x}',
  sendBeforeLeave: 'Tap Send before you leave this screen.',
  // The price question while prices aren't on pages (AVG_SPEND_PUBLIC off): why we ask, and an after-save line that says
  // what it's for ("Prices don't show on pages yet" made it sound pointless).
  spendWhyOff: 'We’ll use this to show your price range once prices go on pages.',
  savedSpendOff: 'When prices go on pages, yours will show as your price range.',
});
Object.assign(fr, {
  holCovered: 'Compris dans vos dates de fermeture', holSeason: 'Vous êtes fermé pour la saison',
  fbWhy: 'Collez le lien et il s’affiche sur votre page tout de suite. Vous connaissez seulement le nom? Écrivez-le et nous trouverons le lien.',
  fbFromSite: 'C’est votre page Facebook. Nous l’avons ajoutée comme votre lien Facebook.', menuFbKnown: 'Votre Facebook : {x}',
  sendBeforeLeave: 'Touchez Envoyer avant de quitter cet écran.',
  spendWhyOff: 'Nous l’utiliserons pour afficher votre gamme de prix quand les prix seront sur les pages.',
  savedSpendOff: 'Quand les prix seront sur les pages, le vôtre s’affichera comme votre gamme de prix.',
});

// Café setup in 13 screens (Dayton, 2026-11-11: "seems like a lot of questions for a café"). Holidays and closures are the
// end of the Hours step, and Instagram and Facebook share one screen.
en.cafe.labels = Object.assign({}, en.cafe.labels, { hours: 'Hours and holidays', social: 'Instagram and Facebook' });
en.cafe.noLabels = Object.assign({}, en.cafe.noLabels, { social: 'not on Instagram or Facebook' });
Object.assign(en.cafe, {
  socialQ: 'Instagram and Facebook', socialLead: 'Fill in the ones you have. Your page links to them.',
  socialNeed: 'Please type your Instagram or Facebook, or tap an answer under each one.',
  hoursSavedNow: '✓ Your hours are saved.', hoursSentNow: '✓ Your hours are sent.',
});
fr.cafe.labels = Object.assign({}, fr.cafe.labels, { hours: 'Heures et jours fériés', social: 'Instagram et Facebook' });
fr.cafe.noLabels = Object.assign({}, fr.cafe.noLabels, { social: 'pas sur Instagram ni Facebook' });
Object.assign(fr.cafe, {
  socialQ: 'Instagram et Facebook', socialLead: 'Remplissez ceux que vous avez. Votre page y mène.',
  socialNeed: 'Écrivez votre Instagram ou votre Facebook, ou touchez une réponse sous chacun.',
  hoursSavedNow: '✓ Vos heures sont enregistrées.', hoursSentNow: '✓ Vos heures sont envoyées.',
});

// Fifth first-time café test (Dayton, 2026-11-12; drafts/fresh-eyes-cafe5-2026-11-12/REPORT.md). Shared words: no "Saved →
// Next" screens (the success line shows on the next question), "them" for more than one photo, a Sat–Sun copy button,
// a gentle photo-rights ask, and a price line that doesn't sound pointless.
Object.assign(en, {
  savedDayMany: 'We’ll add them within a day.', sentMeansMany: 'We check them first, then add them to your page within a day.',
  copyWeekend: 'Sat–Sun', rightsAsk: 'Tick this box, then tap Send.',
  photosBackAsk: 'Your photos aren’t sent yet. Tick the box and tap Send, or tap Back again to leave without them.',
  spendWhyOff: 'This helps visitors know what to expect. It will show on your page when we add prices.', savedSpendOff: 'It will show on your page when we add prices.',
});
Object.assign(fr, {
  savedDayMany: 'Nous les ajouterons d’ici un jour.', sentMeansMany: 'Nous les vérifions d’abord, puis nous les ajoutons à votre page d’ici un jour.',
  copyWeekend: 'Sam–dim', rightsAsk: 'Cochez cette case, puis touchez Envoyer.',
  photosBackAsk: 'Vos photos ne sont pas encore envoyées. Cochez la case et touchez Envoyer, ou touchez Retour de nouveau pour partir sans elles.',
  spendWhyOff: 'Cela aide les visiteurs à savoir à quoi s’attendre. Votre prix s’affichera sur votre page quand nous ajouterons les prix.', savedSpendOff: 'Votre prix s’affichera sur votre page quand nous ajouterons les prix.',
});

// Café test 6 (2026-11-12): the other season's hours, said on the "Are these still your hours?" screen.
Object.assign(en, { seasonHoursLine: '{kind} ({range}): {hours} ✓', everyDayHours: '{t} every day' });
Object.assign(en, { recapHours: 'Your hours', recapRest: 'Rest of the year', stSocialIgLive: 'Instagram on your page now, Facebook within a day', stSocialFbLive: 'Facebook on your page now, Instagram within a day' });
Object.assign(fr, { seasonHoursLine: '{kind} ({range})\u00a0: {hours} ✓', everyDayHours: '{t} tous les jours' });
Object.assign(fr, { recapHours: 'Vos heures', recapRest: 'Le reste de l’année', stSocialIgLive: 'Instagram sur votre page maintenant, Facebook d’ici un jour', stSocialFbLive: 'Facebook sur votre page maintenant, Instagram d’ici un jour' });

// Wineries (Dayton, 2026-11-12; drafts/winery-portal-2026-11-12/SPEC-wineries.md, "Decided"): winery words and the
// winery-only screens (Your winery, Tastings, Booking and groups, Experiences, the off-season by appointment), laid over
// the words above for a winery's setup (server.js renderOwnerSetupPage). Restaurants, pubs and cafés never see these.
// Like cafés, holidays end the Hours step and Instagram and Facebook are one screen (socialQ...).
en.winery = {
  hiLead: 'Let’s get your winery’s page ready, one question at a time. About 10 to 20 minutes. You can stop any time and carry on later.',
  timeLine: 'About 10 to 20 minutes. You can stop any time and carry on later.',
  labels: { hours: 'Hours and holidays', winery: 'Your winery', tastings: 'Tastings', visit: 'Booking and groups', photos: 'Photos', offer: 'What you offer',
    story: 'Your story and Known for', experiences: 'Experiences', menu: 'Tasting menu or wine list', social: 'Instagram and Facebook', door: 'Your tasting room door' },
  noLabels: { experiences: 'no extras', social: 'not on Instagram or Facebook' },
  stStoryKnown: 'Known for on your page, story within a day', stVisitLink: 'on your page, new booking link within a day',
  picnicFromFood: 'Picnic area is ticked from your “Food here” answer. Tap it if that’s wrong.',
  photosLead: 'Your tasting room, your view, the vines. Three photos is perfect.', photosNoMore: 'No, next: what you offer',
  // Your winery
  wkindQ: 'What kind of winery is it?', wkindLead: 'Pick the one visitors would use to describe you.', wkindNeed: 'Please tap the kind of winery that fits best.',
  wkindSubs: { 'Estate winery': 'Your own vineyard and tasting room', 'Boutique winery': 'Small and family run', 'Tasting room in town': 'A tasting room away from the vines',
    'Fruit or honey wines': 'Like fruit wines, mead or honey wine', 'Winery and cidery': 'Wine and cider made here' },
  foodQ: 'Food here?', foodLead: 'Pick the main one. Add the rest under Experiences.', foods: { none: 'None', snacks: 'Snacks or a cheese plate', picnic: 'Picnic area', restaurant: 'A restaurant or bistro' },
  ownPage: '{name} has its own page.', ownPageSub: 'Update its hours and menu there, with its own link. We won’t ask you for them twice.', ownPageLink: 'See its page: {name}',
  rnameLabel: 'Restaurant name', rnameEx: 'The Vineyard Bistro', rwhenLabel: 'When is it open? (optional)', rwhenEx: 'Thu–Mon from noon', rnameNeed: 'Please type your restaurant’s name, or tap another answer.',
  // Tastings
  feeQ: 'What does a tasting cost per person?', feeLead: 'It shows on your page and on your card right away.',
  feeGuess: 'Your card shows {x} now, from your website. Tap another price if it changed.', feeGuessVisit: 'Your website says {x}, so we picked it. Tap another price if it changed.', feeWaiting: 'You sent {x}. We’re checking it; it will show within a day.',
  feeFree: 'Free', feeOther: 'Other', feeLabel: 'Price in dollars', feeOver: 'A price over ${n} is checked first and shows within a day.',
  feeNeed: 'Please tap a price, or tap Other and type it, like 18.',
  waivedQ: 'Is it free if people buy wine?', waivedOpts: { yes: 'Yes, with a bottle', two: 'With 2 or more bottles', no: 'No' },
  feeSavedLive: 'Your tasting price is on your page and your card now.', feeSavedDay: 'We check prices over $75 first. It’ll show within a day.',
  feeCard: 'tastings {x} a person', feeCardFree: 'free tastings',
  // Booking and groups
  visitQ: 'How do people visit?', visitLead: 'Pick the one that fits most days.',
  visits: { walk_in: 'Walk-ins welcome', recommended: 'Booking recommended', needed: 'Booking needed', appointment: 'By appointment only' },
  visitSubs: { appointment: 'Your card says “By appointment · call ahead”' },
  bookLinkLabelWalkIn: 'Booking link (optional, e.g. for groups)',
  bookLinkEx: 'your website’s booking page', noBookLink: 'We don’t take bookings online', bookLinkBad: 'Please check the booking link, for example yourwinery.com/book.',
  groupsSizeQ: 'Groups: from what size should they book ahead?', groupsSizeLead: 'For example: “Groups of 8 or more, please book ahead”.',
  busesQ: 'Tour buses and limos?', busesLead: 'One answer for both. Take only one of them? Tap “Book ahead” so they contact you first.', buses: { welcome: 'Welcome', book: 'Book ahead', no: 'Not at this time' },
  visitNeed: 'Please tap how people visit, or tap Skip.', visitSavedLink: 'Your answers are on your page now. We check a new booking link first, usually within a day.',
  // Off-season by appointment (Hours)
  allYearAppt: 'In the off-season we’re open by appointment', allYearApptSub: 'Walk-in tastings part of the year, by appointment the rest',
  apptQ: 'When are you open for walk-in tastings?', apptLead: 'Outside these dates your card says “By appointment · call ahead”.',
  apptFrom: 'Walk-ins from', apptTo: 'Walk-ins until', apptSave: 'Save my hours', apptNeed: 'Please pick the first and last day of walk-in tastings.',
  apptNow: 'Walk-ins {a} – {b}, by appointment the rest of the year ✓',
  // Winery test 4 (2026-11-12): the one "no set hours" choice (Hours step), and what the page says after it.
  needOpenDayAppt: 'Please set at least one day you’re open. No set hours? Tap “We don’t have set hours” below.',
  noSetHours: 'We don’t have set hours. Visits are by appointment', noSetHoursNow: 'No set hours. Visits are by appointment ✓',
  noSetHoursSaved: 'Your old weekly hours are off your page. It says “By appointment · call ahead”.',
  apptHoursGone: 'By appointment only: your old weekly hours came off your page, so it only says “By appointment · call ahead”.',
  // Your story and Known for
  storyQ: 'Tell visitors about your winery', storyEx: 'A family winery on the Naramata Bench. We grow Pinot Noir and Chardonnay, and the patio looks over the lake.',
  knownQ: 'What are you known for?', knownLead: 'One line is perfect. It shows at the top of “Plan your visit”.', knownEx: 'Pinot Noir and Chardonnay from estate vines',
  storyKnownSaved: 'Your Known for line is on your page now. Your story will show within a day.',
  // Experiences
  expQ: 'Any experiences to book?', expLead: 'Up to two, like wine and cheese or a vineyard tour. They show in “Plan your visit”.',
  expN: 'Experience {n}', expNameLabel: 'Name', expTextLabel: 'Details (optional)', expQuick: ['Wine & cheese', 'Vineyard tour', 'Picnic baskets', 'Private tasting'],
  expEx1: '$45 a person, daily at 1 PM. Book ahead.', expEx2: 'A walk through the vines with the winemaker, about 1 hour.',
  expNone: 'We don’t offer extras', expNeed: 'Please type an experience, or tap “We don’t offer extras”.', expNameNeed: 'Please give each experience a name, like Wine & cheese.',
  // Tasting menu or wine list
  menuQ: 'How should we add your tasting menu or wine list?', menuLead: 'Pick the easiest one for you. It’s optional.', menuSentQ: 'Your wine list is sent ✓', menuNewer: 'Want to send a newer one?',
  upload: 'Upload my wine list (a file or photos)', snap: 'Take photos of my tasting menu', snapSub: 'Snap each page', web: 'My wine list is on my website',
  menuSocial: 'My wine list is on Facebook or Instagram', emailQ: 'Email your wine list to us', emailLead: 'Send a photo or a file of your tasting menu or wine list. Put “{name}” in the subject.',
  mailSubject: 'Wine list for {name}', menuSentEmail: '✓ You said you’ll email your wine list.', menuNote: 'Sent from the easy setup. Please add our tasting menu or wine list to our page.',
  // Instagram and Facebook on one screen, and the hours line on the holidays screen (as for cafés)
  // Winery test 1 (2026-11-12): the website screen of "Tasting menu or wine list" says wine list, not menu.
  webQ: 'Is this where your wine list is?', webLead: 'We filled in your website’s address. If your wine list has its own page, type its name after the last /, like /wines.',
  webLabel: 'Wine list web address', webEmpty: 'Please type the address of your wine list, like www.yourwinery.com/wines.',
  webQEmpty: 'Where is your wine list online?', webLeadEmpty: 'Type the address of the page your wine list is on.',
  socialQ: 'Instagram and Facebook', socialLead: 'Fill in the ones you have. Your page links to them.',
  socialNeed: 'Please type your Instagram or Facebook, or tap an answer under each one.',
  hoursSavedNow: '✓ Your hours are saved.', hoursSentNow: '✓ Your hours are sent.',
  // Your tasting room door
  doorQ: 'Help people find your tasting room', doorLead: 'On a big estate the map pin can land in the vines. One photo, taken at the tasting room door, walks visitors right to it.',
  mapFailQ: 'Send your tasting room door photo',
  doorPhotoQ: 'Take a photo of your tasting room door', doorPhotoLead: 'Stand outside so the door and your sign are in the picture. Your device will ask to share your location, so visitors get directions to this spot.',
  igLead: 'Type your Instagram name, like @yourwinery.',
  // Winery test 3 (2026-11-12): the upload, photo and Facebook screens of "Tasting menu or wine list" say wine list too.
  menuSent: '✓ Your wine list is sent.', upQ: 'Upload your wine list', upQSome: 'Your wine list', upLead: 'Pick the file your wine list is in. A file or photos both work.',
  upPick: 'Choose my wine list file', sendMenu: 'Send my wine list', camLead: 'Hold your device over the wine list so the whole page fits.', page: 'Wine list page {n}',
  menuSocialQ: 'Where is your wine list?', menuSocialLead: 'Paste the link to your Facebook or Instagram page or post with the wine list. Or type the page name and we’ll find it.',
  menuSocialNote: 'Our wine list is on our Facebook or Instagram page: “{name}”. Please find it and add it as our menu link.',
  savedMenuSocialName: 'We’ll find your wine list on that page and add it within a day.', igFromMenu: 'From your wine list answer: {x}. Tap Save if it’s right.',
};
fr.winery = {
  hiLead: 'Préparons la page de votre vignoble, une question à la fois. Environ 10 à 20 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  timeLine: 'Environ 10 à 20 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  labels: { hours: 'Heures et jours fériés', winery: 'Votre vignoble', tastings: 'Dégustations', visit: 'Réservations et groupes', photos: 'Photos', offer: 'Ce que vous offrez',
    story: 'Votre histoire et ce pour quoi vous êtes connus', experiences: 'Expériences', menu: 'Menu de dégustation ou carte des vins', social: 'Instagram et Facebook', door: 'La porte de votre salle de dégustation' },
  noLabels: { experiences: 'pas d’extras', social: 'pas sur Instagram ni Facebook' },
  stStoryKnown: 'Votre spécialité est en ligne; votre histoire le sera d’ici un jour', stVisitLink: 'sur votre page, nouveau lien de réservation d’ici un jour',
  picnicFromFood: 'Aire de pique-nique est cochée d’après votre réponse « Nourriture sur place ». Touchez-la si c’est faux.',
  photosLead: 'Votre salle de dégustation, votre vue, vos vignes ou vos vergers. Trois photos, c’est parfait.', photosNoMore: 'Non, suivant : ce que vous offrez',
  wkindQ: 'Quel genre de vignoble est-ce?', wkindLead: 'Choisissez celui que les visiteurs utiliseraient pour vous décrire.', wkindNeed: 'Touchez le genre de vignoble qui convient le mieux.',
  wkindSubs: { 'Estate winery': 'Votre propre vignoble et votre salle de dégustation', 'Boutique winery': 'Une petite équipe, souvent la famille', 'Tasting room in town': 'Une salle de dégustation loin des vignes',
    'Fruit or honey wines': 'Comme des vins de fruits, de l’hydromel ou du vin de miel', 'Winery and cidery': 'Vin et cidre faits sur place' },
  foodQ: 'Nourriture sur place?', foodLead: 'Choisissez le principal. Ajoutez le reste sous Expériences.', foods: { none: 'Aucune', snacks: 'Collations ou plateau de fromages', picnic: 'Aire de pique-nique', restaurant: 'Un restaurant ou un bistro' },
  ownPage: '{name} a sa propre page.', ownPageSub: 'Mettez ses heures et son menu à jour là-bas, avec son propre lien. Nous ne vous les demanderons pas deux fois.', ownPageLink: 'Voir sa page : {name}',
  rnameLabel: 'Nom du restaurant', rnameEx: 'Le Bistro du vignoble', rwhenLabel: 'Quand est-il ouvert? (facultatif)', rwhenEx: 'Du jeudi au lundi dès midi', rnameNeed: 'Écrivez le nom de votre restaurant, ou touchez une autre réponse.',
  feeQ: 'Combien coûte une dégustation par personne?', feeLead: 'Le prix paraît sur votre page et sur votre fiche tout de suite.',
  feeGuess: 'Votre fiche indique {x} maintenant, d’après votre site Web. Touchez un autre prix s’il a changé.', feeGuessVisit: 'Votre site Web indique {x}, alors nous l’avons choisi. Touchez un autre prix s’il a changé.', feeWaiting: 'Vous avez envoyé {x}. Nous le vérifions; il s’affichera d’ici un jour.',
  feeFree: 'Gratuite', feeOther: 'Autre', feeLabel: 'Prix en dollars', feeOver: 'Un prix de plus de {n} $ est vérifié d’abord et s’affiche d’ici un jour.',
  feeNeed: 'Touchez un prix, ou touchez Autre et écrivez-le, par exemple 18.',
  waivedQ: 'Est-elle gratuite à l’achat de vin?', waivedOpts: { yes: 'Oui, avec une bouteille', two: 'Avec 2 bouteilles ou plus', no: 'Non' },
  feeSavedLive: 'Votre prix de dégustation est sur votre page et votre fiche maintenant.', feeSavedDay: 'Nous vérifions d’abord les prix de plus de 75 $. Il s’affichera d’ici un jour.',
  feeCard: 'dégustations à {x} par personne', feeCardFree: 'dégustations gratuites',
  visitQ: 'Comment les visiteurs viennent-ils?', visitLead: 'Choisissez ce qui convient la plupart des jours.',
  visits: { walk_in: 'Sans réservation', recommended: 'Réservation conseillée', needed: 'Réservation obligatoire', appointment: 'Sur rendez-vous seulement' },
  visitSubs: { appointment: 'Votre fiche indique « Sur rendez-vous · appelez avant »' },
  bookLinkLabelWalkIn: 'Lien de réservation (facultatif, p. ex. pour les groupes)',
  bookLinkEx: 'la page de réservation de votre site', noBookLink: 'Nous ne prenons pas de réservations en ligne', bookLinkBad: 'Vérifiez le lien de réservation, par exemple votrevignoble.com/reserver.',
  groupsSizeQ: 'Groupes : à partir de combien de personnes doivent-ils réserver?', groupsSizeLead: 'Par exemple : « Groupes de 8 personnes ou plus : réservez à l’avance ».',
  busesQ: 'Autobus et limousines?', busesLead: 'Une réponse pour les deux. Vous n’acceptez que l’un des deux? Touchez « Réservez à l’avance » pour qu’on vous joigne d’abord.', buses: { welcome: 'Bienvenus', book: 'Réservez à l’avance', no: 'Pas pour le moment' },
  visitNeed: 'Touchez comment on vous visite, ou touchez Passer.', visitSavedLink: 'Vos réponses sont sur votre page maintenant. Nous vérifions d’abord un nouveau lien de réservation, en général d’ici un jour.',
  allYearAppt: 'En basse saison, nous ouvrons sur rendez-vous', allYearApptSub: 'Dégustations sans réservation une partie de l’année, sur rendez-vous le reste',
  apptQ: 'Quand accueillez-vous les visiteurs sans réservation?', apptLead: 'En dehors de ces dates, votre fiche indique « Sur rendez-vous · appelez avant ».',
  apptFrom: 'Sans réservation à partir du', apptTo: 'Sans réservation jusqu’au', apptSave: 'Enregistrer mes heures', apptNeed: 'Choisissez le premier et le dernier jour des dégustations sans réservation.',
  apptNow: 'Sans réservation du {a} au {b}, sur rendez-vous le reste de l’année ✓',
  needOpenDayAppt: 'Indiquez au moins un jour d’ouverture. Pas d’heures fixes? Touchez « Nous n’avons pas d’heures fixes » plus bas.',
  noSetHours: 'Nous n’avons pas d’heures fixes. Visites sur rendez-vous', noSetHoursNow: 'Pas d’heures fixes. Visites sur rendez-vous ✓',
  noSetHoursSaved: 'Vos anciennes heures de la semaine sont retirées de votre page. Elle indique « Sur rendez-vous · appelez avant ».',
  apptHoursGone: 'Sur rendez-vous seulement : vos anciennes heures de la semaine sont retirées de votre page, qui indique seulement « Sur rendez-vous · appelez avant ».',
  storyQ: 'Parlez de votre vignoble aux visiteurs', storyEx: 'Un vignoble familial sur le banc de Naramata. Nous cultivons du pinot noir et du chardonnay, et la terrasse donne sur le lac.',
  knownQ: 'Pour quoi êtes-vous reconnu?', knownLead: 'Une ligne, c’est parfait. Elle paraît en haut de « Planifiez votre visite ».', knownEx: 'Pinot noir et chardonnay de nos vignes',
  storyKnownSaved: 'Votre spécialité est sur votre page maintenant. Votre histoire s’affichera d’ici un jour.',
  expQ: 'Des expériences à réserver?', expLead: 'Jusqu’à deux, comme vin et fromage ou une visite du vignoble. Elles paraissent dans « Planifiez votre visite ».',
  expN: 'Expérience {n}', expNameLabel: 'Nom', expTextLabel: 'Détails (facultatif)', expQuick: ['Vin et fromage', 'Visite du vignoble', 'Paniers de pique-nique', 'Dégustation privée'],
  expEx1: '45 $ par personne, tous les jours à 13 h. Réservez à l’avance.', expEx2: 'Une promenade dans les vignes avec le vigneron, environ 1 heure.',
  expNone: 'Nous n’offrons pas d’extras', expNeed: 'Écrivez une expérience, ou touchez « Nous n’offrons pas d’extras ».', expNameNeed: 'Donnez un nom à chaque expérience, comme Vin et fromage.',
  menuQ: 'Comment devrions-nous ajouter votre menu de dégustation ou votre carte des vins?', menuLead: 'Choisissez le plus facile pour vous. C’est facultatif.', menuSentQ: 'Votre carte des vins est envoyée ✓', menuNewer: 'Vous voulez en envoyer une plus récente?',
  upload: 'Téléverser ma carte des vins (un fichier ou des photos)', snap: 'Photographier mon menu de dégustation', snapSub: 'Photographiez chaque page', web: 'Ma carte des vins est sur mon site Web',
  menuSocial: 'Ma carte des vins est sur Facebook ou Instagram', emailQ: 'Envoyez-nous votre carte des vins par courriel', emailLead: 'Envoyez une photo ou un fichier de votre menu de dégustation ou de votre carte des vins. Indiquez « {name} » dans l’objet.',
  mailSubject: 'Carte des vins de {name}', menuSentEmail: '✓ Vous avez dit que vous enverrez votre carte des vins par courriel.', menuNote: 'Envoyé depuis la configuration simple. Veuillez ajouter notre menu de dégustation ou notre carte des vins à notre page.',
  webQ: 'Votre carte des vins est-elle à cette adresse?', webLead: 'Nous avons inscrit l’adresse de votre site Web. Si votre carte des vins a sa propre page, tapez son nom après le dernier /, comme /vins.',
  webLabel: 'Adresse Web de la carte des vins', webEmpty: 'Écrivez l’adresse de votre carte des vins, comme www.votrevignoble.com/vins.',
  webQEmpty: 'Où est votre carte des vins en ligne?', webLeadEmpty: 'Tapez l’adresse de la page où se trouve votre carte des vins.',
  socialQ: 'Instagram et Facebook', socialLead: 'Remplissez ceux que vous avez. Votre page y mène.',
  socialNeed: 'Écrivez votre Instagram ou votre Facebook, ou touchez une réponse sous chacun.',
  hoursSavedNow: '✓ Vos heures sont enregistrées.', hoursSentNow: '✓ Vos heures sont envoyées.',
  doorQ: 'Aidez les gens à trouver votre salle de dégustation', doorLead: 'Sur un grand domaine, l’épingle peut tomber dans vos vignes ou vos vergers. Une photo, prise à la porte de la salle de dégustation, y mène les visiteurs directement.',
  mapFailQ: 'Envoyez la photo de la porte de votre salle de dégustation',
  doorPhotoQ: 'Prenez une photo de la porte de votre salle de dégustation', doorPhotoLead: 'Placez-vous dehors pour que la porte et votre enseigne soient dans la photo. Votre appareil vous demandera de partager votre position, pour que les visiteurs obtiennent l’itinéraire jusqu’ici.',
  igLead: 'Écrivez votre nom Instagram, comme @votrevignoble.',
  menuSent: '✓ Votre carte des vins est envoyée.', upQ: 'Téléversez votre carte des vins', upQSome: 'Votre carte des vins', upLead: 'Choisissez le fichier de votre carte des vins. Un fichier ou des photos, les deux fonctionnent.',
  upPick: 'Choisir le fichier de ma carte des vins', sendMenu: 'Envoyer ma carte des vins', camLead: 'Tenez votre appareil au-dessus de la carte des vins pour que toute la page soit visible.', page: 'Page {n} de la carte des vins',
  menuSocialQ: 'Où est votre carte des vins?', menuSocialLead: 'Collez le lien de votre page ou publication Facebook ou Instagram avec la carte des vins. Ou tapez le nom de la page et nous la trouverons.',
  menuSocialNote: 'Notre carte des vins est sur notre page Facebook ou Instagram : « {name} ». Merci de la trouver et de l’ajouter comme lien de notre menu.',
  savedMenuSocialName: 'Nous trouverons votre carte des vins sur cette page et l’ajouterons d’ici un jour.', igFromMenu: 'D’après votre réponse sur la carte des vins : {x}. Touchez Enregistrer si c’est bien ça.',
};

// Breweries (Dayton, 2026-11-12; drafts/brewery-portal-2026-11-12/SPEC-breweries.md, "Decided"): brewery words and the two
// brewery screens (Your taproom; Flights and to go), laid over the words above for a brewery's setup (server.js
// renderOwnerSetupPage). The pub screens it reuses (happy hour, weekly events, who's welcome, groups) carry their words
// here too, since a brewery doesn't get the pub's set. Restaurants, pubs, cafés and wineries never see these.
en.brewery = {
  hiLead: 'Let’s get your taproom’s page ready, one question at a time. About 10 to 20 minutes. You can stop any time and carry on later.',
  timeLine: 'About 10 to 20 minutes. You can stop any time and carry on later.',
  labels: { hours: 'Hours and holidays', taproom: 'Your taproom', flights: 'Flights and to go', happy: 'Happy hour', photos: 'Photos', offer: 'What you offer',
    story: 'Your story and Known for', music: 'Weekly events', groups: 'Groups and booking', social: 'Instagram and Facebook', door: 'Your taproom door', menu: 'Your menu' },
  noLabels: { social: 'not on Instagram or Facebook', groups: 'no big groups', music: 'no weekly events', happy: 'no happy hour' },
  stStoryKnown: 'Known for on your page, story within a day', stGroupsLink: 'on your page, new booking link within a day',
  photosLead: 'Your taproom, your taps, your patio. Three photos is perfect.', photosNoMore: 'No, next: what you offer',
  // Your taproom
  tkindQ: 'What kind of place is it?', tkindLead: 'Pick the one that fits best.', tkindNeed: 'Please tap the kind of place that fits best.',
  tkindSubs: { Brewery: 'We brew here', Cidery: 'We make cider here', 'Taphouse or beer hall': 'We pour other brewers’ beer', Distillery: 'We make spirits here' },
  kindGuess: 'We picked this from your name. Tap another if it’s not right.',
  tfoodQ: 'Food here?', tfoodLead: 'Pick the main one.', tfoods: { kitchen: 'Our own kitchen', trucks: 'Food trucks', snacks: 'Snacks only', none: 'No food' },
  tfoodSubs: { trucks: 'Your page says “Food trucks most days”, never a truck’s name' },
  foodGuess: 'We picked this from your page now. Tap another if it changed.',
  outsideQ: 'Can people bring their own food?', outsideOpts: { yes: 'Yes', no: 'No' },
  tkitchenQ: 'Does your kitchen close before the bar?', tkitchenOpts: { same: 'No, food until we close', earlier: 'Yes, it closes earlier' }, tkitchenAt: 'Kitchen closes at',
  tkitchenNeed: 'Please pick the time your kitchen closes.', tfoodNeed: 'Please tap what food there is here.',
  taproomSaved: 'Your answers are on your page now.',
  // Flights and to go
  flightQ: 'What does a flight cost?', flightLead: 'It shows on your page and on your card right away.', flightLeadPick: 'It shows on your card as “{x}” right away.',
  flightGuess: 'Your card shows {x} now, from your website. Tap another price if it changed.', flightGuessVisit: 'Your page says {x} now, from your website, so we picked it. Tap another price if it changed.', flightWaiting: 'You sent {x}. We’re checking it; it will show within a day.',
  feeOther: 'Other', feeLabel: 'Price in dollars', feeOver: 'A price over ${n} is checked first and shows within a day.',
  noFlights: 'We don’t do flights', noFlightsSub: 'Your card shows no price',
  togoQ: 'What can people take home?', togoLead: 'Tap all that apply.', togo: { cans: 'Cans', bottles: 'Bottles', growler: 'Growler fills', crowler: 'Crowler fills', none: 'Nothing to go' },
  flightNeed: 'Please tap a price, or “We don’t do flights”.', togoNeed: 'Please tap what people can take home, or “Nothing to go”.', feeNeed: 'Please type the price in dollars, like 12.',
  flightSavedLive: 'Your flight price and to-go answer are on your page now.', flightSavedDay: 'Your to-go answer is on your page now. We check prices over $40 first; it’ll show within a day.',
  feeCard: 'From {x}', feeCardFree: 'Free flights',
  // Happy hour: as for pubs.
  happyQ: 'Do you have a happy hour?',
  // What you offer, then who's welcome (the pub answer)
  offerLead: 'Visitors use these to find a taproom like yours.',
  minorsQ: 'Who’s welcome?', minorsLead: 'Families often check this before they come. Tell us your own rule.',
  minorsOpts: { adults: 'Adults only (19+)', minors_until: 'Minors welcome with an adult, until a set time', all_ages: 'All ages welcome' },
  minorsUntil: 'Minors welcome until', minorsNoteLabel: 'Anything else? (optional)', minorsNoteEx: 'Kids welcome inside until 9 PM; the patio is 19+.',
  minorsNeed: 'Please tap one of the three, so families know before they come.', saveThese: 'Save these', nextPlain: 'Next',
  minorsLive: 'It’s on your page now, and it decides your Kids welcome badge.',
  // Your story and Known for
  storyQ: 'Tell visitors about your taproom', storyEx: 'A small family brewery downtown. We brew in the back, pour 12 taps up front, and the patio gets the evening sun.',
  knownQ: 'What are you known for?', knownLead: 'One line is perfect. It shows at the top of “Plan your visit”.', knownEx: 'Hazy IPAs and a blackberry sour',
  storyKnownSaved: 'Your Known for line is on your page now. Your story will show within a day.',
  // Groups and booking
  groupsQ: 'Groups: from what size should they book ahead?', groupsLead: 'Tap a size. You can change the words.',
  groupsEx: 'Groups of 10 or more: please book ahead', groupsLine: 'Groups of {n} or more: please book ahead.',
  // The size lines are presets, so the page shows them in its own language.
  quickGroups: ['Groups of 8 or more: please book ahead', 'Groups of 10 or more: please book ahead', 'Groups of 12 or more: please book ahead', 'Groups of 15 or more: please book ahead', 'Groups of 20 or more: please book ahead'], groupsLineLabel: 'Your Groups line', groupsNone: 'We can’t take big groups',
  groupsNeed: 'Please tap a size or type a line, or tap “We can’t take big groups”.',
  bookLinkLabel: 'Booking link (optional, e.g. for groups)', bookLinkEx: 'your website’s booking page', bookLinkBad: 'Please check the booking link, for example yourbrewery.com/book.',
  groupsNoLink: 'Please leave links out of the Groups line. Your booking link has its own box below.', bqOpens: 'Opens', bqCloses: 'Closes',
  quickDogsNoPatio: ['Dogs welcome inside', 'Water bowls at the door'],
  groupsSavedLink: 'Your Groups line is on your page now. We check a new booking link first, usually within a day.',
  // Instagram and Facebook on one screen, and the hours line on the holidays screen (as for cafés and wineries)
  socialQ: 'Instagram and Facebook', socialLead: 'Fill in the ones you have. Your page links to them.',
  socialNeed: 'Please type your Instagram or Facebook, or tap an answer under each one.',
  hoursSavedNow: '✓ Your hours are saved.', hoursSentNow: '✓ Your hours are sent.',
  igLead: 'Type your Instagram name, like @yourbrewery.',
  // Your taproom door
  doorQ: 'Where’s the taproom door?', doorLead: 'At an orchard or a big lot the map pin can land in the wrong spot. One photo, taken at the taproom door, walks visitors right to it.',
  mapFailQ: 'Send your taproom door photo',
  doorPhotoQ: 'Take a photo of your taproom door', doorPhotoLead: 'Stand outside so the door and your sign are in the picture. Your device will ask to share your location, so visitors get directions to this spot.',
};
fr.brewery = {
  hiLead: 'Préparons la page de votre salle, une question à la fois. Environ 10 à 20 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  timeLine: 'Environ 10 à 20 minutes. Vous pouvez arrêter à tout moment et continuer plus tard.',
  labels: { hours: 'Heures et jours fériés', taproom: 'Votre salle', flights: 'Plateaux et pour emporter', happy: '5 à 7', photos: 'Photos', offer: 'Ce que vous offrez',
    story: 'Votre histoire et ce pour quoi vous êtes connus', music: 'Événements de la semaine', groups: 'Groupes et réservations', social: 'Instagram et Facebook', door: 'La porte de votre salle', menu: 'Votre menu' },
  noLabels: { social: 'pas sur Instagram ni Facebook', groups: 'pas de grands groupes', music: 'pas d’événements', happy: 'pas de 5 à 7' },
  stStoryKnown: 'Votre spécialité est en ligne; votre histoire le sera d’ici un jour', stGroupsLink: 'sur votre page, nouveau lien de réservation d’ici un jour',
  photosLead: 'Votre salle, vos fûts, votre terrasse. Trois photos, c’est parfait.', photosNoMore: 'Non, suivant : ce que vous offrez',
  tkindQ: 'Quel genre d’endroit est-ce?', tkindLead: 'Choisissez celui qui convient le mieux.', tkindNeed: 'Touchez le genre d’endroit qui convient le mieux.',
  tkindSubs: { Brewery: 'Nous brassons ici', Cidery: 'Nous faisons du cidre ici', 'Taphouse or beer hall': 'Nous servons la bière d’autres brasseurs', Distillery: 'Nous distillons ici' },
  kindGuess: 'Nous l’avons choisi d’après votre nom. Touchez-en un autre s’il ne convient pas.',
  tfoodQ: 'Nourriture sur place?', tfoodLead: 'Choisissez le principal.', tfoods: { kitchen: 'Notre cuisine', trucks: 'Camions de cuisine de rue', snacks: 'Collations seulement', none: 'Pas de nourriture' },
  tfoodSubs: { trucks: 'Votre page indique « Camions de cuisine de rue la plupart des jours », jamais le nom d’un camion' },
  foodGuess: 'Nous l’avons choisi d’après votre page actuelle. Touchez-en un autre si ça a changé.',
  outsideQ: 'Peut-on apporter sa propre nourriture?', outsideOpts: { yes: 'Oui', no: 'Non' },
  tkitchenQ: 'Votre cuisine ferme-t-elle avant le bar?', tkitchenOpts: { same: 'Non, on sert à manger jusqu’à la fermeture', earlier: 'Oui, elle ferme plus tôt' }, tkitchenAt: 'La cuisine ferme à',
  tkitchenNeed: 'Choisissez l’heure de fermeture de votre cuisine.', tfoodNeed: 'Touchez la nourriture offerte ici.',
  taproomSaved: 'Vos réponses sont sur votre page maintenant.',
  flightQ: 'Combien coûte un plateau de dégustation?', flightLead: 'Le prix paraît sur votre page et sur votre fiche tout de suite.', flightLeadPick: 'Votre fiche indique « {x} » tout de suite.',
  flightGuess: 'Votre fiche indique {x} maintenant, d’après votre site Web. Touchez un autre prix s’il a changé.', flightGuessVisit: 'Votre page indique {x} maintenant, d’après votre site Web, alors nous l’avons choisi. Touchez un autre prix s’il a changé.', flightWaiting: 'Vous avez envoyé {x}. Nous le vérifions; il s’affichera d’ici un jour.',
  feeOther: 'Autre', feeLabel: 'Prix en dollars', feeOver: 'Un prix de plus de {n} $ est vérifié d’abord et s’affiche d’ici un jour.',
  noFlights: 'Nous n’offrons pas de plateaux', noFlightsSub: 'Votre fiche n’affiche aucun prix',
  togoQ: 'Qu’est-ce qu’on peut rapporter?', togoLead: 'Touchez tout ce qui s’applique.', togo: { cans: 'Canettes', bottles: 'Bouteilles', growler: 'Remplissage de growlers', crowler: 'Remplissage de crowlers', none: 'Rien à emporter' },
  flightNeed: 'Touchez un prix, ou « Nous n’offrons pas de plateaux ».', togoNeed: 'Touchez ce qu’on peut rapporter, ou « Rien à emporter ».', feeNeed: 'Écrivez le prix en dollars, par exemple 12.',
  flightSavedLive: 'Votre prix de plateau et votre réponse pour emporter sont sur votre page maintenant.', flightSavedDay: 'Votre réponse pour emporter est sur votre page maintenant. Nous vérifions d’abord les prix de plus de 40 $; il s’affichera d’ici un jour.',
  feeCard: 'Dès {x}', feeCardFree: 'Plateaux gratuits',
  happyQ: 'Avez-vous un 5 à 7?', happyYes: 'Oui',
  offerLead: 'Les visiteurs s’en servent pour trouver une salle comme la vôtre.',
  minorsQ: 'Qui est le bienvenu?', minorsLead: 'Les familles vérifient souvent avant de venir. Dites-nous votre propre règle.',
  minorsOpts: { adults: 'Adultes seulement (19 ans et plus)', minors_until: 'Mineurs bienvenus avec un adulte, jusqu’à une heure donnée', all_ages: 'Tous les âges sont bienvenus' },
  minorsUntil: 'Mineurs bienvenus jusqu’à', minorsNoteLabel: 'Autre chose? (facultatif)', minorsNoteEx: 'Enfants bienvenus à l’intérieur jusqu’à 21 h; terrasse 19 ans et plus.',
  minorsNeed: 'Touchez l’une des trois réponses, pour que les familles le sachent avant de venir.', saveThese: 'Enregistrer', nextPlain: 'Suivant',
  minorsLive: 'C’est sur votre page maintenant, et cela décide de votre mention Enfants bienvenus.',
  storyQ: 'Parlez de votre salle aux visiteurs', storyEx: 'Une petite microbrasserie familiale au centre-ville. Nous brassons à l’arrière, servons 12 fûts à l’avant, et la terrasse a le soleil du soir.',
  knownQ: 'Pour quoi êtes-vous reconnu?', knownLead: 'Une ligne, c’est parfait. Elle paraît en haut de « Planifiez votre visite ».', knownEx: 'Des IPA troubles et une sure aux mûres',
  storyKnownSaved: 'Votre spécialité est sur votre page maintenant. Votre histoire s’affichera d’ici un jour.',
  groupsQ: 'Groupes : à partir de combien de personnes doivent-ils réserver?', groupsLead: 'Touchez une taille. Vous pouvez changer les mots.',
  groupsEx: 'Groupes de 10 personnes ou plus : réservez à l’avance', groupsLine: 'Groupes de {n} personnes ou plus : réservez à l’avance.',
  quickGroups: ['Groupes de 8 personnes ou plus : réservez à l’avance', 'Groupes de 10 personnes ou plus : réservez à l’avance', 'Groupes de 12 personnes ou plus : réservez à l’avance', 'Groupes de 15 personnes ou plus : réservez à l’avance', 'Groupes de 20 personnes ou plus : réservez à l’avance'], groupsLineLabel: 'Votre ligne Groupes', groupsNone: 'Nous ne pouvons pas accueillir de grands groupes',
  groupsNeed: 'Touchez une taille ou écrivez une ligne, ou touchez « Nous ne pouvons pas accueillir de grands groupes ».',
  bookLinkLabel: 'Lien de réservation (facultatif, p. ex. pour les groupes)', bookLinkEx: 'la page de réservation de votre site', bookLinkBad: 'Vérifiez le lien de réservation, par exemple votrebrasserie.com/reserver.',
  groupsNoLink: 'Gardez les liens hors de la ligne Groupes. Votre lien de réservation a sa propre case plus bas.', bqOpens: 'Ouvre', bqCloses: 'Ferme',
  quickDogsNoPatio: ['Chiens bienvenus à l’intérieur', 'Bols d’eau à l’entrée'],
  groupsSavedLink: 'Votre ligne Groupes est sur votre page maintenant. Nous vérifions d’abord un nouveau lien de réservation, en général d’ici un jour.',
  socialQ: 'Instagram et Facebook', socialLead: 'Remplissez ceux que vous avez. Votre page y mène.',
  socialNeed: 'Écrivez votre Instagram ou votre Facebook, ou touchez une réponse sous chacun.',
  hoursSavedNow: '✓ Vos heures sont enregistrées.', hoursSentNow: '✓ Vos heures sont envoyées.',
  igLead: 'Écrivez votre nom Instagram, comme @votrebrasserie.',
  doorQ: 'Où est la porte de votre salle?', doorLead: 'Dans un verger ou un grand terrain, l’épingle peut tomber au mauvais endroit. Une photo, prise à la porte de la salle, y mène les visiteurs directement.',
  mapFailQ: 'Envoyez la photo de la porte de votre salle',
  doorPhotoQ: 'Prenez une photo de la porte de votre salle', doorPhotoLead: 'Placez-vous dehors pour que la porte et votre enseigne soient dans la photo. Votre appareil vous demandera de partager votre position, pour que les visiteurs obtiennent l’itinéraire jusqu’ici.',
};

// Café test 6 (2026-11-12): French spacing in every French setup string: a no-break space before « : » and a narrow
// no-break space before « ? » and « ! » ("Noël : …", "Facultatif : …", "Options sans gluten ?"), never split from the
// word before it. Times (7:00), addresses (https://) and anything not followed by a space or the end are left alone.
function frSpacing(t) {
  return String(t)
    .replace(/([^\s\u00a0\u202f\d/])[ \u00a0\u202f]?:(?=[\s»”)]|$)/g, '$1\u00a0:')
    .replace(/([^\s\u00a0\u202f?!])[ \u00a0\u202f]?([?!]+)(?=[\s»”)]|$)/g, '$1\u202f$2');
}
(function frSpaces(o) {
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string') o[k] = frSpacing(o[k]);
    else if (Array.isArray(o[k])) o[k] = o[k].map((x) => (typeof x === 'string' ? frSpacing(x) : x));
    else if (o[k] && typeof o[k] === 'object') frSpaces(o[k]);
  }
})(fr);

module.exports = { en, fr, frSpacing };
