#!/usr/bin/env node
// Campaign tags for links we send out (2026-10-16).
//
// Email apps don't tell the site where a click came from, so an untagged
// link in an email shows up in Google Analytics as "direct". Adding
// utm_source / utm_medium / utm_campaign to the link fixes that.
//
//   node scripts/utm-links.js link <url> --source <s> --medium <m> --campaign <c>
//       prints one tagged link (e.g. for the Instagram bio)
//   node scripts/utm-links.js tag <file> --source <s> --medium <m> --campaign <c>
//       prints the file with every okanaganroam.com page link tagged; a .json
//       file (e.g. an outbox chunk) is tagged string by string
//
// Only links to okanaganroam.com pages are tagged. Left alone:
//   - /owner/ links (private sign-in links, not tracked pages)
//   - files such as /badges/*.png (images, not pages)
//   - links inside href="..." / src="..." (the badge code venues paste on
//     their own websites: those visits should count as referrals from the
//     venue's site, not as this email campaign)
//   - links that already carry utm_ parameters
// Values are lowercase letters, digits, "-" and "_", e.g.
//   --source venue_outreach --medium email --campaign 2026-10-follow-up

const fs = require('node:fs');
const path = require('node:path');

const SITE_LINK_RE = /https:\/\/(?:www\.)?okanaganroam\.com(?:\/[^\s"'<>)\]\\]*)?/g;
const TAG_VALUE_RE = /^[a-z0-9_-]+$/;

function checkTags(tags) {
  for (const key of ['source', 'medium', 'campaign']) {
    if (!tags || !TAG_VALUE_RE.test(tags[key] || '')) {
      throw new Error(`--${key} is required: lowercase letters, digits, "-" or "_" only`);
    }
  }
}

function shouldTag(url) {
  const { pathname, searchParams } = new URL(url);
  if (pathname.startsWith('/owner/') || pathname === '/owner') return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  for (const key of searchParams.keys()) if (key.startsWith('utm_')) return false;
  return true;
}

function tagUrl(url, tags) {
  checkTags(tags);
  if (!shouldTag(url)) return url;
  const u = new URL(url);
  u.searchParams.set('utm_source', tags.source);
  u.searchParams.set('utm_medium', tags.medium);
  u.searchParams.set('utm_campaign', tags.campaign);
  return u.toString();
}

function tagText(text, tags) {
  checkTags(tags);
  return text.replace(SITE_LINK_RE, (url, offset) => {
    // Inside an HTML attribute (href="..." or, in JSON, href=\"...\")?
    if (/(?:href|src)=\\?["']$/i.test(text.slice(Math.max(0, offset - 7), offset))) return url;
    // Trailing sentence punctuation is not part of the link.
    const m = /^(.*?)([.,;:!?]*)$/.exec(url);
    return tagUrl(m[1], tags) + m[2];
  });
}

function tagJson(value, tags) {
  if (typeof value === 'string') return tagText(value, tags);
  if (Array.isArray(value)) return value.map((v) => tagJson(v, tags));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = tagJson(v, tags);
    return out;
  }
  return value;
}

function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  const tags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const m = /^--(source|medium|campaign)$/.exec(rest[i]);
    if (!m) throw new Error(`unknown option ${rest[i]}`);
    tags[m[1]] = rest[i + 1];
  }
  return { command, target, tags };
}

function main(argv) {
  const { command, target, tags } = parseArgs(argv);
  if (command === 'link' && target) {
    if (!new RegExp(`^${SITE_LINK_RE.source}$`).test(target)) throw new Error('link must be an https://okanaganroam.com address');
    return tagUrl(target, tags) + '\n';
  }
  if (command === 'tag' && target) {
    const raw = fs.readFileSync(target, 'utf8');
    if (path.extname(target).toLowerCase() === '.json') return JSON.stringify(tagJson(JSON.parse(raw), tags), null, 2) + '\n';
    return tagText(raw, tags);
  }
  throw new Error('usage: utm-links.js link <url> | tag <file>  --source <s> --medium <m> --campaign <c>');
}

if (require.main === module) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { tagUrl, tagText, tagJson, main };
