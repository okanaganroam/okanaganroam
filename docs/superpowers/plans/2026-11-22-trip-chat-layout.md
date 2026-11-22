# Approved trip chat workspace implementation

Goal: implement the approved photo-led itinerary + chat mockup, planning/save/share only, direct booking links per stop.

Use the existing V3/V4 planner, chat API, state/Undo, trip storage and sharing. Add a scoped workspace view module loaded after V4 and chat clients, with responsive styles. Leave non-chat V3/V4 flows intact.

1. Add tested pure helpers for selecting a valid day and a safe existing booking link for a venue. Keep unlisted links absent, favour a business link over affiliates, and label provider links honestly.
2. Add photo-led stop cards (real stopPhotoUrl), fit summary, labelled Swap/Remove, inline details/booking links. Add a day selector retaining the selected day through edits; a chat edit to another day reveals that day before highlighting it.
3. Expose existing Save and Share handlers in the plan header before confirmation. Preserve Save's Replace/Add safeguard and share snapshot persistence. Replace confirmation/checkout framing with a short direct-booking note. Move optional stays/transport below the itinerary into a disclosure.
4. Desktop: itinerary column + sticky chat sidebar. Mobile: itinerary, visible Save/Share/day controls and compact fixed chat composer. Keep typed text across renders, original chat/Undo behavior and focus/reduced-motion behavior.
5. Run isolated trip-chat/V4/save/share regressions and review. Test local then deploy and verify matching Railway release. Test live mobile/desktop chat change + Undo, day navigation, direct links, Save reload and Share/copy snapshot. Save screenshots and reset viewport.

Review focus: state preservation across edits, hidden days still included in saved/shared itinerary, accessibility/focus, external URL validation, no checkout/confirmed-reservation claims, no fabricated photos or prices. No database changes deployed.
