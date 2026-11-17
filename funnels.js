'use strict';
// Funnels (2026-11-06): two step-by-step views built only from counts we already keep.
//  1. Build My Trip: opened the planner -> started -> got a plan -> added places -> opened My Trip -> shared.
//  2. Business claims and the portal: visits from our emails -> claim or edit link opened -> claim or changes sent -> login -> edits.
// Steps are counts of actions (not people): the site keeps no visitor id. "Of the step before" shows where people drop off.
const { dayOf } = require('./trip-demand');

const PLANNER_STEPS = [
  ['page_view:trip', 'Opened Build My Trip'],
  ['trip_plan_start', 'Started a plan'],
  ['trip_plan_complete', 'Got a plan'],
  ['add_whole_trip', 'Added the whole planned trip to My Trip'],
];
// Places are added from every page (not only the planner), so this path is separate.
const MYTRIP_STEPS = [
  ['add_to_trip', 'Added a place to My Trip'],
  ['open_my_trip', 'Opened My Trip'],
  ['trip_share', 'Shared a trip'],
];
const TRIP_STEPS = [...PLANNER_STEPS, ...MYTRIP_STEPS];
const TRIP_EXTRA = [
  ['build_my_trip_click', 'Clicked the Build My Trip button'],
  ['trip_plan_regenerate', 'Asked for a different plan'],
  ['remove_from_trip', 'Removed a place from My Trip'],
  ['shared_trip_view', 'Opened a trip someone shared'],
  ['shared_trip_save', 'Saved a shared trip'],
  ['shared_trip_cta_click', 'Tapped the button on a shared trip'],
];
// [stored name, label, group]
const CLAIM_STEPS = [
  ['claim_page_view', 'Opened a claim page', 'Claim'],
  ['claim_submit', 'Sent a claim', 'Claim'],
  ['edit_link_view', 'Opened an emailed edit link', 'Emailed edit link'],
  ['edit_link_send', 'Sent changes from the edit link', 'Emailed edit link'],
  ['create_login', 'Created a login from the edit link', 'Emailed edit link'],
  ['login_page_view', 'Opened the login page', 'Portal'],
  ['login_success', 'Signed in', 'Portal'],
  ['edit_page_view', 'Opened a listing’s edit page', 'Portal'],
  ['edit_save', 'Saved changes to a listing', 'Portal'],
  ['photo_upload', 'Uploaded a photo', 'Portal'],
  ['menu_edit', 'Changed the menu', 'Portal'],
];

const tableExists = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const list = (days, now) => { const out = []; for (let i = days - 1; i >= 0; i -= 1) out.push(dayOf(new Date(now.getTime() - i * 86400000))); return out; };
const withRates = (steps) => steps.map((s, i) => ({ ...s, of_previous: i && steps[i - 1].n ? Math.round((s.n / steps[i - 1].n) * 1000) / 10 : null }));

function createFunnels(db) {
  function report(days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const dl = list(days, now); const since = dl[0]; const sinceTs = `${since} 00:00:00`;
    const ev = {}; const evDay = {};
    for (const r of db.prepare('SELECT day, name, n FROM site_event_counts WHERE day >= ?').all(since)) { ev[r.name] = (ev[r.name] || 0) + r.n; (evDay[r.name] = evDay[r.name] || new Map()).set(r.day, r.n); }
    const series = (name) => dl.map((day) => ({ day, n: (evDay[name] && evDay[name].get(day)) || 0 }));
    const g = (n) => ev[n] || 0;

    // Trip: people-level view from the anonymous demand log (one visitor key per day).
    let people = null;
    if (tableExists(db, 'trip_demand_events')) {
      const one = (kind) => db.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT day, visitor FROM trip_demand_events WHERE day >= ? AND kind = ?)').get(since, kind).n;
      const both = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT a.day, a.visitor FROM trip_demand_events a JOIN trip_demand_events b ON a.day = b.day AND a.visitor = b.visitor AND b.kind = 'add' WHERE a.day >= ? AND a.kind = 'shown')`).get(since).n;
      people = { shown: one('shown'), added: one('add'), removed: one('remove'), shown_then_added: both };
    }
    const trip = {
      planner: withRates(PLANNER_STEPS.map(([k, text]) => ({ key: k, text, n: g(k) }))),
      my_trip: withRates(MYTRIP_STEPS.map(([k, text]) => ({ key: k, text, n: g(k) }))),
      extra: TRIP_EXTRA.map(([k, text]) => ({ key: k, text, n: g(k) })),
      people,
      starts_per_day: series('trip_plan_start'), completes_per_day: series('trip_plan_complete'),
    };

    // Claims and the portal: portal steps (counted on the server), campaign visits, and the real claim/account records.
    const portalName = (k) => (k.startsWith('portal_') ? k : `portal:${k}`);
    const pv = {}; const pvDay = {};
    for (const r of db.prepare("SELECT day, name, n FROM site_event_counts WHERE day >= ? AND name LIKE 'portal:%'").all(since)) { pv[r.name] = (pv[r.name] || 0) + r.n; (pvDay[r.name] = pvDay[r.name] || new Map()).set(r.day, r.n); }
    const claimsSteps = CLAIM_STEPS.map(([k, text, group]) => ({ key: k, text, group, n: pv[portalName(k)] || 0 }));
    const loginClicks = ['portal_login_click_menu', 'portal_login_click_venue_page', 'portal_login_click_footer', 'portal_login_click_other', 'portal_claim_click'].reduce((a, k) => a + g(k), 0);
    let campaigns = []; let emailPerDay = dl.map((day) => ({ day, n: 0 })); let emailPages = [];
    if (tableExists(db, 'referral_counts')) {
      const rows = db.prepare("SELECT day, source, page, n FROM referral_counts WHERE day >= ? AND kind = 'visit' AND source LIKE 'email:%'").all(since);
      const c = new Map(); const perDay = new Map(); const pages = new Map();
      for (const r of rows) { const name = r.source.slice(6); c.set(name, (c.get(name) || 0) + r.n); perDay.set(r.day, (perDay.get(r.day) || 0) + r.n); const k = `${name}|${r.page}`; pages.set(k, (pages.get(k) || 0) + r.n); }
      campaigns = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
      emailPerDay = dl.map((day) => ({ day, n: perDay.get(day) || 0 }));
      emailPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => { const i = k.indexOf('|'); return { campaign: k.slice(0, i), page: k.slice(i + 1), n }; });
    }
    const count = (table, where, params = []) => (tableExists(db, table) ? db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params).n : null);
    const claimsPerDay = tableExists(db, 'venue_claims') ? (() => { const m = new Map(db.prepare('SELECT substr(submitted_at,1,10) AS day, COUNT(*) AS n FROM venue_claims WHERE submitted_at >= ? GROUP BY day').all(sinceTs).map((r) => [r.day, r.n])); return dl.map((day) => ({ day, n: m.get(day) || 0 })); })() : null;
    const records = {
      claims_submitted: count('venue_claims', 'submitted_at >= ?', [sinceTs]),
      claims_approved: count('venue_claims', "status = 'approved' AND reviewed_at >= ?", [sinceTs]),
      claims_waiting: count('venue_claims', "status = 'pending'"),
      accounts_created: count('owner_accounts', 'created_at >= ?', [sinceTs]),
      owners_signed_in: count('owner_accounts', 'last_login_at >= ?', [sinceTs]),
      accounts_total: count('owner_accounts', '1=1'),
      changes_sent: count('owner_change_requests', 'submitted_at >= ?', [sinceTs]),
      changes_approved: count('owner_change_requests', "status = 'approved' AND reviewed_at >= ?", [sinceTs]),
    };
    const first = db.prepare("SELECT MIN(day) AS d FROM site_event_counts").get().d;
    return {
      days, since, counting_since: first || null,
      trip,
      claims: { login_clicks: loginClicks, steps: claimsSteps, campaigns, email_pages: emailPages, email_per_day: emailPerDay, claims_per_day: claimsPerDay, records },
    };
  }
  return { report };
}

module.exports = { PLANNER_STEPS, MYTRIP_STEPS, TRIP_STEPS, CLAIM_STEPS, createFunnels };
