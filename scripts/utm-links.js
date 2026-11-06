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
//   node scripts/utm-links.js check <file or folder> [more...]
//       lists links to either of our sites that would go out without complete
//       tags, with file and line, and exits with an error if it finds any.
//       Run it on a batch before sending. Links inside href="..." are counted
//       but not failed: they may be badge code, so look at those by hand.
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

const CHECK_LINK_RE = /https:\/\/(?:www\.)?(?:okanaganroam|whistlerroam)\.com(?:\/[^\s"'<>)\]\\]*)?/g;
const CHECK_EXT = new Set(['.txt', '.md', '.html', '.htm', '.json', '.csv', '.eml']);

// Problems with the links in one piece of text: [{ line, url, problem }], plus how many sat inside an attribute.
function checkText(text) {
  const problems = []; let inAttribute = 0;
  for (const m of text.matchAll(CHECK_LINK_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    let u; try { u = new URL(url); } catch (e) { continue; }
    const keys = [...u.searchParams.keys()];
    const utm = keys.filter((k) => k.startsWith('utm_'));
    const line = text.slice(0, m.index).split('\n').length;
    if (utm.length) {
      const missing = ['utm_source', 'utm_medium', 'utm_campaign'].filter((k) => !u.searchParams.get(k));
      if (missing.length) problems.push({ line, url, problem: `missing ${missing.join(', ')}` });
      continue;
    }
    if (!shouldTag(url)) continue;
    if (/(?:href|src)=\\?["']$/i.test(text.slice(Math.max(0, m.index - 7), m.index))) { inAttribute += 1; continue; }
    problems.push({ line, url, problem: 'no tags' });
  }
  return { problems, inAttribute };
}

function filesIn(target) {
  if (!fs.statSync(target).isDirectory()) return [target];
  const out = [];
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    const p = path.join(target, e.name);
    if (e.isDirectory()) out.push(...filesIn(p));
    else if (CHECK_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

// A printed report for files and folders, and whether everything was fine.
function checkPaths(targets) {
  const lines = []; let bad = 0; let attrs = 0; let files = 0;
  for (const t of targets) {
    for (const f of filesIn(t)) {
      files += 1;
      const { problems, inAttribute } = checkText(fs.readFileSync(f, 'utf8'));
      attrs += inAttribute; bad += problems.length;
      for (const x of problems) lines.push(`${f}:${x.line}  ${x.problem}  ${x.url}`);
    }
  }
  lines.push(`${files} file(s) checked: ${bad} link(s) to fix${attrs ? `, ${attrs} inside href/src to look at by hand` : ''}.`);
  return { ok: bad === 0, report: lines.join('\n') + '\n' };
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
  throw new Error('usage: utm-links.js link <url> | tag <file>  --source <s> --medium <m> --campaign <c> | check <file or folder>...');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === 'check' && args.length > 1) {
      const r = checkPaths(args.slice(1));
      process.stdout.write(r.report);
      process.exit(r.ok ? 0 : 1);
    }
    process.stdout.write(main(args));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { tagUrl, tagText, tagJson, main, checkText, checkPaths };
