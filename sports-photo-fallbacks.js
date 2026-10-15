const SPORTS_PHOTO_MANIFEST = require('./data/sports-photo-manifest.json');

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function photoKey(region, name) {
  return `${slug(region)}/${slug(name)}`;
}

const photoByListing = new Map(
  SPORTS_PHOTO_MANIFEST
    .filter((item) => item.verified && item.image)
    .map((item) => [photoKey(item.region, item.name), item.image]),
);

function sportsPhotoForVenue(venue) {
  if (!venue) return null;
  const supplied = String(venue.image_url || '').trim();
  if (supplied) return supplied;
  const image = photoByListing.get(photoKey(venue.region, venue.name));
  return image ? `${image}?v=sports-photo-2` : null;
}

module.exports = { sportsPhotoForVenue, SPORTS_PHOTO_MANIFEST };
