# Roam Now first-use polish

Goal: apply the three fixes requested after the visitor retest, retaining the approved layout and navigation engine.

- Default Open now on for fresh map entry. Explicit shared searches, event entry and directions keep their intent. Serialize an empty filter selection so turning it off survives Back.
- Use expandable filter groups with selected counts, an independently scrolling body, persistent Close and Show places actions, and Clear alongside Apply.
- Distinguish browsing pins from route origins. Explain that a manual pin provides a route preview and current location enables live guidance. Keep all existing route calculations and voice logic.
- Verify defaults and URL persistence with executable regression tests; verify phone filters and directions copy in the browser. Deploy through the existing GitHub/Railway workflow if checks pass.
