// Published CAD prices for a stop, per person (2026-11-06): the values are per site, in trip-site.js (stopPrices).
const { stopPrices } = require('./trip-site.js');

function tripStopPrice(url, id) {
  const hit = (typeof url === 'string' && Object.hasOwn(stopPrices.byUrl, url) && stopPrices.byUrl[url]) || (Number.isInteger(id) && Object.hasOwn(stopPrices.byId, id) && stopPrices.byId[id]) || null;
  if (!hit) return null;
  const [cents, label, labelFr, source] = hit;
  return { cents, label, labelFr, source };
}

module.exports = { tripStopPrice };
