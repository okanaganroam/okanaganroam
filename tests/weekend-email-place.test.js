'use strict';
// The weekend email's place line never says the town twice (Nov 17 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { weekendEmailPlace } = require('../server');

test('town added only when the venue text does not already end in it', () => {
  assert.equal(weekendEmailPlace('Rutland Centennial Hall, 215 Shepherd Rd, Kelowna', 'Kelowna'), 'Rutland Centennial Hall, 215 Shepherd Rd, Kelowna');
  assert.equal(weekendEmailPlace('Scenic Sip Wine Trail wineries, Lake Country', 'Lake Country'), 'Scenic Sip Wine Trail wineries, Lake Country');
  assert.equal(weekendEmailPlace('Oliver Community Hall, 6359 Park Dr, Oliver', 'Oliver'), 'Oliver Community Hall, 6359 Park Dr, Oliver');
  assert.equal(weekendEmailPlace('Hall, 1 Main St, Vernon V1T 2A1', 'Vernon'), 'Hall, 1 Main St, Vernon V1T 2A1');
  assert.equal(weekendEmailPlace('Summerhill Pyramid Winery', 'Kelowna'), 'Summerhill Pyramid Winery, Kelowna');
  assert.equal(weekendEmailPlace('Kelowna Yacht Club', 'Kelowna'), 'Kelowna Yacht Club, Kelowna');
  assert.equal(weekendEmailPlace('', 'Penticton'), 'Penticton');
  assert.equal(weekendEmailPlace('Delta Hotels by Marriott Grand Okanagan Resort, Kelowna', 'Kelowna'), 'Delta Hotels by Marriott Grand Okanagan Resort, Kelowna');
});
