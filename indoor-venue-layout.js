// Indoor & Rainy Day pages (2026-11-08): every English page the Indoor & Rainy Day hub lists (the indoor venues and the
// indoor golf simulators) uses the layout first built for GOLFBOX: a welcoming overview, the booking button first, a
// "Your visit" card and a "Getting here" card, with a sticky tab row. Each part is built from what the place's own listing
// records and appears only when it has something to show. Nothing is written for a place that has no data.
//
// GOLFBOX keeps its own hand-written page (golfbox-venue-layout.js); every other page is built here.
'use strict';
const { introFrom } = require('./food-drink-venue-layout');

const BOOKING_LABELS = /^(booking|bookings|reservations?|pricing|prices?|rates?|tickets?|admission|cost|green fees)$/i;
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// Indoor test 2 (2026-11-19; Jordan): after the owner answered, the line said "From e-exit.ca ↗, checked 2026-11-19" while
// the French page said « Source : l’établissement, vérifié le 19 nov. 2026 ». Every line the owner's own: "Source: the
// business, checked Nov 19, 2026"; some of research's left: "Sources: the business and e-exit.ca ↗"; the date in words.
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function checkedText(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${SHORT_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(d || ''); }
function sourceLine(p, e, external) {
  const vi = p.visitInfo;
  if (!vi) return '';
  const own = new Set([...(Array.isArray(vi.owner_labels) ? vi.owner_labels : []), ...(Array.isArray(vi.owner_dropped) ? vi.owner_dropped.filter((r) => r && r.owned).map((r) => r.label) : [])]);
  const rows = Array.isArray(vi.rows) ? vi.rows : [];
  const when = vi.checked_at ? `, checked ${e(checkedText(vi.checked_at))}` : '';
  const link = vi.source_url ? external(vi.source_url, e(hostOf(vi.source_url))) : '';
  if (own.size && rows.length && rows.every((r) => own.has(r.label))) return `<p class="gb-source">Source: the business${when}</p>`;
  if (own.size) return `<p class="gb-source">Sources: the business and ${link || 'our research'}${when}</p>`;
  return link ? `<p class="gb-source">From ${link}${when}</p>` : '';
}
function renderIndoorLayout(p) {
  const e = p.escapeHtml, v = p.venue;
  const visitRows = (p.visitInfo && p.visitInfo.rows) || [];
  const glance = p.glanceRows || []; // [[label, text]] from the editorial at-a-glance facts (indoor golf only)
  const external = (url, label, cls = '') => `<a class="${cls}" href="${e(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
  const isGolf = v.type === 'golf';
  // Indoor test 14 (2026-11-19; Helen: the label above her museum's name said "Indoor & rainy day"): it says the place's
  // kind ("Museum", "Cinema"), as the French page does; only a place with no kind words keeps "Indoor & rainy day".
  const eyebrow = isGolf ? '⛳ Indoor golf' : p.kindLabel ? `🌧️ ${e(p.kindLabel)}` : '🌧️ Indoor &amp; rainy day';

  // The booking button: the place's own booking link when it has one.
  const bookingAnchor = p.actions.find((a) => /data-track="booking"/.test(a));
  const book = bookingAnchor ? bookingAnchor.replace(/class="[^"]*"/, 'class="gb-book"').replace(/(\s*↗)?<\/a>$/, ' ↗</a>') : '';
  const directions = p.actions.find((a) => /data-track="directions"/.test(a)) || '';
  const contactActions = p.actions.filter((a) => /data-track="(phone|website)"/.test(a));
  const save = p.actions.filter((a) => /fav-btn|trip-btn/.test(a));
  const mainButton = book || (directions ? directions.replace(/class="[^"]*"/, 'class="gb-book"') : '');

  // Indoor test 5 (2026-11-19; Chris): the intro showed only the first two sentences of his three-sentence story (the
  // trampoline park was folded away). A short story shows whole; a longer one up to about 300 characters.
  const { intro, rest } = indoorIntro(p.venue.description, !!p.ownStory);

  // Quick facts: short recorded values only (the editorial glance rows).
  const tiles = glance.filter(([, text]) => String(text).length <= 30).slice(0, 4)
    .map(([label, text]) => `<div><strong>${e(text)}</strong><small>${e(label)}</small></div>`);

  // Cost and booking rows go in the booking card; every other recorded row is in Your visit.
  const costRows = visitRows.filter((r) => BOOKING_LABELS.test(r.label));
  const otherRows = visitRows.filter((r) => !BOOKING_LABELS.test(r.label));
  const rowHtml = (r) => `<div class="gb-row"><strong>${e(r.label)}</strong><p>${r.url ? external(r.url, e(r.text)) : e(r.text)}</p></div>`;
  // The price level is shown once: in Getting here when the details already carry a Price row, otherwise here.
  const price = v.price && !/class="label">Price</.test(p.detailRows || '') ? '$'.repeat(Math.min(4, Math.max(1, Number(v.price) || 1))) : '';

  // Indoor test 5 (2026-11-19; Chris typed 7 prices; the French page listed them, the English page never did): the owner's
  // typed price list shows here as on the French page ("See all prices & rates (7)").
  const pricesCard = p.menuHtml ? `<section class="gb-card gb-prices" id="gbPrices">${p.menuHtml}</section>` : '';
  // Indoor test 13 (2026-11-19): the card is titled by what the button opens (a cinema's showtimes, a studio's schedule).
  // Indoor test 17 (2026-11-19; Megan's walk-in gym: "Plan a time / Book your visit" sat above "Walk-ins welcome", her button
  // being the waiver): a walk-in place's card is "Before you go".
  const walkIn = visitRows.some((r) => /^Booking$/i.test(r.label) && /^Walk-ins welcome: no need to book\.?$/i.test(String(r.text || '').trim()));
  const bookHead = />Showtimes (?:&amp;|&) tickets\b/.test(book) ? 'Showtimes &amp; tickets' : />Class schedule\b/.test(book) ? 'Class schedule' : walkIn ? 'Before you go' : 'Book your visit';
  const bookingCard = book || costRows.length
    ? `<aside class="gb-card gb-booking" id="gbBooking"><p class="gb-eyebrow">${book && !walkIn ? 'Plan a time' : walkIn ? 'Walk-ins welcome' : 'Good to know'}</p><h2>${book ? bookHead : 'Prices &amp; booking'}</h2>
        ${book ? `<div class="gb-desktop-book">${book}<p class="gb-help">${walkIn ? 'Opens in a new tab.' : 'Opens the booking page in a new tab.'}</p></div>` : ''}
        ${price ? `<p class="gb-price-line"><strong>${price}</strong> <span>price level</span></p>` : ''}
        ${costRows.map(rowHtml).join('')}
        ${sourceLine(p, e, external)}
      </aside>` : '';

  const visitBody = [...glance.map(([label, text]) => rowHtml({ label, text })), ...otherRows.map(rowHtml)].join('');
  const visitCard = visitBody
    ? `<section class="gb-card gb-visit" id="gbVisit"><p class="gb-eyebrow">Before you go</p><h2>Your visit ✨</h2>${visitBody}</section>` : '';

  const contactCard = (p.detailRows || p.locationHtml || contactActions.length || directions)
    ? `<section class="gb-card gb-contact" id="gbContact"><p class="gb-eyebrow">Meet you there</p><h2>Getting here 📍</h2>${p.detailRows ? `<div class="venue-key-info">${p.detailRows}</div>` : ''}${p.locationHtml || ''}<div class="gb-contact-actions">${directions}${contactActions.join('')}</div></section>` : '';
  const hoursCard = p.hoursHtml ? `<section class="gb-card gb-hours" id="gbHours"><div class="venue-section venue-hours" id="venueHours">${p.hoursHtml}</div></section>` : '';

  const nav = [['gbOverview', 'Overview'], bookingCard ? ['gbBooking', book && !walkIn ? 'Book' : walkIn ? 'Before you go' : 'Prices'] : pricesCard && ['gbPrices', 'Prices'], visitCard && ['gbVisit', 'Your visit'], contactCard && ['gbContact', 'Getting here'], hoursCard && ['gbHours', 'Hours']]
    .filter(Boolean).map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');

  // Indoor test 7 (2026-11-19; Robert): with the whole story already the intro, "The space" repeated it word for word. It
  // shows only when it has more to say; the guide links stay on their own.
  const more = rest
    ? `<section class="gb-card gb-more"><h2>A little more about ${e(v.name)}</h2><details class="gb-fold"><summary>The space</summary><p>${e(v.description || '')}</p>${p.guideLinks || ''}</details></section>`
    : p.guideLinks ? `<section class="gb-card gb-more">${p.guideLinks}</section>` : '';

  return `<div id="gbLayout" class="gb-generic">
    <nav class="gb-nav" aria-label="Page sections">${nav}</nav>
    <div class="gb-grid">
      <section id="gbOverview" class="gb-overview">
        <p class="gb-eyebrow">${eyebrow} · <a href="/${e(v.region)}">${e(p.regionLabel)}</a></p>${v.image_url ? `<h1 class="gb-desktop-title">${e(v.name)}</h1>` : ''}
        ${intro ? `<p class="gb-intro">${e(intro)}</p>` : ''}
        ${p.verifiedHtml || ''}${p.advisoryHtml || ''}${p.openStatusHtml || ''}${p.chipsHtml ? `<p class="chips">${p.chipsHtml}</p>` : ''}
        ${book ? `<div class="gb-mobile-book">${book}<p class="gb-help">${walkIn ? 'Opens in a new tab ↗' : 'Opens the booking page in a new tab ↗'}</p></div>` : mainButton ? `<div class="gb-direct">${mainButton}</div>` : ''}
        ${tiles.length >= 2 ? `<div class="gb-quick">${tiles.join('')}</div>` : ''}
        ${save.length ? `<div class="gb-save"${p.ctaRowAttrs}>${save.join('')}</div><p class="gb-help">♡ Favorite saves this place for later. Add to trip puts it on your trip list.</p>` : ''}
      </section>
      ${bookingCard}${pricesCard}${p.dealsHtml ? `<section class="gb-card gb-deals">${p.dealsHtml}</section>` : ''}${visitCard}${contactCard}${hoursCard}
    </div>
    ${p.gallery || ''}${more}
    ${p.eventsHtml || ''}${p.visitorHtml || ''}
    ${p.nearbyCards.length ? `<section class="gb-nearby"><p class="gb-eyebrow">Keep the good day going</p><h2>Around the neighbourhood 🌿</h2><ul class="nearby-list">${p.nearbyCards.slice(0, 3).join('')}</ul></section>` : ''}
    ${p.ownerCtaHtml || ''}
    <p class="gb-source">Know something we should update? <a href="/contact" data-contact-open>Let us know →</a></p>
  </div>${JUMP_SCRIPT}`;
}

// Jump straight below both sticky bars (as on the GOLFBOX page), so a section heading is not left behind the tabs.
const JUMP_SCRIPT = `<script>
  (function(){
    var layout=document.getElementById('gbLayout');
    if(!layout)return;
    layout.addEventListener('click',function(event){
      var link=event.target.closest('a[href^="#gb"]');
      if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
      var target=document.getElementById(link.hash.slice(1));
      if(!target || !layout.contains(target))return;
      event.preventDefault();event.stopPropagation();
      var nav=layout.querySelector('.gb-nav'),header=document.querySelector('header');
      var offset=(header?header.getBoundingClientRect().height:52)+(nav?nav.offsetHeight:64)+18;
      var top=target.getBoundingClientRect().top+window.scrollY-offset;
      window.scrollTo({top:Math.max(0,top),behavior:'instant'});
      history.pushState(null,'',link.hash);
    },true);
  })();
  </script>`;

function indoorIntro(description, own = false) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  // Indoor test 6 (2026-11-19; Priya's four-sentence story, 338 letters, lost its last line "Kids’ summer camps and private
  // parties too."): a story of up to 400 letters (a few sentences, what the setup asks for) shows whole.
  // Indoor test 14 (2026-11-19; Helen kept research's two sentences and added three of her own, 530 letters: the intro
  // stopped after research's two): the owner's own story (sent and checked) shows whole up to 700 letters.
  if (text.length <= (own ? 700 : 400)) return { intro: text, rest: false };
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/);
  let intro = sentences[0];
  for (let i = 1; i < sentences.length && (intro + ' ' + sentences[i]).length <= 300; i++) intro += ' ' + sentences[i];
  if (intro.length > 320) intro = intro.slice(0, 300).replace(/[\s,;:]+\S*$/, '') + '…';
  return { intro, rest: intro !== text };
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (err) { return 'the source'; }
}
module.exports = { renderIndoorLayout };
