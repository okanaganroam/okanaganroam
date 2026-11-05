# Roam Now journey fixes

Approved scope: fix the audited return-state, event-town, location/directions and mobile-density problems, then deploy.

- [x] Reproduce missing return URL and wrong-town events in behavioral tests; fix the shadowed helper and apply town to event results.
- [x] Restore entry hash intent before URL synchronization, keep search/radius/tab in the URL and per-tab return scroll context without saving GPS coordinates.
- [x] Add an explicit contextual Back to your results link; route mapped venue/event detail Directions into the existing built-in engine. Resolve destinations only from actual map data, with clear external fallback for unmapped locations.
- [x] Provide visible location retry/town/map choices; preserve a pending destination when choosing a manual start point.
- [x] Compact mobile controls, retain accessible tap targets, reset route-panel scroll and remove redundant route tabs.
- [ ] Re-run browser journeys locally and live, run focused regression checks in an isolated database copy, independent review, then deploy once complete.
