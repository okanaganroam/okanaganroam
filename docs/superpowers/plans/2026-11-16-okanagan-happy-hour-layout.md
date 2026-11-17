# Okanagan Happy Hour Now layout parity

Port the approved and deployed Whistler Happy Hour presentation into Okanagan's shared map, preserving Okanagan's own venues, real photos, verified deal freshness checks, geography, routing and existing upcoming-entry fallback.

1. Reuse the tested offer helper and responsive CSS: offer and ending countdown before generic amenities, full-width mobile Filters, focused Happy Hour header and selected pill, no duplicate mode/category clutter. Preserve general Roam Now.
2. Preserve later-today/tomorrow fallback with honest header, pill, result count and upcoming badge. Never label an upcoming offer on-now or invent a countdown/price for tomorrow.
3. Run isolated Roam Now and happy-hour regressions. Review diff, publish via PR and verify Railway release.
4. Test homepage entry, real photo/deal cards, town/search/filters, details/Back and built-in routes at phone and desktop sizes; save live screenshots and reset viewport.

Review focus: real-time availability; unlisted and stale prices; future labels; clearing happy mode; Back/filter preservation; route UI unaffected. No database changes deployed.
