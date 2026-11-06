'use strict';
// Progress toward the Jan 31 goals (2026-11-06). Each goal has a baseline, a target and a current value that comes
// from a live source (Search Console, Google Analytics) or from a hand-typed measurement in data/seo-goals.json.
const fs = require('fs');
const path = require('path');

const DAY = 86400000;
const toMs = (d) => new Date(`${d}T12:00:00Z`).getTime();

function load(file = path.join(__dirname, 'data', 'seo-goals.json')) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

// Pure. progress = how far the current value is along baseline -> target (0 to 100, can be negative before clamping);
// expected = how far through the time we are. On track when progress keeps up with time.
function progress(goal, current, start, deadline, now = new Date()) {
  if (current === null || current === undefined || Number.isNaN(Number(current))) return { current: null, progress: null, expected: null, status: 'not measured' };
  const span = goal.target - goal.baseline;
  const raw = span ? ((current - goal.baseline) / span) * 100 : (current >= goal.target ? 100 : 0);
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - toMs(start)) / (toMs(deadline) - toMs(start))));
  const expected = Math.round(elapsed * 100);
  const pct = Math.round(Math.max(0, Math.min(100, raw)));
  // 10 points of grace, so the first days (when nothing can have moved yet) are not called behind.
  const status = raw >= 100 ? 'reached' : raw >= expected - 10 ? 'on track' : raw < 0 ? 'below the starting point' : 'behind';
  return { current, progress: pct, expected, status };
}

// live: { gsc_nonbrand: { per_day, last7_per_day } | {error} | null, ga_chatgpt: { sessions } | {error} | null }
function evaluate(cfg, live = {}, now = new Date()) {
  if (!cfg || !Array.isArray(cfg.goals)) return null;
  const days = Math.max(0, Math.ceil((toMs(cfg.deadline) - now.getTime()) / DAY));
  const goals = cfg.goals.map((g) => {
    let current = null; let note = ''; let measured = null; let extra = '';
    if (g.source === 'gsc_nonbrand') {
      const v = live.gsc_nonbrand;
      if (v && !v.error) { current = v.per_day; measured = `${v.start} to ${v.end}`; extra = `Last 7 days: ${v.last7_per_day} a day.`; } else note = v && v.error ? v.error : 'Search Console is not connected.';
    } else if (g.source === 'ga_chatgpt') {
      const v = live.ga_chatgpt;
      if (v && !v.error) { current = v.sessions; measured = 'last 28 days, from Google Analytics'; } else note = v && v.error ? v.error : 'Google Analytics is not connected.';
    } else if (g.manual) { current = g.manual.value; measured = `typed in, as of ${g.manual.as_of}`; note = g.manual.note || ''; }
    return { key: g.key, label: g.label, unit: g.unit, baseline: g.baseline, target: g.target, measured, note, extra, ...progress(g, current, cfg.start, cfg.deadline, now) };
  });
  return { start: cfg.start, deadline: cfg.deadline, days_left: days, goals };
}

module.exports = { load, progress, evaluate };
