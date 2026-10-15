const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sportsPhotoForVenue, SPORTS_PHOTO_MANIFEST } = require('../sports-photo-fallbacks');

test('a sourced sports photo fills only its matching empty listing and never replaces a supplied image', () => {
  assert.equal(
    sportsPhotoForVenue({ name: 'Crawford Trails – Myra-Bellevue Provincial Park', region: 'kelowna', image_url: null }),
    '/images/sports/venues/kelowna-crawford-trails-myra-bellevue-provincial-park.jpg?v=sports-photo-1',
  );
  assert.equal(
    sportsPhotoForVenue({ name: 'Crawford Trails – Myra-Bellevue Provincial Park', region: 'kelowna', image_url: 'https://example.com/owner-photo.jpg' }),
    'https://example.com/owner-photo.jpg',
  );
  assert.equal(sportsPhotoForVenue({ name: 'Crawford Trails – Myra-Bellevue Provincial Park', region: 'vernon', image_url: null }), null);
  assert.equal(sportsPhotoForVenue({ name: 'An unreviewed sports listing', region: 'kelowna', image_url: null }), null);
});

test('only the 31 reachable photos from the reviewed non-resort batch are ready; unverified listings stay image-free', () => {
  assert.equal(SPORTS_PHOTO_MANIFEST.length, 44);
  assert.equal(SPORTS_PHOTO_MANIFEST.filter((item) => item.verified && item.image).length, 31);
  assert.equal(new Set(SPORTS_PHOTO_MANIFEST.map((item) => `${item.region}/${item.name}`)).size, 44);
  const excludedNames = ['Big White Ski Resort', 'SilverStar Mountain Resort', 'Apex Mountain Resort', 'Predator Ridge Trails'];
  assert.ok(SPORTS_PHOTO_MANIFEST.every((item) => !excludedNames.includes(item.name)));

  for (const item of SPORTS_PHOTO_MANIFEST) {
    if (item.verified) {
      assert.ok(item.sourcePage, `${item.name} keeps its source page`);
      assert.ok(item.imageSourceUrl, `${item.name} keeps its source image URL`);
      assert.ok(item.image.startsWith('/images/sports/venues/'), `${item.name} points to a local sports asset`);
      assert.equal(item.path, item.image, `${item.name} manifest path matches its served image`);
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', item.image.slice(1))), `${item.name} asset exists`);
    } else {
      assert.equal(item.image, null, `${item.name} does not serve an unverified candidate`);
    }
  }
});
