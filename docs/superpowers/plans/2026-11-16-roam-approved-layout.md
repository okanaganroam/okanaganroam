# Approved Roam Now Layout Implementation Plan

**Goal:** Publish the approved photo mockup as a responsive, real-data Roam Now layout.

**Architecture:** Keep the existing map, route, GPS, filters and saved return context. Update the discovery header and scoped discovery styles, retaining separate route and map-picker screens. Use existing venue images and recorded facts.

**Approved design:** Chat's desktop/mobile image from November 16. Cream, navy and gold. Location and GPS action, Places/Events, persistent search plus separate Filters button, removable selections, compact real-photo cards, floating mobile Map control, desktop split list and map.

- [x] Update header controls and selected-filter presentation. Keep initial mobile search and full-screen map selection usable.
- [x] Match desktop horizontal cards and mobile name-above-photo cards. Scope discovery styles so directions retain their working layout.
- [ ] Verify focused tests in a separate test database and visually test desktop and mobile, including town, GPS, filters, Events, detail/Back, directions/Start/End and mobile map picker.
- [ ] Review diff, merge, await matching Railway release, then repeat live checks and report actual limitations.

Local verification: 34 focused tests passed in a separate test database. Browser checks covered 320px, 390px and 1440px, combined requirements, selected-chip removal and reload, venue/event detail return, full map, walking/driving previews from a map pin and event date/free controls. Review caught a replayed-query regression, corrected and retested. GPS voice/arrival need a real device.
