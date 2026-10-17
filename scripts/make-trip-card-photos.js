#!/usr/bin/env node
// Builds data/trip-card-photos/: the 1200x630 backgrounds of the trip share cards (see tripShareSummary in server.js
// and jpeg-lite.js). Development-time only: it needs the `sharp` package, which the site itself does not use
// (SHARP_PATH=/path/to/sharp node scripts/make-trip-card-photos.js).
//
// Which photos: the town photos the site already shows, except those that carry a credit line (Creative Commons
// licences need attribution, and share-alike ones would apply to the finished card), and "small" ones (too low
// resolution). A trip whose main town has no photo here gets the valley sunset photo. Photos are cropped to cover
// 1200x630 and saved as baseline 4:2:0 JPEGs, the form jpeg-lite.js reads.
const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_PATH || 'sharp');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const block = server.slice(server.indexOf('const REGION_PHOTOS = Object.freeze({'), server.indexOf('});', server.indexOf('const REGION_PHOTOS = Object.freeze({')));
const stamp = (server.match(/const REGION_PHOTO_STAMP = '([^']+)'/) || [])[1];
const outDir = path.join(root, 'data', 'trip-card-photos');

const towns = [];
for (const line of block.split('\n')) {
  const m = line.match(/^\s+(?:'([a-z-]+)'|([a-z]+)): \{(.*)\},?\s*(\/\/ (.*))?$/);
  if (!m) continue;
  const slug = m[1] || m[2], body = m[3];
  if (/credit:/.test(body) || /small: true/.test(body)) continue;
  towns.push({ slug, source: (m[5] || '').trim() });
}

(async () => {
  const index = { generated: 'scripts/make-trip-card-photos.js', photos: {} };
  const jobs = towns.map((t) => ({ key: t.slug, file: path.join(root, 'public', 'images', 'regions', 'photos', `${t.slug}-${stamp}.jpg`), source: t.source }));
  jobs.push({ key: 'valley', file: path.join(root, 'public', 'images', 'okanagan-valley-sunset-hero.webp'), source: 'the site hero photo' });
  for (const j of jobs) {
    const buf = await sharp(j.file).resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82, chromaSubsampling: '4:2:0', progressive: false }).toBuffer();
    fs.writeFileSync(path.join(outDir, `${j.key}.jpg`), buf);
    index.photos[j.key] = { file: `${j.key}.jpg`, source: j.source };
    console.log(j.key.padEnd(16), String(buf.length).padStart(7), 'bytes', j.source);
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
})();
