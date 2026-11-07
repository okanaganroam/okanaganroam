(function () {
  function openTarget(hash) {
    var target = document.getElementById(hash.slice(1));
    if (!target) return;
    var details = target.closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement.closest('details');
    }
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (link) openTarget(link.getAttribute('href'));
    var nearby = event.target.closest('.fd-nearby .nearby-link');
    if (nearby && window.trackEvent) {
      window.trackEvent('nearby_click', {
        from_venue_id: Number(nearby.closest('.fd-nearby').dataset.fromVenue),
        venue_id: Number(nearby.closest('.nearby-card').dataset.venueId),
        surface: 'venue_page'
      });
    }
  });
  window.addEventListener('hashchange', function () { openTarget(location.hash); });
  openTarget(location.hash);
})();
// Food & Drink pages keep the thumbnails beside the main photo on phones too.
(function () {
  function loadThumbs() {
    document.querySelectorAll('.vg-mosaic img[data-src]').forEach(function (image) {
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
      image.removeAttribute('data-srcset');
    });
  }
  var hero = document.querySelector('.venue-hero-photo img');
  if (!hero || hero.complete) loadThumbs();
  else {
    hero.addEventListener('load', loadThumbs, { once: true });
    hero.addEventListener('error', loadThumbs, { once: true });
  }
})();

// Keep section context clear for scrolling, anchor links and browser back.
(function () {
  var nav = document.querySelector('.fd-section-nav');
  if (!nav) return;
  var links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  var sections = links.map(function (link) { return document.querySelector(link.getAttribute('href')); }).filter(Boolean);
  var requested = location.hash;
  var requestedY = null;
  var holdUntil = 0;
  var queued = false;
  function select(hash) {
    links.forEach(function (link) {
      if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function update() {
    queued = false;
    if (Date.now() < holdUntil) return;
    var line = Math.max(166, parseFloat(getComputedStyle(nav).top) + nav.offsetHeight + 48);
    var mobile = window.matchMedia('(max-width:899px)').matches;
    var current = sections[0];
    sections.forEach(function (section) {
      // On desktop Hours sits alongside the main content, rather than after it.
      if (section.id === 'venueHours' && !mobile) return;
      if (section.getBoundingClientRect().top <= line) current = section;
    });
    var hours = document.getElementById('venueHours');
    // Hours sits beside the content on a computer, so it stays the current tab after tapping it until the visitor
    // scrolls on to something else.
    if (requested === '#venueHours' && !mobile) {
      if (requestedY === null) requestedY = window.pageYOffset;
      else if (Math.abs(window.pageYOffset - requestedY) > 120) { requested = ''; requestedY = null; }
    }
    if (!mobile && requested === '#venueHours' && hours) {
      var rect = hours.getBoundingClientRect();
      if (rect.top <= line && rect.bottom > line) current = hours;
    }
    if (current) select('#' + current.id);
  }
  function queue() {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }
  function follow(hash) {
    if (!links.some(function (link) { return link.getAttribute('href') === hash; })) return;
    requested = hash;
    requestedY = null;
    holdUntil = Date.now() + 1100;
    select(hash);
    setTimeout(queue, 1150);
  }
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest('a[href^="#"]');
    if (anchor) follow(anchor.getAttribute('href'));
  });
  window.addEventListener('hashchange', function () { follow(location.hash); });
  window.addEventListener('scroll', queue, { passive:true });
  window.addEventListener('resize', queue);
  window.addEventListener('pageshow', queue);
  window.addEventListener('load', queue);
  var favorite = document.querySelector('.fd-actions .fav-btn');
  var trip = document.querySelector('.fd-actions .trip-btn');
  if (favorite) favorite.setAttribute('aria-describedby', 'fdFavoriteHelp');
  if (trip) trip.setAttribute('aria-describedby', 'fdTripHelp');
  follow(location.hash);
  queue();
})();
