#!/usr/bin/env node
// Builds the Build My Trip day-header map images (public/images/regions/maps/).
//
//   GEOAPIFY_API_KEY=... node scripts/build-region-maps.js --region penticton
//   GEOAPIFY_API_KEY=... node scripts/build-region-maps.js --all
//   add --force to re-render even when nothing changed
//   node scripts/build-region-maps.js --recolor --all     (no API key, no requests: re-applies the colour treatment to the
//                                                          original renders kept in MAPS_TMP; use after changing the treatment)
//
// Two WebP files per region, each rendered at 2x its CSS display size (never upscaled):
//   <slug>-d.webp  desktop / tablet map (646x200 window)
//   <slug>-n.webp  narrow map (phone window up to 640px wide; West Kelowna's also serves the 200px-high maps below 1100px)
// Geography comes from scripts/region-maps.config.json (marker = true coordinate, view = composition, zoom).
// Source is Geoapify Static Maps, osm-carto style, PNG. Each render is colour-treated (scripts/map-treatment.js: warm sand
// land, sage vegetation, teal-blue water, taupe roads, navy labels) and converted locally to WebP, so the page applies no
// CSS tint. The map images are otherwise clean: the destination ring is drawn by the page (CSS), and the page shows the
// required credits next to the map.
//
// Requirements: Node 18+, the `sharp` package (build tool only, not a runtime dependency:
// `npm install --no-save sharp`, or point SHARP_PATH at an install) and GEOAPIFY_API_KEY in the environment.
// The key is read from the environment ONLY. It is never printed, logged, or written to any file: console
// output is scrubbed and manifest.json holds no URL or credential.
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.MAPS_OUT || path.join(ROOT, 'public', 'images', 'regions', 'maps');
const TMP = process.env.MAPS_TMP || path.join(os.tmpdir(), 'okanagan-region-maps-png'); // PNG intermediates stay out of the repo
const CONFIG = require('./region-maps.config.json');
const { TREATMENT_ID, treatRgb } = require('./map-treatment.js');

const SCALE = 2;      // every source is rendered at 2x its CSS size (no separate 1x file)
const CROP = 20;      // extra CSS px above and below the displayed window; CSS crops them (Geoapify's strip sits at the bottom edge)
const WIN = { desktop: { w: 646, h: 200 }, narrow: { w: 640, h: 120 } }; // CSS display windows
const WEBP_QUALITY = 82;
// Geoapify's documented `attribution` parameter: "default" (Geoapify branding + data credit), "mandatory" (required data credit only),
// "none" (white-label, eligible paid plans only - NOT used). We use "mandatory" and show both required credits ourselves, next to the map.
const ATTRIBUTION_PARAM = process.env.GEOAPIFY_ATTRIBUTION || 'mandatory';
const STYLE = 'osm-carto';
const CREDITS = [
  { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  { text: 'Powered by Geoapify', href: 'https://www.geoapify.com/' },
];

// Geoapify zoom is on 512px tiles: the world is 512 * 2^zoom px wide.
function project(lat, lng, z) {
  const world = 512 * Math.pow(2, z);
  const x = (lng + 180) / 360 * world;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  return [x, y];
}
// CSS px from the image centre (the view) to the true marker.
function markerOffset(marker, view, zoom) {
  const [vx, vy] = project(view[0], view[1], zoom);
  const [mx, my] = project(marker[0], marker[1], zoom);
  return { dx: +(mx - vx).toFixed(1), dy: +(my - vy).toFixed(1) };
}
function framing(region, kind) {
  const d = region.desktop;
  if (kind === 'desktop') return { view: d.view, zoom: d.zoom, height: WIN.desktop.h, switchBelow: null };
  const n = region.narrow || {};
  return { view: n.view || d.view, zoom: n.zoom || d.zoom, height: n.height || WIN.narrow.h, switchBelow: n.switchBelow || 721 };
}

module.exports = { project, markerOffset, framing, WIN, CROP, SCALE, CONFIG };
if (require.main !== module) return;

const args = process.argv.slice(2);
const force = args.includes('--force');
const recolor = args.includes('--recolor');
const slugs = args.includes('--all') ? Object.keys(CONFIG.regions)
  : (args.includes('--region') ? [args[args.indexOf('--region') + 1]] : []);
if (!slugs.length || slugs.some((s) => !CONFIG.regions[s])) {
  console.error('usage: node scripts/build-region-maps.js --region <slug> | --all [--force]\nregions: ' + Object.keys(CONFIG.regions).join(', '));
  process.exit(2);
}
const KEY = process.env.GEOAPIFY_API_KEY;
if (!KEY && !recolor) { console.error('GEOAPIFY_API_KEY is not set. It is read from the environment only. (--recolor needs no key.)'); process.exit(1); }
let sharp;
try { sharp = require(process.env.SHARP_PATH || 'sharp'); } catch (e) { console.error('The "sharp" package is needed to build the maps: npm install --no-save sharp (or set SHARP_PATH).'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
const manifestFile = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
manifest.provider = 'Geoapify Static Maps';
manifest.style = STYLE;
manifest.sourceFormat = 'png';
manifest.outputFormat = 'webp';
manifest.webpQuality = WEBP_QUALITY;
manifest.scaleFactor = SCALE;
manifest.treatment = TREATMENT_ID;
manifest.attributionParam = ATTRIBUTION_PARAM;
manifest.attribution = CREDITS;
manifest.regions = manifest.regions || {};
const scrub = (s) => (KEY ? String(s).split(KEY).join('<key>') : String(s));
let requests = 0;

// PNG render -> colour treatment -> WebP.
async function encode(pngFile, webpFile) {
  const { data, info } = await sharp(pngFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await sharp(treatRgb(data), { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: WEBP_QUALITY, effort: 6 }).toFile(webpFile);
}

(async () => {
  for (const slug of slugs) {
    const region = CONFIG.regions[slug];
    const entry = manifest.regions[slug] || { slug };
    entry.slug = slug;
    entry.marker = region.marker;
    for (const kind of ['desktop', 'narrow']) {
      const f = framing(region, kind);
      const win = { w: WIN[kind].w, h: f.height };
      const cssW = win.w, cssH = win.h + 2 * CROP;
      const params = { style: STYLE, cssW, cssH, view: f.view, zoom: f.zoom, scale: SCALE, format: 'png', attribution: ATTRIBUTION_PARAM, quality: WEBP_QUALITY, treatment: TREATMENT_ID };
      const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 10);
      const base = `${slug}-${kind === 'desktop' ? 'd' : 'n'}`;
      const pngFile = path.join(TMP, base + '.png');
      const webpFile = path.join(OUT, base + '.webp');
      const off = markerOffset(region.marker, f.view, f.zoom);
      const display = { switchBelowPx: f.switchBelow, markerOffsetPx: off,
        markerPct: { x: +(100 * (win.w / 2 + off.dx) / win.w).toFixed(1), y: +(100 * (win.h / 2 + off.dy) / win.h).toFixed(1) } };
      if (recolor) {
        if (!fs.existsSync(pngFile)) { console.error(`${base}: original render not found in ${TMP}; a re-render (with a key) is needed`); process.exit(1); }
        const m0 = await sharp(pngFile).metadata();
        if (m0.width !== cssW * SCALE || m0.height !== cssH * SCALE) { console.error(`${base}: original is ${m0.width}x${m0.height}, wanted ${cssW * SCALE}x${cssH * SCALE}`); process.exit(1); }
        await encode(pngFile, webpFile);
        entry[kind] = Object.assign({}, entry[kind] || {}, display, {
          file: `${base}.webp`, version: hash, view: f.view, zoom: f.zoom, displayWindow: win, cropMarginPx: CROP, cssSize: { w: cssW, h: cssH },
          sourceSize: { w: m0.width, h: m0.height }, outputSize: { w: m0.width, h: m0.height }, webpBytes: fs.statSync(webpFile).size,
        });
        console.log(`${base}: recoloured (no request) webp=${entry[kind].webpBytes}B`);
        continue;
      }
      if (!force && entry[kind] && entry[kind].version === hash && fs.existsSync(webpFile)) {
        Object.assign(entry[kind], display); // display metadata may change without a new render
        console.log(`${base}: unchanged, skipped (no API request)`);
        continue;
      }
      const url = `https://maps.geoapify.com/v1/staticmap?style=${STYLE}&width=${cssW}&height=${cssH}&center=lonlat:${f.view[1]},${f.view[0]}&zoom=${f.zoom}&format=png&scaleFactor=${SCALE}&attribution=${ATTRIBUTION_PARAM}&apiKey=${KEY}`;
      let res = '', err = '';
      try { res = cp.execFileSync('curl', ['-sS', '--max-time', '60', '-o', pngFile, '-w', '%{http_code}|%{content_type}', url], { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
      catch (e) { err = scrub(e.stderr || e.message); }
      requests++;
      const [status, type] = res.split('|');
      if (status !== '200' || !/image\/png/.test(type || '')) {
        let body = ''; try { body = scrub(fs.readFileSync(pngFile, 'utf8')).slice(0, 160); } catch (e) {}
        console.error(`${base}: FAILED status=${status || 'ERR'} type=${type || ''} ${err} ${body}`);
        try { fs.unlinkSync(pngFile); } catch (e) {}
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); // keep what succeeded so far
        process.exit(1);
      }
      const meta = await sharp(pngFile).metadata();
      if (meta.width !== cssW * SCALE || meta.height !== cssH * SCALE) { console.error(`${base}: unexpected ${meta.width}x${meta.height}, wanted ${cssW * SCALE}x${cssH * SCALE}; nothing written`); process.exit(1); }
      await encode(pngFile, webpFile);
      entry[kind] = Object.assign({
        file: `${base}.webp`, version: hash, view: f.view, zoom: f.zoom,
        displayWindow: win, cropMarginPx: CROP, cssSize: { w: cssW, h: cssH },
        sourceSize: { w: meta.width, h: meta.height }, outputSize: { w: meta.width, h: meta.height },
        webpBytes: fs.statSync(webpFile).size, generated: new Date().toISOString().slice(0, 10),
      }, display);
      console.log(`${base}: ${meta.width}x${meta.height} webp=${entry[kind].webpBytes}B marker=${display.markerPct.x}%,${display.markerPct.y}%`);
      await new Promise((r) => setTimeout(r, 400));
    }
    manifest.regions[slug] = entry;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`authenticated Geoapify requests this run: ${requests}`);
})();
