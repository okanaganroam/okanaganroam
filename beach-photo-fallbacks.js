const BEACH_PHOTO_MANIFEST = require('./data/beach-photo-manifest.json');

const photoByRoute = new Map(
  BEACH_PHOTO_MANIFEST
    .filter((item) => item.verified && item.image)
    .map((item) => [item.route, item.image]),
);

function regionSlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function beachPhotoForVenue(venue) {
  if (!venue || String(venue.type || '').toLowerCase() !== 'beach') return venue?.image_url || null;
  const supplied = String(venue.image_url || '').trim();
  if (supplied) return supplied;
  const region = regionSlug(venue.region);
  const slug = String(venue.slug || '').trim();
  if (!region || !slug) return null;
  const photo = photoByRoute.get(`/${region}/beaches/${slug}`);
  // Bypass any edge-cached 404s from before these files were deployed.
  return photo ? `${photo}?v=beach-photo-1` : null;
}

module.exports = { beachPhotoForVenue, BEACH_PHOTO_MANIFEST };
