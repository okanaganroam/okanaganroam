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
    var nearby = event.target.closest('.cp-nearby .nearby-link');
    if (nearby && window.trackEvent) {
      window.trackEvent('nearby_click', {
        from_venue_id: Number(nearby.closest('.cp-nearby').dataset.fromVenue),
        venue_id: Number(nearby.closest('.nearby-card').dataset.venueId),
        surface: 'venue_page'
      });
    }
  });
  window.addEventListener('hashchange', function () { openTarget(location.hash); });
  openTarget(location.hash);
})();
// Copper keeps the thumbnails beside the main photo on phones too.
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
