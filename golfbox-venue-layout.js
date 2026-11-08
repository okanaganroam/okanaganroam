// GOLFBOX's own listing, composed into a booking-first venue page.
function renderGolfboxLayout(p) {
  const e=p.escapeHtml;
  const external=(url,label,cls='')=>`<a class="${cls}" href="${e(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
  const booking=p.actions.find(a=>/data-track="booking"/.test(a));
  const book=booking ? booking.replace(/>[^<]*<\/a>$/, '>⛳ Book a bay ↗</a>').replace(/class="[^"]*"/, 'class="gb-book"') : external(p.venue.website,'⛳ Book a bay','gb-book');
  const directions=p.actions.find(a=>/data-track="directions"/.test(a)) || '';
  const saved=p.actions.filter(a=>/fav-btn|trip-btn/.test(a)).join('');
  const rows=(p.visitInfo?.rows || []).filter(r=>!['Green fees','Booking','Food','Good to know'].includes(r.label));
  return `<div id="gbLayout">
    <nav class="gb-nav" aria-label="GOLFBOX page sections"><a href="#gbOverview">Overview</a><a href="#gbBooking">Bay prices</a><a href="#gbVisit">Your visit</a></nav>
    <div class="gb-grid">
      <section id="gbOverview" class="gb-overview">
        <p class="gb-eyebrow">⛳ Indoor golf · West Kelowna</p><h1 class="gb-desktop-title">GOLFBOX</h1>
        <h2>Your game. A little more play. 💚</h2>
        <p>A private indoor round with friends, a little swing practice or a first try at golf—make it your own at this locally owned Indigenous space on Westbank First Nation land.</p>
        ${p.verifiedHtml}${p.advisoryHtml}
        <div class="gb-mobile-book">${book}<p class="gb-help">$35–$60 per bay, per hour · up to 4 golfers<br>Opens GOLFBOX’s booking site ↗ · <a href="#gbBooking">See rate times</a></p></div>
        <div class="gb-quick"><div>🏌️ <strong>3 private bays</strong></div><div>👋 <strong>Up to 4 per bay</strong></div><div>🎯 <strong>TrackMan iO</strong></div><div>🌙 <strong>24/7 with booking</strong></div></div>
        <div class="gb-save"${p.ctaRowAttrs}>${saved}</div><p class="gb-help">♡ Favorite saves this place for later. Add to trip puts it on your trip list.</p>
        <div class="gb-mini"><strong>Bring your clubs 👟</strong><p>Club rentals aren’t available. Balls and simulator tees are provided; bring clean indoor shoes.</p></div>
      </section>
      <aside class="gb-card gb-booking" id="gbBooking"><p class="gb-eyebrow">A bay for your whole group</p><h2>Book a little tee time</h2>
        <div class="gb-desktop-book">${book}<p class="gb-help">Opens GOLFBOX’s booking site in a new tab.</p></div>
        <div class="gb-price-heading"><strong>Bay hire · $35–$60</strong><span>per bay, per hour · up to 4 golfers</span></div>
        <dl class="gb-rates"><div><dt>Night <small>11 PM–6 AM</small></dt><dd>$35</dd></div><div><dt>Weekday daytime <small>6 AM–3 PM</small></dt><dd>$50</dd></div><div><dt>Evenings <small>3 PM–11 PM</small></dt><dd>$60</dd></div><div><dt>Weekend daytime &amp; evening <small>6 AM–11 PM</small></dt><dd>$60</dd></div></dl>
        <p class="gb-help">Winter rates through Apr 30, 2027. Final price and availability are confirmed when booking.</p>
        <div class="gb-after-rates">${book}<p class="gb-help">Opens GOLFBOX’s booking site in a new tab.</p></div>
        <p class="gb-source">${external('https://www.golfbox.ca/simulator-bays/rates-info','Official rates')} · checked Nov 8, 2026</p>
      </aside>
      <section class="gb-card gb-visit" id="gbVisit"><p class="gb-eyebrow">First time? You’ve got this</p><h2>From booking to first swing ✨</h2>
        <ol class="gb-steps"><li><strong>Pick your bay &amp; time</strong><p>Book and pay online for up to four golfers.</p></li><li><strong>Check your email</strong><p>Your confirmation has your door access code and bay session code.</p></li><li><strong>Let yourself in &amp; play</strong><p>Enter the door code and press Enter, then use your session code on the bay touchscreen. Connect the TrackMan app or play as a guest.</p></li></ol>
        <div class="gb-rules"><strong>A few things before you go</strong><ul><li>Every player must submit a waiver before playing. <span class="gb-waiver-help">Need the form? Request the waiver link before your visit: <a href="mailto:info@golfbox.ca?subject=Waiver%20link%20for%20my%20GOLFBOX%20visit">Email GOLFBOX</a> (info@golfbox.ca) or <a href="tel:2508635864">call 250-863-5864</a>. Under-14s need an adult. A parent or guardian must complete the waiver for anyone under 19.</span></li><li>Outside food and non-alcoholic drinks are welcome, away from the hitting area. No alcohol.</li><li>One golfer swings at a time; everyone else stays behind the hitting area.</li></ul>${external('https://www.golfbox.ca/our-space/policies-guidelines','Read the full venue policies')}</div>
        <details class="gb-fold"><summary>Cancellations &amp; access</summary><p>Cancel at least 12 hours ahead for a credit. Later cancellations are non-refundable. Your session ends at the booked time, even if you arrive late.</p><p>Open 24/7 for booked sessions. Access is by emailed code; staff may not be on site.</p></details>
      </section>
      <section class="gb-card gb-contact" id="gbContact"><p class="gb-eyebrow">Meet you at the bay</p><h2>Getting here 📍</h2><p>3310 Carrington Road, Unit 102<br>Westbank / West Kelowna, BC</p><p class="gb-access">🌙 24/7 access with a booking</p><div class="gb-contact-actions">${directions}${p.actions.filter(a=>/data-track="phone"|data-track="website"/.test(a)).join('')}</div>
        <details class="gb-fold"><summary>Contact &amp; social links</summary>${p.detailRows}</details>
      </section>
    </div>
    ${p.gallery}
    <section class="gb-card gb-more"><h2>A little more about GOLFBOX</h2><details class="gb-fold"><summary>The space &amp; group visits</summary><p>${e(p.venue.description || '')}</p><p>Ask GOLFBOX about booking the upstairs boardroom for a meeting or group event.</p>${p.guideLinks}</details>
      <details class="gb-fold"><summary>Lessons &amp; winter memberships</summary>${rows.map(r=>`<p><strong>${e(r.label)}:</strong> ${e(r.text)}</p>`).join('')}<p>Winter memberships are listed from $99/month through Apr 30, 2027. Confirm current inclusions and lesson availability with the venue.</p>${external(p.venue.website,'Explore lessons & memberships')}</details></section>
    ${p.eventsHtml}${p.visitorHtml}
    ${p.nearbyCards.length ? `<section class="gb-nearby"><p class="gb-eyebrow">Keep the good day going</p><h2>Around the neighbourhood 🌿</h2><ul class="nearby-list">${p.nearbyCards.slice(0,3).join('')}</ul><details class="gb-fold"><summary>More nearby ideas</summary><ul class="nearby-list">${p.nearbyCards.slice(3).join('')}</ul>${p.relatedHtml}${p.nearbyHtml}</details></section>` : ''}
    <p class="gb-source">Know something we should update? <a href="/contact" data-contact-open>Let us know →</a></p>
  </div><script>
  (function(){
    var layout=document.getElementById('gbLayout');
    if(!layout)return;
    // Jump directly below both sticky bars, avoiding the shared smooth-scroll
    // animation carrying a section heading behind the tabs mid-transition.
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
}
module.exports={renderGolfboxLayout};
