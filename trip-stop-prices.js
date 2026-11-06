// Published CAD prices checked November 6, 2026. A meal is one named example,
// and a winery price is for the named tasting, without purchase discounts.
const entries = {
  'restaurants/home-block-at-cedarcreek-estate-winery': [5000, 'Two-course lunch, food only', 'Dîner deux services, sans vin', 'https://www.cedarcreek.bc.ca/home-block-restaurant/lunch-menu/'],
  'wineries/the-view-winery-vineyard': [1000, 'Wine or cider flight', 'Dégustation de vin ou de cidre', 'https://theviewwinery.com/events-2/'],
  'wineries/spearhead-winery': [1500, 'Guided wine tasting', 'Dégustation guidée', 'https://www.spearheadwinery.com/visit-us/'],
  'restaurants/wildling': [6900, 'Sample dinner: turnips, tagliolini and crudo', 'Exemple de souper : navets, tagliolini et crudo', 'https://www.wildling.ca/'],
  'restaurants/soul-de-cuba-cafe': [2050, 'Classic Cuban sandwich', 'Sandwich cubain classique', 'https://souldecubacafe.ca/kelowna/index.php/menu/lunch'],
  'wineries/sandhill-wines': [1800, 'Signature tasting', 'Dégustation Signature', 'https://www.sandhillwines.ca/visit/tasting-room/'],
  'wineries/waldhof-family-estate-winery': [1000, 'Waldhof flight', 'Dégustation Waldhof', 'https://waldhofwine.ca/'],
  'restaurants/kasai-teppanyaki-steak-sushi-house': [4800, 'Teppan chicken dinner', 'Souper de poulet teppan', 'https://kasaiteppanyaki.ca/menu'],
  'restaurants/frankie-we-salute-you': [2275, 'Frankie cheeseburger', 'Cheeseburger Frankie', 'https://www.frankiewesaluteyou.com/menu'],
  'wineries/meadow-vista-honey-wines': [1000, 'Mead tasting', 'Dégustation d’hydromel', 'https://meadowvista.ca/pages/visit-us'],
  'wineries/summerhill-pyramid-winery': [1500, 'Earth Steward White tasting', 'Dégustation Earth Steward White', 'https://summerhill.bc.ca/tastings-experiences/'],
  'restaurants/derrick-s-steakhouse': [4000, 'Flat iron steak, sides extra', 'Steak flat iron, accompagnements en sus', 'https://www.derrickssteakhouse.ca/menus'],
};

function tripStopPrice(url) {
  if (typeof url !== 'string' || !url.startsWith('/kelowna/')) return null;
  const key = url.slice('/kelowna/'.length);
  if (!Object.hasOwn(entries, key)) return null;
  const [cents, label, labelFr, source] = entries[key];
  return { cents, label, labelFr, source };
}

module.exports = { tripStopPrice };
