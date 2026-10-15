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

test('selected remaining beach photos are ready, including the chosen Nuyens photo', () => {
  const readyBySlug = new Map(BEACH_PHOTO_MANIFEST.map((item) => [item.slug, item]));
  for (const slug of ['lions-park-okanagan-falls', 'raymer-bay-regional-park', 'gellatly-nut-farm-regional-park', 'nuyens-park']) {
    const item = readyBySlug.get(slug);
    assert.ok(item?.verified, `${slug} is marked verified`);
    assert.ok(item.image, `${slug} has a local image path`);
    assert.equal(item.path, item.image, `${slug} manifest path matches its served image`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', item.image.slice(1))), `${slug} image exists`);
  }

  const nuyens = readyBySlug.get('nuyens-park');
  assert.equal(nuyens?.imageSourceUrl, 'https://images.squarespace-cdn.com/content/v1/5adf25b575f9ee4695083a1a/1591474846126-5ZGAXJ4ZZP714V434LP1/Nuyens-park-okanaganJPG');
});
