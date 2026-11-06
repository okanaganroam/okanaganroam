// Build My Trip parity (2026-11-06): the planner files are the same on every Roam site and everything that differs is in
// trip-site.js. This file is the same on every site too: a site config has every value, and the French tokens all resolve.
const test = require('node:test');
const assert = require('node:assert/strict');
const SITE = require('../trip-site.js');
const fr = require('../trip-french-copy.js');

const KEYS = ['brand', 'brandWithArticle', 'brandFrOf', 'area', 'areaShort', 'areaPossessive', 'coverage', 'stretchName', 'timeName', 'exampleTowns', 'bikeParkReason', 'areaWords',
  'occasionNotes', 'heuristicNotes', 'sunsetDinner', 'wineryNameStopWords', 'lakeViewMeansLake', 'dogMealsMustBeListed', 'winterBeachWalks', 'routeCorridor', 'routeOffCorridor', 'openRoadTrip',
  'regionDriveLegs', 'townCentres', 'wellKnownSights', 'notDayBaseRegions', 'village', 'gatewayRegion', 'southGateway', 'mountainForTown', 'dayOnlyMountainRegions', 'summerLiftSightRe',
  'backcountryAskedRe', 'beachTownRe', 'beachWordRe', 'lakesideWords', 'lakeCrossing', 'curatedEventLocations', 'skiHillRegions', 'defaultSkiRegion', 'skiRegionForTown', 'skiVillageForHill',
  'skiSeasonMonths', 'skiOffMonths', 'skiHillNameRe', 'skiTownLabels', 'skiSuggestion', 'french', 'defaultRegion', 'nearTowns', 'skiHillBase', 'nameGenericWords', 'commonNameWords',
  'venueNicknames', 'stopPrices', 'frenchRequests', 'page'];

test('trip-site.js has every value the shared planner files read', () => {
  for (const k of KEYS) assert.ok(k in SITE, k);
  assert.deepEqual(Object.keys(SITE).filter((k) => !KEYS.includes(k)), [], 'a new value is added to this list too');
  for (const k of ['celebration', 'group_getaway', 'relaxing', 'adults']) { assert.ok(SITE.occasionNotes[k]); assert.ok(SITE.heuristicNotes[k]); }
  assert.deepEqual([...SITE.skiSeasonMonths, ...SITE.skiOffMonths].sort((a, b) => a - b).filter((m, i, a) => a.indexOf(m) === i).length <= 12, true);
});

test('the French site tokens go in and come back unchanged', () => {
  const f = SITE.french;
  for (const s of [`${f.brand} can’t check parking from its listings`, `Ideas in ${f.area} instead`, `Sunday (${f.timeName} time)`, `${f.brandWithArticle} Local Favourite`]) {
    assert.equal(fr.frSiteOut(fr.frSiteIn(s)), s);
  }
  assert.ok(!/@[A-Z_]+@/.test(fr.t3FrenchText(`No ${f.brand} listings match every part of that request.`)));
  assert.ok(fr.t3FrenchText(`No ${f.brand} listings match every part of that request.`).includes(f.brand));
});
