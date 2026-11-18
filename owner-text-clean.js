'use strict';
// Tour test 11 (Whistler, 2026-11-18; Min-jun dictates his answers on an iPhone: "we take you to joffre lakes comma
// brandywine falls comma shannon falls and squamish period our guides speak english korean and japanese period"). The
// same on every Roam site: nothing here names a place. The place names come from each site's own data (server.js passes
// them in: its towns and its outdoor places).
//
// 1. dictatedPunctuation: the spoken words "comma", "period", "full stop", "question mark", "exclamation mark/point" and
//    "new line" become the marks, but only when the word stands alone as dictation. A conservative rule: never after
//    "a", "the", "our", a number…, never "rental period", "trial period", "grace period" or "period of", "period is".
// 2. knownNameCaps: the names the site knows (its towns and places: "joffre lakes", "squamish", "bc") and language names
//    ("korean", "japanese") get their capitals. Nothing else changes.
// 3. dictationLeftovers / nameMisspellings: what is left for the admin card to flag (never changed automatically).

const DICT_WORD = '(comma|period|full ?stop|question ?mark|exclamation (?:mark|point)|new ?line)';
// Words before a dictation word that make it a noun ("a comma", "the period", "our new line").
const DICT_DET = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'each', 'every', 'any', 'per', 'one', 'our', 'your', 'their', 'its', 'his', 'her', 'my', 'same', 'whole',
  'entire', 'first', 'last', 'next', 'oxford', 'brand', 'no', 'of', 'what', 'which', 'big', 'small', 'short', 'long', 'given', 'set']);
// Words that make "period" (or "full stop") part of a phrase: "rental period", "trial period", "a 2-hour period".
const PERIOD_BEFORE = new Set(['rental', 'trial', 'grace', 'waiting', 'cooling', 'cooling-off', 'booking', 'cancellation', 'cancelation', 'notice', 'refund', 'time', 'holiday',
  'peak', 'busy', 'shoulder', 'blackout', 'billing', 'warranty', 'probation', 'probationary', 'payment', 'deposit', 'minimum', 'maximum', 'free', 'specified', 'hour', 'hours',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'season', 'seasonal', 'school', 'exam', 'lunch', 'break', 'study', 'sales', 'sale', 'introductory', 'promo',
  'promotional', 'offer', 'quiet', 'transition', 'nesting', 'spawning', 'closure', 'closed', 'operating', 'opening', 'historical', 'historic', 'heritage', 'victorian', 'gold', 'rush',
  'ice', 'glacial', 'early', 'late', 'mid', 'off', 'high', 'low', 'summer', 'winter', 'spring', 'fall', 'autumn', 'christmas', 'easter', 'cleanup', 'clean-up', 'training']);
const PERIOD_AFTER = new Set(['of', 'is', 'was', 'are', 'were', 'ends', 'ended', 'end', 'starts', 'started', 'start', 'begins', 'began', 'applies', 'apply', 'lasts', 'last', 'between',
  'during', 'runs', 'when', 'where', 'piece', 'pieces', 'costume', 'costumes', 'furniture', 'style', 'drama', 'dramas', 'film', 'films', 'sign', 'signs', 'pain', 'pains', 'cramps', 'tracker']);
const DICT_MARK = { comma: ',', period: '.', fullstop: '.', questionmark: '?', exclamationmark: '!', exclamationpoint: '!', newline: '\n' };

function dictatedPunctuation(text, opts = {}) {
  const t = String(text == null ? '' : text);
  if (!new RegExp(`\\b${DICT_WORD}\\b`, 'i').test(t)) return t;
  const multi = !!opts.multiline;
  const re = new RegExp(`([A-Za-zÀ-ÿ0-9’'\\)%$-]+)([ \\t]+)${DICT_WORD}(?![A-Za-zÀ-ÿ0-9’'-])`, 'gi');
  let out = t.replace(re, (all, prev, sp, word, off, whole) => {
    const p = prev.toLowerCase().replace(/[’']s$/, '');
    const w = word.toLowerCase().replace(/\s+/g, '');
    if (DICT_DET.has(p) || /^\d/.test(p) || /^[$%]/.test(p)) return all;
    const after = whole.slice(off + all.length);
    const next = (/^[ \t]*([A-Za-zÀ-ÿ’'-]+)/.exec(after) || [])[1];
    const nextL = next ? next.toLowerCase() : '';
    if (w === 'period' || w === 'fullstop') {
      if (PERIOD_BEFORE.has(p) || /-(?:hour|day|week|month|year)s?$/.test(p) || PERIOD_AFTER.has(nextL)) return all;
    }
    if (w === 'newline' && ['of', 'up', 'is', 'was'].includes(nextL)) return all;
    const mark = DICT_MARK[w];
    if (mark === '\n') return `${prev}${multi ? '\n' : '. '}`;
    return `${prev}${mark}`;
  });
  // The marks themselves, tidied: no space before a mark, one mark (",." -> "."), a space after one before a word.
  out = out.replace(/[ \t]+([,.!?])/g, '$1').replace(/,(?=[.!?])/g, '').replace(/([.!?])[,.](?!\.)/g, '$1').replace(/,{2,}/g, ',')
    .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/^[\s,.]+/, '').trim();
  return out;
}

// Dictation words still standing alone after the rule (for the admin card): "rental period" is not one.
function dictationLeftovers(text) {
  const t = String(text || '');
  const out = [];
  const re = new RegExp(`(?:^|[^A-Za-zÀ-ÿ])${DICT_WORD}(?![A-Za-zÀ-ÿ])`, 'gi');
  let m;
  while ((m = re.exec(t))) {
    const word = m[1].toLowerCase();
    // One the rule kept on purpose ("rental period", "a comma") isn't a leftover.
    const before = t.slice(0, m.index + (m[0].length - m[1].length)).trim().split(/\s+/).pop() || '';
    if (dictatedPunctuation(`${before} ${m[1]} x`) === `${before} ${m[1]} x`) continue;
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

// Language names (English text only: French writes « coréen » in lower case).
const LANGUAGE_NAMES = ['English', 'French', 'Korean', 'Japanese', 'Mandarin', 'Cantonese', 'Chinese', 'German', 'Spanish', 'Italian', 'Portuguese', 'Punjabi', 'Hindi', 'Tagalog',
  'Dutch', 'Russian', 'Vietnamese', 'Swiss', 'Australian', 'Canadian', 'American', 'British', 'European', 'Asian', 'Indigenous'];
// Common words that are part of place names ("Lost Lake", "Green Lake", "Rainbow Falls"): never capitalized alone.
const PLACE_COMMON_WORDS = new Set(['lost', 'green', 'rainbow', 'lava', 'swim', 'ring', 'echo', 'iceberg', 'alpine', 'black', 'blue', 'red', 'white', 'high', 'upper', 'lower', 'long', 'twin',
  'crooked', 'smoke', 'four', 'hut', 'meadow', 'meadows', 'park', 'lake', 'lakes', 'falls', 'river', 'creek', 'mountain', 'valley', 'beach', 'cove', 'bay', 'point', 'trail', 'loop', 'harmony',
  'conflict', 'screaming', 'singing', 'cat', 'wonderland', 'lakeside', 'riverside', 'sea', 'sky', 'big', 'little', 'old', 'new', 'north', 'south', 'east', 'west', 'grand', 'golden',
  'silver', 'diamond', 'shadow', 'spruce', 'cedar', 'pine', 'birch', 'eagle', 'eagles', 'bear', 'beaver', 'fawn', 'hidden', 'secret', 'sunset', 'sunrise', 'lookout', 'view', 'centre',
  'center', 'community', 'village', 'town', 'mount', 'mt', 'the', 'and', 'of', 'to', 'at', 'on', 'in', 'one', 'mile', 'train', 'wreck', 'olympic', 'brew', 'fowl', 'hanging', 'rohr',
  'wedge', 'gate', 'tunnel', 'canyon', 'gorge', 'bridge', 'island', 'islands', 'peak', 'peaks', 'ridge', 'glacier', 'pass', 'flats', 'wetlands', 'forest', 'garden', 'gardens',
  'square', 'plaza', 'market', 'hill', 'hills', 'head', 'bluffs', 'chief', 'lovely', 'water', 'ponds', 'pond', 'rampart', 'skate', 'bike', 'climbing', 'walls', 'area', 'site',
  'recreation', 'provincial', 'regional', 'nature', 'interpretive', 'wilderness', 'campground', 'viewing', 'run', 'hot', 'springs', 'spring', 'cultural', 'museum', 'gallery']);
const PLACE_SUFFIX_RE = /\s+(?:provincial park|regional park|recreation site|recreation area|interpretive forest|campground|community park|nature trail|trails?|loop(?: trail)?|viewing area|day[- ]use area|area|park)$/i;
// "Joffre Lakes Provincial Park (Pipi7íyekw)" -> "Joffre Lakes"; "Sea to Sky Trail: Lost Lake to Parkhurst" -> null.
function placeCoreName(name) {
  let n = String(name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
  if (/[:/&]/.test(n) || /\bto\b/i.test(n)) return null;
  for (let i = 0; i < 3; i++) n = n.replace(PLACE_SUFFIX_RE, '').trim();
  if (!n || n.length < 4 || !/^[A-Z]/.test(n)) return null;
  return n;
}
// The names a site knows, from its own data: { phrases: ['Joffre Lakes', ...], words: ['Joffre', 'Squamish', ...] }.
// `places`: outdoor place names; `towns`: town names; `lowerSeen(word)`: true when the site's own text uses the word in
// lower case (then it is an ordinary word, like "green").
function buildKnownNames(places, towns, lowerSeen = () => false) {
  const phrases = new Set(), words = new Set(['BC']);
  for (const t of towns || []) { const s = String(t || '').trim(); if (!s) continue; if (/\s/.test(s)) phrases.add(s); else words.add(s); for (const w of s.split(/\s+/)) if (w.length >= 5 && !PLACE_COMMON_WORDS.has(w.toLowerCase())) words.add(w); }
  for (const p of places || []) {
    const c = placeCoreName(p);
    if (!c) continue;
    const ws = c.split(/\s+/);
    if (ws.length >= 2 && ws.length <= 4 && ws.every((w) => /^[A-Z0-9]/.test(w) || /^(?:of|to|the|and)$/.test(w))) phrases.add(c);
    const first = ws[0];
    if (ws.length >= 2 && first.length >= 5 && /^[A-Z][a-z]+$/.test(first) && !PLACE_COMMON_WORDS.has(first.toLowerCase()) && !lowerSeen(first.toLowerCase())) words.add(first);
  }
  return { phrases: [...phrases].sort((a, b) => b.length - a.length), words: [...words] };
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The names given their capitals ("joffre lakes" -> "Joffre Lakes", "bc parks" -> "BC parks", "korean" -> "Korean").
function knownNameCaps(text, known, opts = {}) {
  let t = String(text == null ? '' : text);
  if (!t) return t;
  const k = known || { phrases: [], words: ['BC'] };
  const fix = (name) => {
    const re = new RegExp(`(?<![A-Za-zÀ-ÿ’'@#./-])${escRe(name).replace(/\\? /g, '\\s+')}(?![A-Za-zÀ-ÿ’'-])`, 'gi');
    // Only words typed all lower case or with just a first capital ("joffre lakes", "Joffre lakes"); "JOFFRE" stays.
    t = t.replace(re, (m) => (m.split(/\s+/).every((w) => w === w.toLowerCase() || w === w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) ? m.replace(/\S+/g, (w, o) => name.split(/\s+/)[m.slice(0, o).split(/\s+/).length - 1] || w) : m));
  };
  for (const p of k.phrases || []) fix(p);
  for (const w of k.words || []) fix(w);
  if (!opts.fr) for (const w of LANGUAGE_NAMES) fix(w);
  return t;
}

// Damerau-free edit distance, small words only.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Close misspellings of a known place ("Jeffrey lakes" -> Joffre Lakes): [{ said, name }]. Only a word of five letters or
// more with the same first letter, one or two letters off; for a place of two words, the next word must be its second
// word ("lakes"). Flagged on the admin card, never changed.
function nameMisspellings(text, known) {
  const t = String(text || '');
  const k = known || { phrases: [], words: [] };
  const out = [];
  const tokens = [...t.matchAll(/[A-Za-zÀ-ÿ’']+/g)].map((m) => m[0]);
  const lowerKnown = new Set([...(k.words || []), ...(k.phrases || []).flatMap((p) => p.split(/\s+/))].map((w) => w.toLowerCase()));
  const seen = new Set();
  const targets = [...(k.phrases || []).map((p) => p.split(/\s+/)), ...(k.words || []).map((w) => [w])].filter((ws) => ws[0].length >= 5);
  for (let i = 0; i < tokens.length; i++) {
    // Tour test 12: a possessive or a quote mark is not part of the word ("Whistler's" is Whistler).
    const w = tokens[i].toLowerCase().replace(/[’']s$/, '').replace(/^[’']+|[’']+$/g, '');
    if (w.length < 5 || lowerKnown.has(w) || LANGUAGE_NAMES.some((x) => x.toLowerCase() === w)) continue;
    for (const ws of targets) {
      const head = ws[0].toLowerCase();
      if (head[0] !== w[0]) continue;
      const dist = editDistance(w, head);
      if (dist === 0 || dist > (head.length >= 6 ? 2 : 1)) continue;
      if (ws.length > 1) {
        const nx = (tokens[i + 1] || '').toLowerCase().replace(/s$/, '');
        if (nx !== ws[1].toLowerCase().replace(/s$/, '')) continue;
      } else if (head.length < 6) continue;
      const name = ws.join(' ');
      const said = ws.length > 1 ? `${tokens[i]} ${tokens[i + 1]}` : tokens[i];
      if (!seen.has(said.toLowerCase())) { seen.add(said.toLowerCase()); out.push({ said, name }); }
      break;
    }
  }
  return out;
}

// Tour test 12 (Whistler, 2026-11-18; Kayla pastes her Instagram captions: "160ft canyon jump 🤯 #sendit", "online waiver
// b4 you arrive!! Closed in high winds ⚠️ #safetyfirst", "bday groups get 10% off 🎉 DM us"). The same on every Roam site.
// socialTidy: a run of #hashtags at the end of a line goes (every text); on the short live lines (Known for, Good to know,
// Groups, tour names, the meeting point) the decorative emojis go too, "b4" becomes "before" and "!!" one "!". The story
// and tour descriptions keep their emojis except a run at the very end of a line (conservative). "DM us" stays (flagged).
const EMOJI_RE = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|(?![©®™‼⁉])\p{Extended_Pictographic})(?:️|‍(?:\p{Extended_Pictographic})?|[\u{1F3FB}-\u{1F3FF}]|⃣)*/gu;
const TRAIL_TAGS_RE = /(?:[ \t]*[,;·•|-]?[ \t]*#[\p{L}][\p{L}\p{N}_]*)+[ \t]*$/u;
function socialTidy(text, opts = {}) {
  let t = String(text == null ? '' : text);
  if (!t) return t;
  const short = !!opts.short;
  const lines = t.split('\n').map((line) => {
    let l = line;
    const was = line;
    if (short) l = l.replace(EMOJI_RE, ' ').replace(/[️‍]/g, '');
    // The hashtags (and decorative emojis after them) at the end of the line; a line of hashtags only goes.
    for (let i = 0; i < 3; i++) {
      const before = l;
      l = l.replace(new RegExp(`(?:[ \\t]*${EMOJI_RE.source})+[ \\t]*$`, 'u'), (m) => (short || /#/.test(before) || i > 0 || !opts.keepTrailingEmoji ? '' : m));
      l = l.replace(TRAIL_TAGS_RE, '');
      if (l === before) break;
    }
    if (short) {
      l = l.replace(/\bb4\b/gi, (m) => (m === 'B4' ? 'Before' : m.charAt(0) === 'B' ? 'Before' : 'before')).replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?');
    }
    // Only a line we changed is tidied (French keeps its space before « : » and « ? »).
    if (l === was) return l;
    return l.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.)])/g, '$1').replace(/\([ \t]+/g, '(').replace(/[ \t]+$/, '').replace(/^[ \t]+/, '');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// What is still there for the admin card: { hashtags: ['#sendit'], emojis: true, dm: true } (empty parts left out).
function socialFlags(text) {
  const t = String(text || '');
  const out = {};
  const tags = [...new Set((t.match(/(?:^|[^\p{L}\p{N}_&/#])(#[\p{L}][\p{L}\p{N}_]*)/gu) || []).map((m) => m.replace(/^[^#]*/, '')))];
  if (tags.length) out.hashtags = tags;
  if ((t.match(EMOJI_RE) || []).length) out.emojis = true;
  if (/\b(?:DM|dm|Dm)\s+(?:us|me)\b|\bslide (?:into|in) (?:our|my) DMs?\b|\blink in (?:our )?bio\b/i.test(t)) out.dm = true;
  if (/\bb4\b/i.test(t)) out.b4 = true;
  return out;
}

module.exports = { socialTidy, socialFlags, EMOJI_RE, dictatedPunctuation, dictationLeftovers, knownNameCaps, buildKnownNames, placeCoreName, nameMisspellings, editDistance, LANGUAGE_NAMES, PLACE_COMMON_WORDS };
