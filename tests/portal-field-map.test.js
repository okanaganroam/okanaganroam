'use strict';
// Business portal field map (2026-11-08): PORTAL_FIELDS_BY_TYPE is now the single source of truth for what each venue type
// is offered in the owner portal. This test pins the behaviour from before the refactor: the seven old type sets are
// written out below exactly as they were, and the map must give the same answer for every type (and for a type nobody
// has heard of). It does not need a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server.js');

const LEGACY = {
  happyHour: new Set(['restaurant', 'pub', 'cocktail', 'brewery', 'winery', 'distillery', 'golf']),
  specials: new Set(['restaurant', 'pub', 'cocktail', 'brewery', 'winery', 'distillery', 'golf', 'cafe']),
  nights: new Set(['restaurant', 'cafe', 'pub', 'brewery', 'cocktail', 'distillery', 'winery']),
  menu: new Set(['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery', 'tour', 'golf', 'indoor', 'sport']),
  bookingFirst: new Set(['tour', 'golf', 'indoor', 'sport', 'outdoor']),
  noPrice: new Set(['golf', 'shop']),
  activityBadges: new Set(['outdoor', 'indoor', 'beach', 'tour', 'sport']),
};
// Old inline rule in the owner form: food-only badges were hidden for booking-first types except golf.
const legacyFoodBadgesHidden = (type) => LEGACY.bookingFirst.has(type) && type !== 'golf';

const TYPES = [...new Set([...Object.keys(app.CATEGORY_SLUGS), ...Object.keys(app.PORTAL_FIELDS_BY_TYPE), 'a-type-added-later'])];

test('every venue type has a row in the portal field map', () => {
  for (const t of Object.keys(app.CATEGORY_SLUGS)) {
    assert.ok(Object.hasOwn(app.PORTAL_FIELDS_BY_TYPE, t), `${t} has no row in PORTAL_FIELDS_BY_TYPE`);
  }
});

test('the map gives the same answers as the old scattered type sets, for every type', () => {
  for (const t of TYPES) {
    const f = app.portalFields(t);
    assert.equal(f.happyHour, LEGACY.happyHour.has(t), `${t}: happy hour`);
    assert.equal(f.specials, LEGACY.specials.has(t), `${t}: specials`);
    assert.equal(f.nights, LEGACY.nights.has(t), `${t}: weekly nights`);
    assert.equal(f.menu, LEGACY.menu.has(t), `${t}: menu`);
    assert.equal(f.bookingFirst, LEGACY.bookingFirst.has(t), `${t}: booking first`);
    assert.equal(f.price, !LEGACY.noPrice.has(t), `${t}: price`);
    assert.equal(f.activityBadges, LEGACY.activityBadges.has(t), `${t}: activity badges`);
    assert.equal(f.foodBadgesHidden, legacyFoodBadgesHidden(t), `${t}: food badges hidden`);
  }
});

test('the exported type sets are built from the map', () => {
  const same = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
  same(app.OWNER_HAPPY_HOUR_TYPES, LEGACY.happyHour);
  same(app.OWNER_SPECIALS_TYPES, LEGACY.specials);
  same(app.NIGHT_TYPES, LEGACY.nights);
  same(app.MENU_VENUE_TYPES, LEGACY.menu);
  same(app.OWNER_BOOKING_FIRST_TYPES, LEGACY.bookingFirst);
  same(app.NO_PRICE_TYPES, LEGACY.noPrice);
  same(app.ACTIVITY_BADGE_TYPES, LEGACY.activityBadges);
});

test('every Food & Drink type can have a menu and weekly nights', () => {
  for (const t of app.FOOD_DRINK_TYPES) {
    assert.equal(app.portalFields(t).menu, true, `${t}: menu`);
    assert.equal(app.portalFields(t).nights, true, `${t}: weekly nights`);
  }
});

test('a type nobody has listed gets the plain defaults, and the map cannot be changed', () => {
  assert.deepEqual({ ...app.portalFields('a-type-added-later') }, { happyHour: false, specials: false, nights: false, menu: false, bookingFirst: false, price: true, activityBadges: false, foodBadgesHidden: false });
  assert.deepEqual({ ...app.portalFields('constructor') }, { ...app.portalFields('a-type-added-later') });
  assert.ok(Object.isFrozen(app.PORTAL_FIELDS_BY_TYPE) && Object.isFrozen(app.portalFields('cafe')));
});

test('cafes are never offered a happy hour; wineries, pubs and breweries are', () => {
  assert.equal(app.portalFields('cafe').happyHour, false);
  for (const t of ['winery', 'pub', 'brewery', 'restaurant', 'distillery', 'cocktail']) assert.equal(app.portalFields(t).happyHour, true, t);
});
