'use strict';
// A small baseline-JPEG reader and writer with no dependencies. The trip share cards put a photo under the text and
// must leave as a JPEG (a photo does not fit WhatsApp's 300 KB preview limit as a PNG), and production has no image
// library. It reads only what the site's own card photos use (baseline, Huffman, 8-bit, 1 or 3 components, any
// sampling, restart markers) and throws on anything else. The writer makes baseline 4:2:0 JPEGs with Huffman tables
// built for each image.

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const BASE_LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const BASE_CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

// DCT basis: DCT[u * 8 + x] = c(u) / 2 * cos((2x + 1) u pi / 16).
const DCT = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) DCT[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) / 2 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

// ------------------------------------------------------------------ reader

function huffmanTable(counts, values) {
  const maxcode = new Int32Array(18).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    valptr[len] = k;
    mincode[len] = code;
    code += counts[len - 1];
    k += counts[len - 1];
    maxcode[len] = counts[len - 1] ? code - 1 : -1;
    code <<= 1;
  }
  return { maxcode, valptr, mincode, values };
}

// buf -> { width, height, data: Uint8Array of RGB }
function decodeJpeg(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  const quant = [], dcTables = [], acTables = [];
  let frame = null, restartInterval = 0, pos = 2;
  while (pos < buf.length) {
    if (buf[pos] !== 0xff) throw new Error('bad JPEG marker');
    while (buf[pos] === 0xff) pos++;
    const marker = buf[pos++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const len = buf.readUInt16BE(pos), seg = buf.subarray(pos + 2, pos + len);
    pos += len;
    if (marker === 0xdb) {
      for (let p = 0; p < seg.length;) {
        const pq = seg[p] >> 4, tq = seg[p] & 15;
        p++;
        const table = new Int32Array(64);
        for (let i = 0; i < 64; i++) { table[ZIGZAG[i]] = pq ? seg.readUInt16BE(p) : seg[p]; p += pq ? 2 : 1; }
        quant[tq] = table;
      }
    } else if (marker === 0xc0) {
      if (seg[0] !== 8) throw new Error('JPEG precision not supported');
      frame = { height: seg.readUInt16BE(1), width: seg.readUInt16BE(3), comps: [] };
      for (let i = 0; i < seg[5]; i++) frame.comps.push({ id: seg[6 + i * 3], h: seg[7 + i * 3] >> 4, v: seg[7 + i * 3] & 15, tq: seg[8 + i * 3] });
      if (frame.comps.length !== 1 && frame.comps.length !== 3) throw new Error('JPEG components not supported');
    } else if (marker >= 0xc1 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error('only baseline JPEG is supported');
    } else if (marker === 0xc4) {
      for (let p = 0; p < seg.length;) {
        const tc = seg[p] >> 4, th = seg[p] & 15, counts = seg.subarray(p + 1, p + 17);
        const total = counts.reduce((a, b) => a + b, 0);
        (tc ? acTables : dcTables)[th] = huffmanTable(counts, seg.subarray(p + 17, p + 17 + total));
        p += 17 + total;
      }
    } else if (marker === 0xdd) {
      restartInterval = seg.readUInt16BE(0);
    } else if (marker === 0xda) {
      if (!frame) throw new Error('JPEG scan before frame');
      return decodeScan(buf, pos, seg, frame, quant, dcTables, acTables, restartInterval);
    }
  }
  throw new Error('JPEG has no image data');
}

function decodeScan(buf, start, header, frame, quant, dcTables, acTables, restartInterval) {
  const { width, height, comps } = frame;
  if (header[0] !== comps.length) throw new Error('JPEG scan must hold every component');
  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const mcusX = Math.ceil(width / (8 * hmax)), mcusY = Math.ceil(height / (8 * vmax));
  comps.forEach((c) => {
    const at = header.findIndex((v, k) => k >= 1 && (k - 1) % 2 === 0 && k < 1 + comps.length * 2 && v === c.id);
    if (at < 0) throw new Error('JPEG scan names an unknown component');
    const sel = header[at + 1];
    c.dc = dcTables[sel >> 4]; c.ac = acTables[sel & 15]; c.q = quant[c.tq];
    c.stride = mcusX * c.h * 8;
    c.plane = new Uint8ClampedArray(c.stride * mcusY * c.v * 8);
    c.pred = 0;
    if (!c.dc || !c.ac || !c.q) throw new Error('JPEG is missing a table');
  });
  let pos = start, bitBuf = 0, bitCnt = 0;
  const bit = () => {
    if (bitCnt === 0) {
      let b = pos < buf.length ? buf[pos++] : 0;
      if (b === 0xff) { const n = buf[pos]; if (n === 0) pos++; else { pos--; b = 0; } }
      bitBuf = b; bitCnt = 8;
    }
    bitCnt--;
    return (bitBuf >> bitCnt) & 1;
  };
  const bits = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const symbol = (t) => {
    let code = 0;
    for (let len = 1; len <= 16; len++) {
      code = (code << 1) | bit();
      if (t.maxcode[len] >= 0 && code <= t.maxcode[len]) return t.values[t.valptr[len] + code - t.mincode[len]];
    }
    throw new Error('bad JPEG data');
  };
  const extend = (v, n) => (n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  const coef = new Float64Array(64), tmp = new Float64Array(64);
  const block = (c, bx, by) => {
    coef.fill(0);
    const t = symbol(c.dc);
    c.pred += t ? extend(bits(t), t) : 0;
    coef[0] = c.pred * c.q[0];
    for (let k = 1; k < 64;) {
      const rs = symbol(c.ac), s = rs & 15, r = rs >> 4;
      if (s === 0) { if (r === 15) { k += 16; continue; } break; }
      k += r;
      if (k > 63) break;
      coef[ZIGZAG[k]] = extend(bits(s), s) * c.q[ZIGZAG[k]];
      k++;
    }
    // Inverse DCT: columns, then rows.
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += DCT[v * 8 + y] * coef[v * 8 + x]; tmp[y * 8 + x] = s; }
    for (let y = 0; y < 8; y++) {
      const row = (by * 8 + y) * c.stride + bx * 8;
      for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += DCT[u * 8 + x] * tmp[y * 8 + u]; c.plane[row + x] = Math.round(s + 128); }
    }
  };
  let count = 0;
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restartInterval && count && count % restartInterval === 0) {
        bitCnt = 0;
        while (pos < buf.length && !(buf[pos] === 0xff && buf[pos + 1] >= 0xd0 && buf[pos + 1] <= 0xd7)) pos++;
        pos += 2;
        comps.forEach((c) => { c.pred = 0; });
      }
      comps.forEach((c) => { for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) block(c, mx * c.h + h, my * c.v + v); });
      count++;
    }
  }
  const data = new Uint8Array(width * height * 3);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const at = (c) => c.plane[Math.floor((y * c.v) / vmax) * c.stride + Math.floor((x * c.h) / hmax)];
      if (comps.length === 1) { data[o] = data[o + 1] = data[o + 2] = at(comps[0]); continue; }
      const Y = at(comps[0]), cb = at(comps[1]) - 128, cr = at(comps[2]) - 128;
      data[o] = clamp(Math.round(Y + 1.402 * cr));
      data[o + 1] = clamp(Math.round(Y - 0.344136 * cb - 0.714136 * cr));
      data[o + 2] = clamp(Math.round(Y + 1.772 * cb));
    }
  }
  return { width, height, data };
}

// ------------------------------------------------------------------ writer

function scaledQuant(base, quality) {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

// JPEG Annex K.2: code lengths (at most 16 bits) for the symbols of one frequency table; symbol 256 is reserved so no
// real symbol gets the all-ones code. Returns { bits: counts for lengths 1..16, values: symbols by code length }.
function optimalTable(freqIn) {
  const freq = Array.from(freqIn).concat([1]);
  const codesize = new Array(257).fill(0), others = new Array(257).fill(-1);
  for (;;) {
    let c1 = -1, c2 = -1, v = 1e18;
    for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v) { v = freq[i]; c1 = i; }
    v = 1e18;
    for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v && i !== c1) { v = freq[i]; c2 = i; }
    if (c2 < 0) break;
    freq[c1] += freq[c2];
    freq[c2] = 0;
    codesize[c1]++;
    while (others[c1] >= 0) { c1 = others[c1]; codesize[c1]++; }
    others[c1] = c2;
    codesize[c2]++;
    while (others[c2] >= 0) { c2 = others[c2]; codesize[c2]++; }
  }
  const counts = new Array(64).fill(0);
  for (let i = 0; i <= 256; i++) if (codesize[i]) counts[codesize[i]]++;
  for (let i = 63; i > 16; i--) {
    while (counts[i] > 0) {
      let j = i - 2;
      while (counts[j] === 0) j--;
      counts[i] -= 2; counts[i - 1]++; counts[j + 1] += 2; counts[j]--;
    }
  }
  let i = 16;
  while (counts[i] === 0) i--;
  counts[i]--; // the reserved symbol
  const values = [];
  for (let len = 1; len <= 63; len++) for (let s = 0; s < 256; s++) if (codesize[s] === len) values.push(s);
  return { bits: counts.slice(1, 17), values };
}

function codeBook(table) {
  const code = new Array(256).fill(0), size = new Array(256).fill(0);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let n = 0; n < table.bits[len - 1]; n++) { code[table.values[k]] = c; size[table.values[k]] = len; c++; k++; }
    c <<= 1;
  }
  return { code, size };
}

// rgb: array-like of width * height * 3 values (0..255) -> baseline 4:2:0 JPEG Buffer.
function encodeJpeg(rgb, width, height, quality = 80) {
  const W = Math.ceil(width / 16) * 16, H = Math.ceil(height / 16) * 16;
  const Y = new Float64Array(W * H), CB = new Float64Array((W / 2) * (H / 2)), CR = new Float64Array((W / 2) * (H / 2));
  const cw = W / 2;
  for (let y = 0; y < H; y++) {
    const sy = Math.min(y, height - 1);
    for (let x = 0; x < W; x++) {
      const o = (sy * width + Math.min(x, width - 1)) * 3, r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
      Y[y * W + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      const ci = (y >> 1) * cw + (x >> 1);
      CB[ci] += (-0.168736 * r - 0.331264 * g + 0.5 * b) / 4;
      CR[ci] += (0.5 * r - 0.418688 * g - 0.081312 * b) / 4;
    }
  }
  const qLuma = scaledQuant(BASE_LUMA_Q, quality), qChroma = scaledQuant(BASE_CHROMA_Q, quality);
  const mcusX = W / 16, mcusY = H / 16, blocks = [];
  const f = new Float64Array(64), tmp = new Float64Array(64);
  const zigIndex = new Int32Array(64);
  ZIGZAG.forEach((n, i) => { zigIndex[n] = i; });
  const fdct = (plane, stride, bx, by, q) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) f[y * 8 + x] = plane[(by * 8 + y) * stride + bx * 8 + x];
    for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += DCT[u * 8 + x] * f[y * 8 + x]; tmp[y * 8 + u] = s; }
    const out = new Int16Array(64);
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += DCT[v * 8 + y] * tmp[y * 8 + u]; out[zigIndex[v * 8 + u]] = Math.round(s / q[v * 8 + u]); }
    return out;
  };
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      for (let v = 0; v < 2; v++) for (let h = 0; h < 2; h++) blocks.push({ comp: 0, zz: fdct(Y, W, mx * 2 + h, my * 2 + v, qLuma) });
      blocks.push({ comp: 1, zz: fdct(CB, cw, mx, my, qChroma) });
      blocks.push({ comp: 2, zz: fdct(CR, cw, mx, my, qChroma) });
    }
  }
  const category = (v) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };
  // Pass 1: symbol counts. Pass 2: write.
  const dcFreq = [new Array(256).fill(0), new Array(256).fill(0)], acFreq = [new Array(256).fill(0), new Array(256).fill(0)];
  const walk = (emitDc, emitAc) => {
    const pred = [0, 0, 0];
    for (const b of blocks) {
      const t = b.comp ? 1 : 0, z = b.zz, diff = z[0] - pred[b.comp];
      pred[b.comp] = z[0];
      emitDc(t, category(diff), diff);
      let run = 0;
      for (let k = 1; k < 64; k++) {
        if (z[k] === 0) { run++; continue; }
        while (run > 15) { emitAc(t, 0xf0, 0, 0); run -= 16; }
        const s = category(z[k]);
        emitAc(t, (run << 4) | s, s, z[k]);
        run = 0;
      }
      if (run > 0) emitAc(t, 0x00, 0, 0);
    }
  };
  walk((t, s) => { dcFreq[t][s]++; }, (t, sym) => { acFreq[t][sym]++; });
  const tables = { dc: dcFreq.map(optimalTable), ac: acFreq.map(optimalTable) };
  const books = { dc: tables.dc.map(codeBook), ac: tables.ac.map(codeBook) };

  const out = [];
  const push = (...bytes) => { for (const b of bytes) out.push(b); };
  const word = (n) => push(n >> 8, n & 255);
  push(0xff, 0xd8, 0xff, 0xe0); word(16); push(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0); word(1); word(1); push(0, 0);
  [qLuma, qChroma].forEach((q, id) => { push(0xff, 0xdb); word(67); push(id); for (let i = 0; i < 64; i++) push(q[ZIGZAG[i]]); });
  push(0xff, 0xc0); word(17); push(8); word(height); word(width); push(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  [[0, 0, tables.dc[0]], [1, 0, tables.ac[0]], [0, 1, tables.dc[1]], [1, 1, tables.ac[1]]].forEach(([cls, id, t]) => {
    push(0xff, 0xc4); word(19 + t.values.length); push((cls << 4) | id, ...t.bits, ...t.values);
  });
  push(0xff, 0xda); word(12); push(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);
  let acc = 0, accBits = 0;
  const put = (code, size) => {
    acc = (acc << size) | code; accBits += size;
    while (accBits >= 8) {
      const byte = (acc >> (accBits - 8)) & 255;
      out.push(byte);
      if (byte === 0xff) out.push(0);
      accBits -= 8;
    }
    acc &= (1 << accBits) - 1;
  };
  const magnitude = (v, s) => (v >= 0 ? v : v + (1 << s) - 1);
  walk((t, s, diff) => { const bk = books.dc[t]; put(bk.code[s], bk.size[s]); if (s) put(magnitude(diff, s), s); },
    (t, sym, s, v) => { const bk = books.ac[t]; put(bk.code[sym], bk.size[sym]); if (s) put(magnitude(v, s), s); });
  if (accBits) put((1 << (8 - accBits)) - 1, 8 - accBits);
  push(0xff, 0xd9);
  return Buffer.from(out);
}

module.exports = { decodeJpeg, encodeJpeg };
