# Build My Trip vocabulary

How Build My Trip and site search understand what visitors type, kept as data so it moves to any Roam site.

| File | What it holds | On a new site |
|---|---|---|
| `shared.json` | Phrases that mean the same thing anywhere: "spa", "après", "with the grandparents", "not touristy", "treat ourselves", plus `descriptionSynonyms` (a visitor's word → the words listings use, e.g. cozy → fireplace, intimate) and `termLabels` (how a searched word reads in a plan summary: cozy → "cozy spots"). | Copy as is. |
| `local.json` | This site's own words: town nicknames (`regions`), phrases that cover several towns (`areas`), words for the whole region (`wideScope`), places it doesn't cover (`outsidePlaces`), and requests that must keep working (`tests`). | Write a new one (about an hour). |
| `tests-shared.json` | Requests every site must understand. | Copy as is. |

`tests/trip-vocabulary.test.js` runs every request in `tests-shared.json` and `local.json` → `tests`.

## Adding a phrase
1. Put it under the right key in `shared.json` (or `local.json` if it's a place name).
2. Add the request that needed it to `tests-shared.json` (or `local.json` → `tests`).
3. Run `node --test tests/trip-vocabulary.test.js tests/discovery-intent.test.js tests/trip-*.test.js`.

## Rules learned the hard way (2026-10-28)
- A phrase claims its words, so don't add phrases containing **weekend, trip, getaway, day, night, dinner, lunch, breakfast, brunch**: the planner reads those itself, for trip length and meals.
- The site's own code tables win. A shared phrase is only added where the site hasn't given that phrase a meaning already.
- Keep `descriptionSynonyms` narrow. Broad ones ("lake", "pizza", "views") change site search results everywhere.
- Accessibility ("wheelchair") stays an honest "not something we can confirm". Don't map it to listings.
