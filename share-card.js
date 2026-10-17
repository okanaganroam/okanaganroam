// Place share cards (2026-10-13): a 1200x630 PNG per place -- the brand mark,
// a gold "WINERY · KELOWNA, BC" line and the place's name in Fraunces on the
// brand navy -- drawn with no image library. Glyphs come from the prebuilt
// atlas data/share-card-font.bin (scripts/build-share-card-font.swift); the
// PNG is written with zlib. It is a share/search preview only, never a photo
// of the place.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1200;
const H = 630;
const MARGIN = 80;
const NAVY = [0x1b, 0x2b, 0x3a];
const NAVY_DEEP = [0x10, 0x1b, 0x24];
const GOLD = [0xc9, 0xa2, 0x27];
const CREAM = [0xff, 0xfc, 0xf6];

let atlasCache = null;
function atlas() {
  if (atlasCache) return atlasCache;
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'share-card-font.bin')));
  const n = buf.readUInt32LE(0);
  atlasCache = { header: JSON.parse(buf.subarray(4, 4 + n).toString('utf8')), data: buf.subarray(4 + n) };
  return atlasCache;
}

// The atlas glyph for one character; an accented letter missing from the
// atlas falls back to its base letter, anything else is dropped.
function glyphFor(style, ch) {
  const glyphs = atlas().header.styles[style].glyphs;
  const g = glyphs[ch.codePointAt(0)];
  if (g) return g;
  const base = ch.normalize('NFD')[0];
  return base && base !== ch ? glyphs[base.codePointAt(0)] || null : null;
}
function measure(text, style, spacing = 0) {
  let w = 0;
  for (const ch of text) { const g = glyphFor(style, ch); if (g) w += g[4] + spacing; }
  return Math.max(0, w - spacing);
}

function blend(px, x, y, a, color) {
  if (a === 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  for (let c = 0; c < 3; c++) px[i + c] += ((color[c] - px[i + c]) * a) / 255;
}
function drawText(px, text, style, x, baseline, color, spacing = 0) {
  const { data } = atlas();
  let pen = x;
  for (const ch of text) {
    const g = glyphFor(style, ch);
    if (!g) continue;
    const [w, h, left, top, advance, offset] = g;
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) blend(px, Math.round(pen + left + gx), baseline - top + gy, data[offset + gy * w + gx], color);
    }
    pen += advance + spacing;
  }
  return pen;
}
function drawSprite(px, name, x, y, color) {
  const { header, data } = atlas();
  const [w, h, offset] = header.sprites[name];
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) blend(px, x + sx, y + sy, data[offset + sy * w + sx], color);
  return { w, h };
}

// Greedy word wrap; a word wider than the line is broken by characters.
function wrap(text, style, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, style) <= maxWidth) { line = next; continue; }
    if (line) lines.push(line);
    line = word;
    while (measure(line, style) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut), style) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}
// The largest name size that fits: 84px on up to two lines, then 68px or
// 54px on up to three; past that, three 54px lines ending in an ellipsis.
function fitName(name, maxWidth) {
  for (const [style, maxLines] of [['name84', 2], ['name68', 3], ['name54', 3]]) {
    const lines = wrap(name, style, maxWidth);
    if (lines.length <= maxLines) return { style, lines };
  }
  const lines = wrap(name, 'name54', maxWidth).slice(0, 3);
  while (lines[2].length > 1 && measure(`${lines[2]}…`, 'name54') > maxWidth) lines[2] = lines[2].slice(0, -1);
  lines[2] = `${lines[2].trimEnd()}…`;
  return { style: 'name54', lines };
}

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function encodePng(px) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let i = 0; i < W * 3; i++) raw[y * (W * 3 + 1) + 1 + i] = Math.round(px[y * W * 3 + i]);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// The card's content on top of whatever is already in `px`: the brand row, the gold label, the name and the footer.
// `maxWidth` is the width the label and name may use.
function paintCard(px, { name, label, maxWidth }) {
  // Brand row: the gold mark, then OKANAGAN in cream and ROAM in gold.
  const mark = drawSprite(px, 'mark', MARGIN - 4, 62, GOLD);
  const wordBaseline = 62 + Math.round(mark.h * 0.78);
  const after = drawText(px, 'OKANAGAN', 'wordmark', MARGIN + mark.w + 10, wordBaseline, CREAM, 2);
  drawText(px, 'ROAM', 'wordmark', after + 12, wordBaseline, GOLD, 2);
  // Label and name, as one block centred in the space between the brand row and the footer.
  const { style, lines } = fitName(name, maxWidth);
  const s = atlas().header.styles[style];
  const lineHeight = Math.round(s.size * 1.12);
  const labelGap = 30;
  const blockHeight = 26 + labelGap + s.ascent + lineHeight * (lines.length - 1);
  const top = Math.round(150 + (H - 120 - 150 - blockHeight) / 2);
  const shortLabel = label && measure(label, 'label', 3) > maxWidth ? label.split(' \u00b7 ')[0] : label;
  if (shortLabel) {
    for (let y = top + 9; y < top + 12; y++) for (let x = MARGIN; x < MARGIN + 44; x++) blend(px, x, y, 255, GOLD);
    drawText(px, shortLabel, 'label', MARGIN + 58, top + 22, GOLD, 3);
  }
  lines.forEach((line, i) => drawText(px, line, style, MARGIN, top + 26 + labelGap + s.ascent + lineHeight * i, CREAM));
  // Footer.
  for (let x = MARGIN; x < W - MARGIN; x++) blend(px, x, H - 104, 60, CREAM);
  drawText(px, 'okanaganroam.com', 'small', MARGIN, H - 58, [0xd8, 0xd2, 0xc4]);
}

// { name, label } -> PNG buffer. `label` is the gold line above the name,
// e.g. "WINERY \u00b7 KELOWNA, BC".
function renderShareCard({ name, label }) {
  const px = new Float32Array(W * H * 3);
  // Navy, deepening toward the bottom right.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, (x / W) * 0.45 + (y / H) * 0.75);
      const i = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = NAVY[c] + (NAVY_DEEP[c] - NAVY[c]) * t;
    }
  }
  paintCard(px, { name, label, maxWidth: W - MARGIN * 2 });
  return encodePng(px);
}

// Trip cards (2026-10-17): the same card over a photo. `photo` is { width: 1200, height: 630, data: RGB bytes } (see
// jpeg-lite.js decodeJpeg and data/trip-card-photos/). A navy veil, strongest on the text side and under the footer,
// keeps the text readable while the right of the photo shows through. Leaves as a JPEG (a photo card is far too big
// for a PNG, and WhatsApp wants previews under 300 KB).
const PHOTO_TEXT_WIDTH = 700;
function renderPhotoShareCard({ name, label, photo }) {
  if (!photo || photo.width !== W || photo.height !== H) throw new Error('the card photo must be 1200x630');
  const px = new Float32Array(W * H * 3);
  const textEdge = MARGIN + PHOTO_TEXT_WIDTH;
  for (let y = 0; y < H; y++) {
    const footer = Math.min(1, Math.max(0, (y - (H - 170)) / 90));
    const header = Math.min(1, Math.max(0, (150 - y) / 90));
    for (let x = 0; x < W; x++) {
      const across = x <= textEdge ? 0.85 : 0.85 - 0.73 * Math.min(1, (x - textEdge) / (W - textEdge));
      const veil = Math.min(0.92, Math.max(across, footer * 0.8, header * 0.5));
      const i = (y * W + x) * 3;
      const t = Math.min(1, (x / W) * 0.45 + (y / H) * 0.75);
      for (let c = 0; c < 3; c++) px[i + c] = photo.data[i + c] * (1 - veil) + (NAVY[c] + (NAVY_DEEP[c] - NAVY[c]) * t) * veil;
    }
  }
  paintCard(px, { name, label, maxWidth: PHOTO_TEXT_WIDTH });
  return require('./jpeg-lite').encodeJpeg(px, W, H, 78);
}

module.exports = { renderShareCard, renderPhotoShareCard, SHARE_CARD_WIDTH: W, SHARE_CARD_HEIGHT: H };
