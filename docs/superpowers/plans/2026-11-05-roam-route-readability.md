# Roam Now readability follow-up

Apply the three explicitly requested corrections within the current layout:
- Remove selected-filter counts from Show places/Show events. Keep counts on Filters and section summaries.
- Route location help uses one cause-specific sentence and one next-step sentence, in English and French. Browsing help remains separate.
- Increase the mobile route-preview sheet while retaining a visible map. Put the turn list immediately after the time/distance summary and the longer location explanation afterward. Exclude live-navigation mode from the sheet-height change; derive route-map padding from the actual sheet height with a map-size bound.

Validation: 50 focused map/return/search/filter tests pass; local real-route preview at390×844 puts first turn at558px, at320×568 at437px, without horizontal overflow. Verify production after release. Moving GPS and spoken guidance remain outside this stationary browser test.
