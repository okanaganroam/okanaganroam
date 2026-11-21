'use strict';
// "This weekend" email list (2026-11-16). Visitors leave their email in a small box on What's On and the homepage, confirm
// it from a link (double opt-in, CASL), and get one email on Thursdays listing Friday to Sunday's events from the What's On
// data. Dayton presses Send on /admin/weekend-email; nothing is sent on a timer.
//
// SEO freeze: every page here (confirm, unsubscribe, the no-JS "check your inbox" page, the admin page) is noindex by
// header and meta tag, is not in the sitemap, llms.txt or the page inventory, and is only reached from an email or a form.
//
// server.js supplies the parts that live there (the database, the weekend's events, the email sender, the request
// helpers); this file holds the list itself, the emails and the small pages.
const crypto = require('crypto');

const SITE = 'https://okanaganroam.com';
const CONTACT = 'info@okanaganroam.com';
const SOURCES = new Set(['whats-on', 'home']);
const MAX_EVENTS = 18;
const IP_LIMIT = 5; // sign-ups per IP per hour
const IP_WINDOW_MS = 60 * 60 * 1000;
const CONFIRM_RESEND_MINUTES = 10; // a second sign-up within this time sends no second confirmation email
const MAX_BODY_BYTES = 2048;
const EMAIL_MAX = 254;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Lower-case hex, so the site's lower-case page redirect never touches a link.
const newToken = () => crypto.randomBytes(16).toString('hex');
const TOKEN_RE = /^[a-f0-9]{32}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const monthDay = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

const TEXT = {
  en: {
    thanks: 'Almost done: check your inbox for a link to confirm. (Not there? Look in spam or promotions.)',
    badEmail: 'Please enter a valid email address, like name@example.com.',
    rate: 'Too many sign-ups from here just now. Please try again in an hour.',
    origin: 'Sign-ups are only accepted from the Okanagan Roam website.',
    generic: 'Sorry, something went wrong. Please try again.',
    confirmSubject: 'Confirm your Okanagan Roam weekend email',
    confirmBody: (url) => ['Hi,', '', 'Someone (hopefully you) asked for the free Okanagan Roam weekend email: this weekend’s events, every Thursday.', '',
      'To start getting it, confirm your address here:', url, '',
      'If you didn’t ask for this, ignore this email and you won’t hear from us.'],
    confirmPageTitle: 'Confirm your weekend email',
    confirmPageBody: 'One more tap and you’ll get this weekend’s events every Thursday.',
    confirmButton: 'Yes, send me the weekend email',
    confirmedTitle: 'You’re on the list',
    confirmedBody: 'Thanks! Your first weekend email arrives on a Thursday. Every email has an unsubscribe link.',
    usedTitle: 'This link has already been used',
    usedBody: 'If you already confirmed, you’re all set. Otherwise, sign up again on the What’s On page.',
    unsubTitle: 'You’re unsubscribed',
    unsubBody: 'You won’t get the Okanagan Roam weekend email any more. Changed your mind? Sign up again on the What’s On page.',
    unknownTitle: 'We couldn’t find that link',
    unknownBody: `To stop the weekend email, reply “unsubscribe” to any of them, or email ${CONTACT}.`,
    backLink: 'See what’s on',
  },
  fr: {
    thanks: 'Presque fini : un lien de confirmation vous attend dans votre boîte de réception. (Introuvable? Regardez dans les indésirables ou les promotions.)',
    badEmail: 'Entrez une adresse courriel valide, comme nom@exemple.com.',
    rate: 'Trop d’inscriptions d’ici pour le moment. Réessayez dans une heure.',
    origin: 'Les inscriptions ne sont acceptées que depuis le site Okanagan Roam.',
    generic: 'Désolés, une erreur est survenue. Réessayez.',
    confirmSubject: 'Confirmez votre courriel de la fin de semaine Okanagan Roam',
    confirmBody: (url) => ['Bonjour,', '', 'Quelqu’un (vous, nous l’espérons) a demandé le courriel gratuit de la fin de semaine d’Okanagan Roam : les événements de la fin de semaine, chaque jeudi.', '',
      'Pour commencer à le recevoir, confirmez votre adresse ici :', url, '',
      'Si vous n’avez rien demandé, ignorez ce courriel : vous n’entendrez plus parler de nous.'],
    confirmPageTitle: 'Confirmez votre courriel de la fin de semaine',
    confirmPageBody: 'Encore un geste et vous recevrez les événements de la fin de semaine chaque jeudi.',
    confirmButton: 'Oui, envoyez-moi le courriel de la fin de semaine',
    confirmedTitle: 'Vous êtes inscrit',
    confirmedBody: 'Merci! Votre premier courriel arrivera un jeudi. Chaque courriel contient un lien de désabonnement.',
    usedTitle: 'Ce lien a déjà été utilisé',
    usedBody: 'Si vous avez déjà confirmé, tout est réglé. Sinon, inscrivez-vous de nouveau sur la page Quoi faire.',
    unsubTitle: 'Vous êtes désabonné',
    unsubBody: 'Vous ne recevrez plus le courriel de la fin de semaine d’Okanagan Roam. Vous avez changé d’idée? Inscrivez-vous de nouveau sur la page Quoi faire.',
    unknownTitle: 'Lien introuvable',
    unknownBody: `Pour ne plus recevoir le courriel de la fin de semaine, répondez « unsubscribe » à l’un d’eux ou écrivez à ${CONTACT}.`,
    backLink: 'Voir ce qui se passe',
  },
};
const T = (lang) => TEXT[lang === 'fr' ? 'fr' : 'en'];
// The bookable pick's words (the email is in English). The commission line is the site's own (places-to-stay.js).
const BOOK_TEXT = {
  heading: 'Book something this weekend',
  disclosure: require('./places-to-stay').DISCLOSURE.en,
};

// The box on What's On and the homepage. Plain English markup: the /fr twins translate it through french-text.js. Fixed
// height content rendered with the page (no layout shift), a few lines of CSS and a small inline script, no bundle.
function signupBoxHtml(source) {
  const src = SOURCES.has(source) ? source : 'whats-on';
  return `<section class="wk-signup" aria-labelledby="wkSignupTitle-${src}">
<style>.wk-signup{margin:24px 0;padding:18px 20px;border-radius:14px;background:#f1ecde;border:1px solid #e0d8c3;color:#1b2e39}.wk-signup h2{font-size:1.15rem;line-height:1.3;margin:0 0 4px}.wk-signup p{margin:0;font-size:.92rem}.wk-signup form{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px}.wk-signup input[type=email]{flex:1 1 220px;min-width:0;min-height:44px;padding:8px 12px;border:1px solid #c9c1aa;border-radius:8px;font:inherit;font-size:16px;background:#fff}.wk-signup button{min-height:44px;padding:8px 18px;border:0;border-radius:22px;background:#1b2e39;color:#fff;font:inherit;font-weight:700;cursor:pointer}.wk-signup .wk-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.wk-signup .wk-note{font-size:.82rem;color:#55646a}.wk-signup .wk-msg{font-weight:700;margin-top:6px}.wk-signup .wk-msg:empty{display:none}#homeSimple .wk-signup h2{font-size:1.15rem;margin:0 0 4px}#homeSimple .wk-signup p{font-size:.92rem}</style>
<h2 id="wkSignupTitle-${src}">Get this weekend’s events every Thursday</h2>
<p>A free email with what’s on Friday to Sunday across the Okanagan.</p>
<form class="wk-form" action="/api/weekend-email" method="post" novalidate>
<input type="email" id="wkEmail-${src}" name="email" required maxlength="254" autocomplete="email" inputmode="email" placeholder="Your email" aria-label="Your email">
<span class="wk-hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></span>
<input type="hidden" name="source" value="${src}">
<button type="submit">Sign me up</button>
</form>
<p class="wk-note">We’ll email you once a week. Unsubscribe anytime.</p>
<p class="wk-msg" role="status" aria-live="polite"></p>
<script>(function(){var s=document.currentScript.parentNode,f=s.querySelector('form'),m=s.querySelector('.wk-msg');if(!f||!window.fetch)return;f.addEventListener('submit',function(e){e.preventDefault();var fr=document.documentElement.lang==='fr',b=f.querySelector('button');b.disabled=true;fetch('/api/weekend-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,website:f.website.value,source:f.source.value,lang:fr?'fr':'en'})}).then(function(r){return r.json();}).then(function(d){m.textContent=d.message||d.error||'';if(d.ok)f.hidden=true;}).catch(function(){m.textContent=fr?'Désolés, une erreur est survenue. Réessayez.':'Sorry, something went wrong. Please try again.';}).then(function(){b.disabled=false;});});})();</script>
</section>`;
}

// A small standalone page: noindex in the markup (the routes add the header), no site chrome, no scripts.
function simplePage({ title, body, lang = 'en', extra = '' }) {
  return `<!DOCTYPE html>
<html lang="${lang === 'fr' ? 'fr' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} | Okanagan Roam</title>
<style>body{margin:0;background:#f8f5ed;color:#1b2e39;font:16px/1.55 Arial,sans-serif}main{max-width:560px;margin:0 auto;padding:40px 20px 56px}a{color:#1b2e39}.logo{font:700 20px Georgia,serif;text-decoration:none}h1{font-family:Georgia,serif;font-size:1.7rem;line-height:1.25;margin:28px 0 10px}button{min-height:44px;padding:10px 20px;border:0;border-radius:22px;background:#1b2e39;color:#fff;font:inherit;font-weight:700;cursor:pointer}</style>
</head>
<body><main>
<a class="logo" href="${lang === 'fr' ? '/fr' : '/'}">OKANAGAN ROAM</a>
<h1>${esc(title)}</h1>
<p>${esc(body)}</p>
${extra}
<p><a href="${lang === 'fr' ? '/fr/whats-on' : '/whats-on'}">${esc(T(lang).backLink)}</a></p>
</main></body></html>`;
}

const NOINDEX_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function create(deps) {
  const { db, weekendEvents, getSender, isSameOrigin, clientIp, emailPattern } = deps;
  // bookingPick(friday) (server.js, tour-picks.js): one in-season Viator product for that weekend, or null (Viator off,
  // nothing fits). { code, title, business, photo (the business's own photo on our site; required), pagePath }.
  const bookingPick = typeof deps.bookingPick === 'function' ? deps.bookingPick : () => null;
  const env = deps.env || process.env;
  const ipHits = new Map();
  const inflight = new Set();
  let sendDelayMs = deps.sendDelayMs == null ? 300 : deps.sendDelayMs; // about three a second
  let sending = null; // { weekend, started } while a send runs

  const track = (p) => { inflight.add(p); p.finally(() => inflight.delete(p)); return p; };
  const mailingAddress = () => String(env.NEWSLETTER_MAILING_ADDRESS || '').trim();

  function ipLimited(ip, now = Date.now()) {
    const recent = (ipHits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
    recent.push(now);
    ipHits.set(ip, recent);
    if (ipHits.size > 5000) for (const [k, v] of ipHits) if (!v.some((t) => now - t < IP_WINDOW_MS)) ipHits.delete(k);
    return recent.length > IP_LIMIT;
  }

  // ---- The list ----
  function statusOf(row) {
    if (!row) return null;
    if (row.unsubscribed_at) return 'unsubscribed';
    return row.confirmed_at ? 'confirmed' : 'pending';
  }

  // Stores the address (unconfirmed) and, when there is something to confirm, emails the link. The answer is the same
  // whatever the address's state, so the form never tells anyone who is on the list.
  function subscribe(rawEmail, { source = 'whats-on', lang = 'en', now = new Date() } = {}) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || email.length > EMAIL_MAX || /[\u0000-\u001F\u007F\s]/.test(email) || !emailPattern.test(email)) return { ok: false, error: 'badEmail' };
    const src = SOURCES.has(source) ? source : 'whats-on';
    const lg = lang === 'fr' ? 'fr' : 'en';
    const row = db.prepare('SELECT * FROM weekend_email_subscribers WHERE email = ?').get(email);
    const state = statusOf(row);
    if (state === 'confirmed') return { ok: true, action: 'none' };
    let token;
    if (!row) {
      token = newToken();
      db.prepare('INSERT INTO weekend_email_subscribers (email, lang, source, confirm_token, unsubscribe_token) VALUES (?, ?, ?, ?, ?)').run(email, lg, src, token, newToken());
    } else if (state === 'unsubscribed') {
      // Back after unsubscribing: confirmed again from a new link before anything is sent.
      token = newToken();
      db.prepare('UPDATE weekend_email_subscribers SET confirm_token = ?, confirmed_at = NULL, unsubscribed_at = NULL, confirm_sent_at = NULL, lang = ?, source = ? WHERE id = ?').run(token, lg, src, row.id);
    } else {
      const recent = row.confirm_sent_at && Date.parse(`${row.confirm_sent_at.replace(' ', 'T')}Z`) > now.getTime() - CONFIRM_RESEND_MINUTES * 60000;
      if (recent) return { ok: true, action: 'none' };
      token = row.confirm_token || newToken();
      db.prepare('UPDATE weekend_email_subscribers SET confirm_token = ?, lang = ? WHERE id = ?').run(token, lg, row.id);
    }
    db.prepare('UPDATE weekend_email_subscribers SET confirm_sent_at = CURRENT_TIMESTAMP WHERE email = ?').run(email);
    track(sendConfirmation(email, token, lg).catch((e) => console.error('[weekend-email] confirmation failed:', e.message)));
    return { ok: true, action: 'confirm_sent' };
  }

  function footerLines() {
    const addr = mailingAddress();
    return ['—', `Okanagan Roam · ${CONTACT} · okanaganroam.com`, ...(addr ? [addr] : [])];
  }

  async function sendConfirmation(email, token, lang) {
    const send = getSender();
    if (!send) { console.warn('[weekend-email] email is off (no BREVO_API_KEY): confirmation not sent'); return 'email_off'; }
    const t = T(lang);
    const url = `${SITE}/weekend-email/confirm/${token}`;
    const text = [...t.confirmBody(url), '', ...footerLines()].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.55;color:#1b2e39;max-width:560px">${t.confirmBody(url).map((l) => (l === url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#1b2e39;color:#fff;padding:10px 18px;border-radius:22px;text-decoration:none;font-weight:700">${lang === 'fr' ? 'Confirmer mon adresse' : 'Confirm my address'}</a></p>` : l ? `<p>${esc(l)}</p>` : '')).join('')}<p style="font-size:13px;color:#55646a">${footerLines().slice(1).map(esc).join('<br>')}</p></div>`;
    await send({ to: email, subject: t.confirmSubject, text, html, replyTo: CONTACT });
    return 'sent';
  }

  function rowByConfirmToken(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    return db.prepare('SELECT * FROM weekend_email_subscribers WHERE confirm_token = ?').get(token) || null;
  }
  function confirm(token) {
    const row = rowByConfirmToken(token);
    if (!row || row.unsubscribed_at) return null;
    db.prepare('UPDATE weekend_email_subscribers SET confirmed_at = CURRENT_TIMESTAMP, confirm_token = NULL WHERE id = ?').run(row.id);
    return { ...row, confirmed: true };
  }
  function unsubscribe(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const row = db.prepare('SELECT * FROM weekend_email_subscribers WHERE unsubscribe_token = ?').get(token);
    if (!row) return null;
    if (!row.unsubscribed_at) db.prepare('UPDATE weekend_email_subscribers SET unsubscribed_at = CURRENT_TIMESTAMP, confirm_token = NULL WHERE id = ?').run(row.id);
    return row;
  }

  function counts() {
    const rows = db.prepare(`SELECT source,
        SUM(CASE WHEN unsubscribed_at IS NULL AND confirmed_at IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN unsubscribed_at IS NULL AND confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed
      FROM weekend_email_subscribers GROUP BY source ORDER BY source`).all();
    const total = { pending: 0, confirmed: 0, unsubscribed: 0 };
    for (const r of rows) for (const k of Object.keys(total)) total[k] += r[k] || 0;
    return { total, bySource: rows.map((r) => ({ source: r.source || 'unknown', pending: r.pending || 0, confirmed: r.confirmed || 0, unsubscribed: r.unsubscribed || 0 })) };
  }

  // ---- The digest ----
  // Picks up to MAX_EVENTS: holiday markets, markets and fairs, free and family events first, then by date; grouped by day.
  function buildDigest(now = new Date()) {
    const { from, to, events } = weekendEvents(now);
    const weekend = to ? addDays(to, -2) : from; // the Friday: one key for the whole weekend, whatever day it is sent
    const score = (e) => (e.categories.includes('holiday-seasonal') ? 3 : 0) + (e.categories.includes('markets-fairs') ? 2 : 0)
      + (e.free ? 2 : 0) + (e.categories.includes('family-kids') ? 2 : 0);
    const ranked = events.map((e, i) => ({ e, i, s: score(e) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, MAX_EVENTS).map((x) => x.e);
    const campaign = `weekend-${weekend}`;
    const byDay = new Map();
    for (const e of ranked) {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day).push({ ...e, url: `${SITE}${e.path}?utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}` });
    }
    const days = [...byDay.keys()].sort().map((d) => ({
      date: d,
      label: `${DAYS[dayOf(d)]}, ${monthDay(d)}`,
      events: byDay.get(d).sort((a, b) => String(a.sortTime).localeCompare(String(b.sortTime)) || a.name.localeCompare(b.name)),
    }));
    const range = from && to ? (from.slice(0, 7) === to.slice(0, 7) ? `${monthDay(from)}–${Number(to.slice(8, 10))}` : `${monthDay(from)} – ${monthDay(to)}`) : '';
    // "Book something this weekend" (2026-11-21): one Viator pick before the footer. Book now goes through our own
    // /weekend-email/book/<code> page (counted in Analytics with these tags, then on to Viator); the business's name
    // and photo go to its page on our site.
    let book = null;
    try { book = weekend ? bookingPick(weekend) : null; } catch (e) { book = null; }
    // Never a box without the business's own photo.
    if (book && book.code && book.title && book.photo && /^(?:https:\/\/|\/images\/)[^\s"'<>()]+$/.test(book.photo)) {
      const tags = `utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}&utm_content=book-pick`;
      const abs = (p) => (/^https:\/\//.test(p) ? p : `${SITE}${p}`);
      book = {
        title: String(book.title), business: String(book.business || ''),
        photo: book.photo && /^(?:https:\/\/|\/images\/)[^\s"'<>()]+$/.test(book.photo) ? abs(book.photo) : null,
        pageUrl: book.pagePath && /^\/[a-z0-9/_-]+$/.test(book.pagePath) ? `${SITE}${book.pagePath}?${tags}` : null,
        bookUrl: `${SITE}/weekend-email/book/${encodeURIComponent(String(book.code).toLowerCase())}?${tags}`,
      };
    } else book = null;
    return {
      weekend, from, to, campaign, days, count: ranked.length, totalFound: events.length, book,
      subject: `This weekend in the Okanagan: ${range}`,
      whatsOnUrl: `${SITE}/whats-on?when=this-weekend&utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}`,
    };
  }
  function addDays(d, n) { return new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }

  function digestText(dg, unsubUrl) {
    const lines = [`This weekend in the Okanagan`, `${dg.count} picks for Friday to Sunday from Okanagan Roam’s What’s On.`, ''];
    for (const d of dg.days) {
      lines.push(d.label.toUpperCase(), '');
      for (const e of d.events) {
        lines.push(`* ${e.name}${e.free ? ' (free)' : ''}`);
        const meta = [e.time, e.place].filter(Boolean).join(' · ');
        if (meta) lines.push(`  ${meta}`);
        if (e.also) lines.push(`  ${e.also}`);
        lines.push(`  ${e.url}`, '');
      }
    }
    lines.push(`Everything on this weekend: ${dg.whatsOnUrl}`, '');
    if (dg.book) {
      lines.push(BOOK_TEXT.heading.toUpperCase(), '', `* ${dg.book.title}${dg.book.business ? ` (${dg.book.business})` : ''}`, `  Book now: ${dg.book.bookUrl}`, `  ${BOOK_TEXT.disclosure}`, '');
    }
    lines.push(...digestFooterText(unsubUrl));
    return lines.join('\n');
  }
  function digestFooterText(unsubUrl) {
    const addr = mailingAddress();
    return ['—', 'You’re getting this because you signed up for the Okanagan Roam weekend email on okanaganroam.com and confirmed your address.',
      `Unsubscribe in one click: ${unsubUrl}`, 'Or reply “unsubscribe” to stop.', '',
      `Okanagan Roam · ${CONTACT}`, addr || '[Mailing address missing: set NEWSLETTER_MAILING_ADDRESS]'];
  }
  // The one bookable pick: its photo (our own copy of the business's photo, if any), one line, Book now, the commission line.
  function bookHtml(b) {
    if (!b) return '';
    const name = b.pageUrl ? `<a href="${esc(b.pageUrl)}" style="color:#1b2e39">${esc(b.business)}</a>` : esc(b.business);
    const img = b.photo ? `${b.pageUrl ? `<a href="${esc(b.pageUrl)}">` : ''}<img src="${esc(b.photo)}" alt="${esc(b.business)}" width="568" style="display:block;width:100%;max-width:568px;height:auto;border-radius:10px;margin:0 0 10px">${b.pageUrl ? '</a>' : ''}` : '';
    return `<div class="wk-book" style="margin:8px 0 24px;padding:14px 16px;background:#fff;border:1px solid #e0d8c3;border-radius:12px">
<h2 style="font-family:Georgia,serif;font-size:19px;margin:0 0 10px;color:#1b2e39">${esc(BOOK_TEXT.heading)}</h2>
${img}<p style="margin:0 0 10px;font-size:15px"><strong>${esc(b.title)}</strong>${b.business ? ` · ${name}` : ''}</p>
<p style="margin:0 0 8px"><a href="${esc(b.bookUrl)}" rel="sponsored noopener" style="display:inline-block;border:1px solid #1b2e39;color:#1b2e39;padding:8px 16px;border-radius:22px;text-decoration:none;font-weight:700">Book now ↗</a></p>
<p style="margin:0;font-size:12px;color:#55646a">${esc(BOOK_TEXT.disclosure)}</p>
</div>
`;
  }
  // The email body's inner part, also shown as the admin preview.
  function digestInnerHtml(dg, unsubUrl) {
    const addr = mailingAddress();
    const dayHtml = dg.days.map((d) => `<h2 style="font-family:Georgia,serif;font-size:19px;margin:26px 0 8px;color:#1b2e39;border-bottom:2px solid #dcc27d;padding-bottom:4px">${esc(d.label)}</h2>
${d.events.map((e) => `<p style="margin:0 0 14px"><a href="${esc(e.url)}" style="font-weight:700;font-size:16px;color:#1b2e39">${esc(e.name)}</a>${e.free ? ' <span style="font-size:12px;font-weight:700;color:#2f6b3f;background:#e6f2e8;border-radius:10px;padding:1px 7px">Free</span>' : ''}<br><span style="font-size:14px;color:#55646a">${esc([e.time, e.place].filter(Boolean).join(' · '))}${e.also ? `<br>${esc(e.also)}` : ''}</span></p>`).join('\n')}`).join('\n');
    return `<div style="max-width:600px;margin:0 auto;padding:20px 16px;font-family:Arial,sans-serif;color:#1b2e39;line-height:1.5">
<p style="font:700 18px Georgia,serif;margin:0 0 4px">OKANAGAN ROAM</p>
<h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.25;margin:8px 0 4px">This weekend in the Okanagan</h1>
<p style="margin:0;color:#55646a;font-size:15px">${esc(`${dg.count} picks for Friday to Sunday from What’s On.`)}</p>
${dayHtml}
<p style="margin:24px 0"><a href="${esc(dg.whatsOnUrl)}" style="display:inline-block;background:#1b2e39;color:#fff;padding:10px 18px;border-radius:22px;text-decoration:none;font-weight:700">Everything on this weekend</a></p>
${bookHtml(dg.book)}<hr style="border:0;border-top:1px solid #e0d8c3;margin:24px 0 12px">
<p style="font-size:13px;color:#55646a;margin:0 0 8px">You’re getting this because you signed up for the Okanagan Roam weekend email on okanaganroam.com and confirmed your address.</p>
<p style="font-size:13px;color:#55646a;margin:0 0 8px"><a href="${esc(unsubUrl)}" style="color:#55646a">Unsubscribe in one click</a>, or reply “unsubscribe” to stop.</p>
<p style="font-size:13px;color:#55646a;margin:0">Okanagan Roam · <a href="mailto:${CONTACT}" style="color:#55646a">${CONTACT}</a><br>${addr ? esc(addr) : '<strong>[Mailing address missing: set NEWSLETTER_MAILING_ADDRESS]</strong>'}</p>
</div>`;
  }
  function digestHtml(dg, unsubUrl) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(dg.subject)}</title></head><body style="margin:0;background:#f8f5ed">${digestInnerHtml(dg, unsubUrl)}</body></html>`;
  }
  const unsubUrlFor = (token) => `${SITE}/weekend-email/unsubscribe/${token}`;
  function messageFor(dg, to, token) {
    const unsubUrl = unsubUrlFor(token);
    return {
      to, subject: dg.subject, text: digestText(dg, unsubUrl), html: digestHtml(dg, unsubUrl), replyTo: CONTACT,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>, <mailto:${CONTACT}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
  }

  // Why the real send can't run right now, or null.
  function sendBlocker(dg) {
    if (!mailingAddress()) return 'Not sent: NEWSLETTER_MAILING_ADDRESS is not set. Canada’s anti-spam law (CASL) needs a postal mailing address in every email. Add it in Railway, then press Send again.';
    if (!getSender()) return 'Not sent: email is off until BREVO_API_KEY is set.';
    if (sending) return 'A send is already running. Reload this page in a minute.';
    if (!dg.count) return 'Not sent: there are no events this weekend yet.';
    return null;
  }

  async function sendTest(to = CONTACT, now = new Date()) {
    const send = getSender();
    if (!send) return { ok: false, error: 'Email is off until BREVO_API_KEY is set.' };
    const dg = buildDigest(now);
    const msg = messageFor(dg, to, 'test-link-not-a-real-subscriber');
    try { await send({ ...msg, subject: `[Test] ${msg.subject}` }); } catch (e) { console.error('[weekend-email] test failed:', e.message); return { ok: false, error: 'The test email could not be sent.' }; }
    console.log(`[weekend-email] test sent to ${to} for ${dg.weekend}`);
    return { ok: true };
  }

  // One email per confirmed subscriber, a few a second. A subscriber gets each weekend once: a row in
  // weekend_email_sends is written before the email goes out, and only a failed row is ever tried again.
  async function sendDigest({ now = new Date() } = {}) {
    const dg = buildDigest(now);
    const blocker = sendBlocker(dg);
    if (blocker) return { ok: false, error: blocker };
    const send = getSender();
    sending = { weekend: dg.weekend, started: Date.now() };
    const result = { ok: true, weekend: dg.weekend, sent: 0, failed: 0, skipped: 0 };
    try {
      const ids = db.prepare('SELECT id FROM weekend_email_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL ORDER BY id').all().map((r) => r.id);
      const claim = db.prepare(`INSERT INTO weekend_email_sends (weekend, subscriber_id, status) VALUES (?, ?, 'sending')
        ON CONFLICT(weekend, subscriber_id) DO UPDATE SET status = 'sending', error = NULL, attempted_at = CURRENT_TIMESTAMP WHERE weekend_email_sends.status = 'failed'`);
      for (const id of ids) {
        const sub = db.prepare('SELECT * FROM weekend_email_subscribers WHERE id = ? AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL').get(id);
        if (!sub) { result.skipped++; continue; } // unsubscribed while this ran
        if (claim.run(dg.weekend, id).changes === 0) { result.skipped++; continue; } // already sent (or under way) this weekend
        try {
          await send(messageFor(dg, sub.email, sub.unsubscribe_token));
          db.prepare("UPDATE weekend_email_sends SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE weekend = ? AND subscriber_id = ?").run(dg.weekend, id);
          db.prepare('UPDATE weekend_email_subscribers SET last_sent_at = CURRENT_TIMESTAMP, last_sent_weekend = ? WHERE id = ?').run(dg.weekend, id);
          result.sent++;
        } catch (e) {
          db.prepare("UPDATE weekend_email_sends SET status = 'failed', error = ? WHERE weekend = ? AND subscriber_id = ?").run(String(e.message || e).slice(0, 300), dg.weekend, id);
          result.failed++;
        }
        if (sendDelayMs) await new Promise((r) => setTimeout(r, sendDelayMs));
      }
    } finally { sending = null; }
    console.log(`[weekend-email] ${dg.weekend}: sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`);
    return result;
  }
  function sendCounts(weekend) {
    const out = { sent: 0, failed: 0, sending: 0 };
    for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM weekend_email_sends WHERE weekend = ? GROUP BY status').all(weekend)) out[r.status] = r.n;
    return out;
  }

  // ---- HTTP ----
  function readForm(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const type = String(req.headers['content-type'] || '');
        try {
          if (/^application\/json\b/i.test(type)) return resolve(raw ? JSON.parse(raw) : {});
          if (/^application\/x-www-form-urlencoded\b/i.test(type)) return resolve(Object.fromEntries(new URLSearchParams(raw)));
          resolve(null);
        } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  // POST /api/weekend-email: JSON from the box's script, or a plain form post without JavaScript (answered with a page).
  async function handleSignup(req, res) {
    const asPage = /^application\/x-www-form-urlencoded\b/i.test(String(req.headers['content-type'] || ''));
    let lang = /[?&]lang=fr(?:&|$)/.test(String(req.url || '')) ? 'fr' : 'en';
    const answer = (status, ok, key) => {
      const text = T(lang)[key];
      if (asPage) {
        res.writeHead(status, NOINDEX_HEADERS);
        return res.end(simplePage({ title: ok ? (lang === 'fr' ? 'Vérifiez vos courriels' : 'Check your inbox') : (lang === 'fr' ? 'Inscription non envoyée' : 'Sign-up not sent'), body: text, lang }));
      }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(JSON.stringify(ok ? { ok: true, message: text } : { ok: false, error: text }));
    };
    if (!isSameOrigin(req)) return answer(403, false, 'origin');
    if (ipLimited(clientIp(req))) return answer(429, false, 'rate');
    let body;
    try { body = await readForm(req); } catch (e) { return answer(e.status === 413 ? 413 : 400, false, 'generic'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return answer(400, false, 'generic');
    if (body.lang === 'fr') lang = 'fr';
    // Honeypot: a bot gets the same answer as a person, and nothing is kept or sent.
    if (body.website !== undefined && body.website !== '') return answer(200, true, 'thanks');
    const r = subscribe(typeof body.email === 'string' ? body.email : '', { source: typeof body.source === 'string' ? body.source : '', lang });
    if (!r.ok) return answer(400, false, r.error);
    return answer(200, true, 'thanks');
  }

  // GET/POST /weekend-email/confirm/<token>, GET/POST /weekend-email/unsubscribe/<token>. Returns true when handled.
  async function handlePublic(req, res, pathname, method) {
    const m = /^\/weekend-email\/(confirm|unsubscribe)\/([^/]+)\/?$/.exec(pathname);
    if (!m) return false;
    if (method !== 'GET' && method !== 'POST') { res.writeHead(405, { ...NOINDEX_HEADERS, Allow: 'GET, POST' }); res.end(); return true; }
    const [, kind, token] = m;
    const page = (status, html) => { res.writeHead(status, NOINDEX_HEADERS); res.end(method === 'HEAD' ? undefined : html); return true; };
    if (kind === 'confirm') {
      const row = rowByConfirmToken(token);
      const lang = row ? row.lang : 'en';
      const t = T(lang);
      // 410, not 404: a used link is expected, and stays out of the dashboard's broken-pages list.
      if (!row || row.unsubscribed_at) return page(410, simplePage({ title: t.usedTitle, body: t.usedBody, lang }));
      if (method === 'GET') {
        // A button, not an automatic confirm: mail scanners open links, and only a person should say yes.
        return page(200, simplePage({ title: t.confirmPageTitle, body: t.confirmPageBody, lang,
          extra: `<form method="post" action="/weekend-email/confirm/${esc(token)}"><button type="submit">${esc(t.confirmButton)}</button></form>` }));
      }
      if (!isSameOrigin(req)) return page(403, simplePage({ title: t.confirmPageTitle, body: t.origin, lang }));
      confirm(token);
      return page(200, simplePage({ title: t.confirmedTitle, body: t.confirmedBody, lang }));
    }
    // Unsubscribe: the link in the email (GET) and the mail app's one-click button (POST, RFC 8058) both unsubscribe.
    const row = unsubscribe(token);
    if (method === 'POST' && !/^text\/html/.test(String(req.headers.accept || ''))) {
      req.resume();
      res.writeHead(row ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
      res.end(row ? 'Unsubscribed.' : 'Not found.');
      return true;
    }
    const t = T(row ? row.lang : 'en');
    return row ? page(200, simplePage({ title: t.unsubTitle, body: t.unsubBody, lang: row.lang })) : page(410, simplePage({ title: t.unknownTitle, body: t.unknownBody }));
  }

  // ---- Admin ----
  const NOTICES = {
    test_sent: `Test sent to ${CONTACT}.`, test_failed: 'The test email could not be sent.', email_off: 'Email is off until BREVO_API_KEY is set.',
    started: 'Sending has started. Reload this page to see the count go up.', not_confirmed: 'Nothing sent: tick the box to confirm first.',
    stale: 'Nothing sent: the weekend changed since the page loaded. Check the preview again.',
    blocked: 'Nothing sent. The reason is shown next to the Send button below.',
  };
  function adminPage({ now = new Date(), notice = '', confirmStep = false } = {}) {
    const c = counts();
    const dg = buildDigest(now);
    const sc = sendCounts(dg.weekend);
    const blocker = sendBlocker(dg);
    const waiting = db.prepare(`SELECT COUNT(*) AS n FROM weekend_email_subscribers s WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM weekend_email_sends w WHERE w.weekend = ? AND w.subscriber_id = s.id AND w.status IN ('sent', 'sending'))`).get(dg.weekend).n;
    const noticeText = NOTICES[notice] || '';
    const rows = c.bySource.map((r) => `<tr><td>${esc(r.source)}</td><td>${r.confirmed}</td><td>${r.pending}</td><td>${r.unsubscribed}</td></tr>`).join('');
    const sendBox = confirmStep && !blocker
      ? `<form method="post" action="/admin/weekend-email/send" class="box warn"><p><strong>Send “${esc(dg.subject)}” to ${waiting} confirmed subscriber${waiting === 1 ? '' : 's'}?</strong> This can’t be undone. Anyone who already got this weekend’s email is skipped.</p>
<input type="hidden" name="weekend" value="${esc(dg.weekend)}"><label><input type="checkbox" name="confirm" value="yes" required> Yes, send it now</label><p><button type="submit">Send to ${waiting} confirmed subscriber${waiting === 1 ? '' : 's'}</button> <a href="/admin/weekend-email">Cancel</a></p></form>`
      : `<p>${blocker ? `<span class="err">${esc(blocker)}</span>` : waiting ? `<a class="btn" href="/admin/weekend-email?step=confirm">Send to ${waiting} confirmed subscriber${waiting === 1 ? '' : 's'}…</a>` : 'Everyone confirmed has this weekend’s email (or there is no one yet).'}</p>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Weekend email | Admin</title>
<style>body{margin:0;background:#f6f4ef;color:#1b2e39;font:15px/1.5 Arial,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px 60px}h1{font-family:Georgia,serif}table{border-collapse:collapse;background:#fff}td,th{padding:6px 12px;border:1px solid #e0d8c3;text-align:left}.box{background:#fff;border:1px solid #e0d8c3;border-radius:12px;padding:14px 16px;margin:14px 0}.warn{border-color:#dcc27d;background:#fffaf0}.ok{background:#e6f2e8;padding:8px 12px;border-radius:8px}.err{color:#a3341f;font-weight:700}button,.btn{display:inline-block;min-height:40px;padding:8px 16px;border:0;border-radius:20px;background:#1b2e39;color:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.preview{background:#f8f5ed;border:1px solid #e0d8c3;border-radius:12px;overflow:hidden}pre{white-space:pre-wrap;background:#fff;border:1px solid #e0d8c3;border-radius:12px;padding:12px;font-size:13px}</style></head>
<body><main>
<p><a href="/admin/dashboard">← Dashboard</a></p>
<h1>Weekend email</h1>
${noticeText ? `<p class="${notice === 'blocked' || notice.endsWith('failed') || notice === 'email_off' ? 'err' : 'ok'}">${esc(noticeText)}</p>` : ''}
<div class="box"><strong>${c.total.confirmed}</strong> confirmed · <strong>${c.total.pending}</strong> waiting to confirm · <strong>${c.total.unsubscribed}</strong> unsubscribed
${rows ? `<table style="margin-top:10px"><tr><th>Signed up on</th><th>Confirmed</th><th>Pending</th><th>Unsubscribed</th></tr>${rows}</table>` : ''}</div>
<div class="box"><p><strong>Weekend of ${esc(dg.weekend)}</strong> (${esc(dg.from || '')} to ${esc(dg.to || '')}): ${dg.count} events in the email${dg.totalFound > dg.count ? ` (of ${dg.totalFound} found)` : ''}. This weekend so far: ${sc.sent} sent${sc.failed ? `, ${sc.failed} failed (Send again retries them)` : ''}${sc.sending ? `, ${sc.sending} under way` : ''}.</p>
<form method="post" action="/admin/weekend-email/test" style="display:inline"><button type="submit">Send test to ${CONTACT}</button></form>
${sendBox}
<p style="font-size:13px;color:#55646a">Nothing goes out by itself: emails are sent only when you press Send here. The usual time is Thursday morning.</p></div>
<h2>Preview</h2>
<p><strong>Subject:</strong> ${esc(dg.subject)}</p>
<div class="preview">${digestInnerHtml(dg, `${SITE}/weekend-email/unsubscribe/preview`)}</div>
<h2>Plain-text version</h2>
<pre>${esc(digestText(dg, `${SITE}/weekend-email/unsubscribe/preview`))}</pre>
</main></body></html>`;
  }

  async function settle() { while (inflight.size) await Promise.allSettled([...inflight]); }
  function resetLimits() { ipHits.clear(); }
  function setSendDelay(ms) { sendDelayMs = ms; }

  return {
    signupBoxHtml, subscribe, confirm, unsubscribe, counts, buildDigest, digestText, digestHtml, messageFor, sendBlocker,
    sendTest, sendDigest, sendCounts, handleSignup, handlePublic, adminPage, readForm, settle, resetLimits, setSendDelay,
    isSending: () => !!sending, NOINDEX_HEADERS,
  };
}

module.exports = { create, signupBoxHtml, simplePage, NOINDEX_HEADERS, MAX_EVENTS };
