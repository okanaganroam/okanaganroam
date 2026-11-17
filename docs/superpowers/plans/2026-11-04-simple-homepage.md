# Approved simpler homepage implementation

Owner approved outputs/homepage-preview/revised.html, before the rejected town-filter/card-detail additions, and explicitly authorized live publication. Preserve its photo-led layout, compact search, prominent Roam Now/Happy Hour Now, six photo categories, Editor's Picks before weekend events, photo Hidden Gems/destinations and trip banner. No town filter or extra venue-details fields.

Use a focused pure homepage module that receives the existing server-rendered dynamic sections. Extract existing card HTML/data instead of copying sample content. Keep existing metadata, shared navigation/trip tray, search behaviour, language support, seasonal photos and active/closed pick filtering. Scope CSS to the new homepage wrapper, not shared pages. Footer retains all real links and collapses on mobile. Frozen template/assets and production database unchanged.

Steps: regression tests RED; implement pure module and homepage-only call site; translate new copy; local actual renderer at desktop/mobile and French; search, More Picks/footer tests and frozen-file checks; independent final review; commit/merge authorized; verify live English/French/responsive behaviour and health, record PR evidence. Compare other page output/route and concurrent origin/main before merge.
