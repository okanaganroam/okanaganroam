# Okanagan Roam Backend

A real database and REST API for the Okanagan Roam venue directory, replacing
the 812 hardcoded venue cards that used to live directly in the site's HTML.

Built with **zero external dependencies** — just Node.js 22's built-in
`node:sqlite` module and the built-in `http` module. No `npm install`
required, nothing to compile, nothing that can go missing.

## Files

- `db.js` — opens `okanagan.db` and creates the `venues` table if it doesn't exist
- `extract.py` — one-time script that pulled all 812 venues out of the old
  static HTML (`okanagan.html`) into `venues.json`. You won't need to run
  this again unless you're re-importing from the old site.
- `venues.json` — the extracted venue data (source of truth for the seed)
- `seed.js` — wipes and reloads `okanagan.db` from `venues.json`
- `server.js` — the API server
- `okanagan.db` — the SQLite database file itself (812 venues, already seeded)

## Running it

```bash
npm start
# Okanagan Roam API listening on http://localhost:3001
```

To re-seed the database from scratch (e.g. after editing `venues.json`):

```bash
npm run seed
```

## Database schema

Table `venues`:

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | primary key, autoincrement |
| `name` | TEXT | required |
| `region` | TEXT | required, e.g. `kelowna`, `west-kelowna`, `naramata` |
| `type` | TEXT | required, e.g. `restaurant`, `winery`, `brewery`, `cafe`, `pub`, `cocktail` |
| `cuisine` | TEXT | nullable |
| `phone` | TEXT | nullable |
| `price` | INTEGER | 1–4, nullable |
| `reviews` | INTEGER | review count, nullable |
| `rating` | REAL | 0–5, nullable |
| `description` | TEXT | |
| `dog_friendly` | INTEGER | 0/1 boolean |
| `vegan` | INTEGER | 0/1 boolean |
| `vegetarian` | INTEGER | 0/1 boolean |
| `patio` | INTEGER | 0/1 boolean |
| `kid_friendly` | INTEGER | 0/1 boolean |
| `gluten_free` | INTEGER | 0/1 boolean |
| `lake_view` | INTEGER | 0/1 boolean |
| `nonalcoholic` | INTEGER | 0/1 boolean |
| `sports_tv` | INTEGER | 0/1 boolean |
| `live_music` | INTEGER | 0/1 boolean |
| `created_at` / `updated_at` | TEXT | auto-managed timestamps |

## API

All responses are JSON. CORS is open (`*`) so the frontend can call this
from anywhere during development.

### `GET /api/venues`

List venues with optional filters and pagination.

Query params:
- `region` — exact match, e.g. `?region=kelowna`
- `type` — exact match, e.g. `?type=winery`
- `search` — substring match against name, description, cuisine
- `min_rating` — e.g. `?min_rating=4.5`
- Any boolean field as a flag: `?dog_friendly=1`, `?vegetarian=1`, `?vegan=1`, etc.
- `page` (default 1), `limit` (default 50, max 200)

Filters combine with AND. Example:

```
GET /api/venues?region=kelowna&vegetarian=1&min_rating=4.5&limit=10
```

Response shape:

```json
{
  "total": 12,
  "page": 1,
  "limit": 10,
  "total_pages": 2,
  "venues": [ { "id": 530, "name": "Bai Tong Thai Restaurant", ... } ]
}
```

### `GET /api/venues/:id`

Single venue by id. 404 if not found.

### `POST /api/venues`

Create a venue. `name`, `region`, and `type` are required; everything else
is optional. Send only the fields you have — omitted booleans default to
`false`, omitted text/number fields default to `null`.

```bash
curl -X POST http://localhost:3001/api/venues \
  -H "Content-Type: application/json" \
  -d '{"name":"New Spot","region":"kelowna","type":"cafe","dog_friendly":true}'
```

### `PUT /api/venues/:id`

Partial update — send only the fields you want to change. 404 if the venue
doesn't exist.

### `DELETE /api/venues/:id`

Deletes the venue. Returns `{"success":true}` or 404.

### `GET /api/stats`

Summary counts: total venues, how many have phone numbers, vegetarian/vegan
counts, and a breakdown by region and type. Useful for a dashboard or for
tracking backfill progress instead of eyeballing it in the HTML.

## What's next

The frontend is now wired up: `okanagan.html` fetches all venues from
`GET /api/venues` on page load and renders them into the grid, instead of
having 812 cards hardcoded in the HTML. Everything else on the site
(filters, wizard, search, badges, directions/menu/booking links, map,
sorting) runs after that fetch resolves and works exactly as it did before,
since it operates on the same `data-*` attributes either way.

**This means the site now requires the API server to be running** —
`npm start` in this folder — before opening `okanagan.html`. If the API
isn't reachable, the page shows a plain message telling you to start it
instead of silently looking broken.

`API_BASE` is set near the top of `okanagan.html`'s `<script>` tag
(currently `http://localhost:3001`). If you deploy this API somewhere
real (Render, Railway, Fly.io, a VPS), update that one line to point at
the deployed URL instead of localhost, and CORS is already open (`*`) so
it'll work from any origin.

Venues can now be added, edited, or removed with a `POST`/`PUT`/`DELETE`
call instead of hand-editing HTML — see the API section above.
