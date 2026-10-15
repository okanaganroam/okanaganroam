const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { beachPhotoForVenue, BEACH_PHOTO_MANIFEST } = require('../beach-photo-fallbacks');

test('verified beach photos are local fallbacks and never replace a supplied venue photo', () => {
  assert.equal(
    beachPhotoForVenue({ type: 'beach', region: 'Penticton', slug: 'three-mile-beach', image_url: null }),
    '/images/beaches/venues/penticton-three-mile-beach.jpg?v=beach-photo-1',
  );
  assert.equal(
    beachPhotoForVenue({ type: 'beach', region: 'Penticton', slug: 'three-mile-beach', image_url: 'https://example.com/owner-photo.jpg' }),
    'https://example.com/owner-photo.jpg',
  );
  assert.equal(beachPhotoForVenue({ type: 'restaurant', region: 'Penticton', slug: 'three-mile-beach', image_url: null }), null);
  assert.equal(beachPhotoForVenue({ type: 'beach', region: 'Penticton', slug: 'unknown-beach', image_url: null }), null);
});

test('beach photo manifest inventories all 93 live listings and only marks existing local images as ready', () => {
  assert.equal(BEACH_PHOTO_MANIFEST.length, 93);
  assert.equal(new Set(BEACH_PHOTO_MANIFEST.map((item) => item.path)).size, 93);
  for (const item of BEACH_PHOTO_MANIFEST) {
    assert.ok(item.path.startsWith('/images/beaches/venues/'), `${item.path} is a local beach asset`);
    assert.ok(item.sourcePage, `${item.slug} has a source credit`);
    if (item.verified) {
      assert.ok(item.image, `${item.slug} is marked ready only with an image`);
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', item.image.slice(1))), `${item.slug} image exists`);
    } else {
      assert.equal(item.image, null, `${item.slug} stays on the existing placeholder until verified`);
    }
  }
});
