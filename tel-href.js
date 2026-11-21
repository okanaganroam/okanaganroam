'use strict';
// Sport test 9 (2026-11-21; Gord typed "250-494-9554 ext. 1"): a call link is built from the digits, with the extension
// as a pause ("tel:+12504949554,1"), never the typed text ("tel:250-494-9554 ext. 1" fails on some phones). The shown
// text stays as the owner typed it. Only a number with more than dialling characters is rebuilt; a 10-digit North
// American number then gets +1.
function telHref(phone) {
  const raw = String(phone == null ? '' : phone).trim();
  if (!raw) return 'tel:';
  // A plain number (digits, spaces, dashes, dots, brackets, a +) dials as it is.
  if (/^[+\d\s().-]+$/.test(raw)) return `tel:${raw}`;
  const m = /^(.*?)(?:\s*(?:,|;|#|\bext\.?|\bextension\b|\bx\.?|\bposte\b|\bp\.)\s*(\d{1,6}))\s*$/i.exec(raw);
  const main = m && /\d{7,}/.test(m[1].replace(/\D/g, '')) ? m[1] : raw;
  const ext = m && main === m[1] ? m[2] : '';
  const plus = /^\s*\+/.test(main);
  let d = main.replace(/\D/g, '');
  if (!plus && d.length === 10) d = `+1${d}`;
  else if (!plus && d.length === 11 && d[0] === '1') d = `+${d}`;
  else if (plus) d = `+${d}`;
  return `tel:${d}${ext ? `,${ext}` : ''}`;
}
module.exports = { telHref };
