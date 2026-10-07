// Okanagan Roam map colour treatment for the Build My Trip day-header maps.
//
// A deterministic, pure per-pixel colour remap applied to a Geoapify osm-carto render before it is encoded to
// WebP. It never moves, resamples or crops anything: geography, labels and framing are exactly as rendered; only
// colours change. Land becomes warm sand/cream, vegetation muted sage, water a restrained teal-blue, roads
// beige/taupe (the highway is no longer pink or red) and label text navy-charcoal, so the map sits quietly inside
// the navy/gold planner. Because the colours are baked in, the page applies no CSS tint to these images.
//
// Method: a Shepard-style displacement field in CIE Lab. Each anchor says "this OSM Carto colour becomes that
// Okanagan Roam colour"; every pixel moves by the kernel-weighted average of the anchor displacements, so
// anti-aliased text and edges shift smoothly with their neighbours. Colours far from every anchor fall back to a
// gentle global desaturate with a warm cast, and a narrow "pink guard" keeps light blush tones from reading pink
// next to the sand land colour.
//
// Changing ANCHORS, SIGMA, BG_R or the pink guard changes the output: bump TREATMENT_ID when you do, so the build
// script re-applies it (node scripts/build-region-maps.js --recolor --all, which makes no API requests).

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const finv = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
const WP = [0.95047, 1, 1.08883];
function rgb2lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const fx = f(X / WP[0]), fy = f(Y / WP[1]), fz = f(Z / WP[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = WP[0] * finv(fx), Y = WP[1] * finv(fy), Z = WP[2] * finv(fz);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [unlin(R), unlin(G), unlin(B)];
}

// [OSM Carto colour, Okanagan Roam colour, note]
const ANCHORS = [
  // land and built-up areas -> warm cream / sand / beige
  ['#f0ece8', '#EFE8D8', 'land'], ['#f2efe9', '#EFE8D8', 'land'],
  ['#e0dcdc', '#E6DED0', 'residential'], ['#e0dfdf', '#E6DED0', 'residential'],
  ['#dcdcdc', '#DDD3C4', 'buildings / grey'], ['#d8d8d8', '#D9CEBE', 'buildings'], ['#d9d0c9', '#DDD1C1', 'buildings'],
  ['#e8d8e8', '#E2D9C6', 'industrial'], ['#ebdbe8', '#E2D9C6', 'industrial'],
  ['#f0d8d8', '#E9DFCB', 'commercial'], ['#f2dad9', '#E9DFCB', 'commercial'], ['#ffd6d1', '#E9DEC9', 'retail'],
  ['#fcfcfc', '#F8F4EA', 'white roads / halos'], ['#ffffff', '#F9F5EC', 'white'], ['#f4f4f4', '#F3EEE2', 'near white'],
  // water -> restrained muted teal / Okanagan blue
  ['#a8d0dc', '#A7C4C9', 'water'], ['#aad3df', '#A7C4C9', 'water'],
  // vegetation -> muted sage
  ['#acd09c', '#B3C5A2', 'forest'], ['#add19e', '#B3C5A2', 'forest'],
  ['#c8f8cc', '#C9D8B7', 'park'], ['#c8facc', '#C9D8B7', 'park'], ['#cdebb0', '#D0DCBA', 'grass'],
  ['#a8e0c8', '#B7CFBE', 'recreation'], ['#aedfa3', '#BDD0A8', 'orchard'], ['#eef0d5', '#E9E7CE', 'farmland'],
  // roads -> beige / taupe; the highway is deliberately no longer pink
  ['#f4f8bc', '#F1E8CC', 'secondary road'], ['#f7fabf', '#F1E8CC', 'secondary road'],
  ['#fcd6a4', '#EBD9BC', 'primary road'],
  ['#f8b09c', '#D9C3A8', 'trunk road (BC 97 / Okanagan Hwy)'], ['#f9b29c', '#D9C3A8', 'trunk road'],
  ['#e890a0', '#D8C0A8', 'motorway'], ['#e892a2', '#D8C0A8', 'motorway'],
  ['#dc2a67', '#B49A82', 'motorway casing'], ['#c84e2f', '#B39880', 'trunk casing'], ['#a06b00', '#B7A07C', 'primary casing'], ['#707d05', '#B3A883', 'secondary casing'],
  ['#8f8f8f', '#C0B6A6', 'tertiary casing'], ['#bbbbbb', '#CFC6B8', 'road casing'], ['#999999', '#C2B8A8', 'casing'],
  // labels and linework -> navy / charcoal
  ['#000000', '#1F2B38', 'label text'], ['#333333', '#2A3644', 'label text'], ['#666666', '#5A6672', 'secondary label'],
  ['#5d8cb3', '#4C7683', 'water label'], ['#ac46ac', '#AFA3A9', 'admin boundary'],
];
const SIGMA = 5.5, BG_R = 18;
const anchors = ANCHORS.map(([s, t]) => ({ S: rgb2lab(...hex(s)), T: rgb2lab(...hex(t)) }));
anchors.forEach((a) => { a.D = [a.T[0] - a.S[0], a.T[1] - a.S[1], a.T[2] - a.S[2]]; });
const wBg = Math.exp(-(BG_R * BG_R) / (2 * SIGMA * SIGMA));
const inv2s2 = 1 / (2 * SIGMA * SIGMA);

function mapPixel(r, g, b) {
  const [L, a, bb] = rgb2lab(r, g, b);
  let sw = wBg, dL = 0, da = 0, db = 0;
  // fallback displacement: gentle global desaturate with a warm cast (strongest on light, low-chroma areas)
  const fa = a * 0.55 + 0.8 - a, fb = bb * 0.55 + 2.4 - bb;
  da += wBg * fa; db += wBg * fb;
  for (let i = 0; i < anchors.length; i++) {
    const A = anchors[i];
    const x = L - A.S[0], y = a - A.S[1], z = bb - A.S[2];
    const w = Math.exp(-(x * x + y * y + z * z) * inv2s2);
    if (w < 1e-4) continue;
    sw += w; dL += w * A.D[0]; da += w * A.D[1]; db += w * A.D[2];
  }
  let L2 = L + dL / sw, a2 = a + da / sw, b2 = bb + db / sw;
  // Pink guard: light, low-chroma warm colours whose red/green is out of proportion to their yellow read as blush
  // next to the sand land colour; pull only those toward the sand's hue (a/b ~ 0.11). Water, greens, roads and text are untouched.
  if (L2 > 78 && b2 > 0 && Math.hypot(a2, b2) < 20) {
    const lim = 0.25 * b2 + 0.5;
    if (a2 > lim) a2 -= 0.75 * (a2 - lim);
  }
  return lab2rgb(L2, a2, b2);
}

const TREATMENT_ID = 'okanagan-roam-1';

// Treat a raw RGB buffer (3 bytes per pixel); returns a new buffer of the same size.
function treatRgb(data) {
  const out = Buffer.alloc(data.length);
  const cache = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let v = cache.get(key);
    if (!v) { v = mapPixel(data[i], data[i + 1], data[i + 2]); cache.set(key, v); }
    out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2];
  }
  return out;
}

module.exports = { TREATMENT_ID, ANCHORS, mapPixel, treatRgb };
