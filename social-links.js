'use strict';
// okanaganroam.com/links (2026-10-19): the one link in the Instagram bio. Each post says "link in bio", so this page
// puts the day's post first and the recent ones below, instead of changing the bio link every morning.
// Posts come from data/social-links.json. The bio link itself carries the campaign tags
// (/links?utm_source=instagram&utm_medium=social&utm_campaign=bio); links on the page are plain site paths, because tags
// on internal links would start a new Analytics session. Clicks are counted as a bio_link_click event instead.

const PATH_RE = /^\/[a-z0-9\-/]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The posts to show on `today` (YYYY-MM-DD, Pacific): up to today, newest first, at most `limit`.
function linksForDay(posts, today, limit = 14) {
  return (Array.isArray(posts) ? posts : [])
    .filter((p) => p && DATE_RE.test(p.date || '') && PATH_RE.test(p.path || '') && typeof p.title === 'string' && p.title.trim() && p.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((p) => ({ date: p.date, title: p.title.trim(), path: p.path, isToday: p.date === today }));
}

module.exports = { linksForDay };
