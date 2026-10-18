# Okanagan Roam session replay — prepared, not deployed

Project: https://clarity.microsoft.com/projects/view/yzgkdc4ogk/
Project ID: `yzgkdc4ogk`
Account: okanaganroam@gmail.com
Website: https://okanaganroam.com

The owner explicitly authorized accepting the Clarity terms on October 17, 2026. Marketing emails were left unchecked. Project masking is Strict (all text masked); bot detection remains enabled. No Google Analytics or advertising account access was added.

## Local implementation

Branch: `codex/session-replay` in the existing isolated worktree.

`session-replay.js` renders an optional consent UI and loader. The server emits it only when a valid `CLARITY_PROJECT_ID` is explicitly configured. No production configuration has been changed.

- No Clarity script request before opt-in; declining loads no cookieless recorder.
- Text is also masked on the body before loading the vendor.
- Analytics storage granted, advertising storage denied via Consent API V2.
- Recording preferences remain available on eligible pages. Declining after opt-in sends denial and reloads to unload the vendor. Cross-tab revocation also reloads.
- Only HTTPS on okanaganroam.com and selected public discovery/listing paths qualify. Localhost, internal-cookie visits, private forms, map and trip pages are excluded.
- Any query string or fragment, including campaign/filter parameters, excludes the page. Referrers with a query or fragment also exclude it. This deliberately reduces coverage.
- Private SPA destinations trigger full navigation while recording. Declined visits retain normal SPA behavior.
- No user identification or custom personal fields are sent.
- English/French consent copy; privacy disclosure prepared in the server template.
- This consent applies to replay only. Existing Google Analytics consent behavior is unchanged.

## Not yet live

Do not push or deploy without the owner's explicit deployment authorization. Deployment would require publishing this code and configuring `CLARITY_PROJECT_ID=yzgkdc4ogk` on the host. The project ID is public, not a secret.

Before activating for visitors, verify the actual banner layout and vendor network behavior in a controlled browser, including decline, opt-in, masking, revocation, protected-route navigation, and sensitive URLs. The isolated runtime tests exercise consent gates without sending test traffic to Microsoft. They are not proof of a received production recording.

After an authorized deployment, verify a consented test recording is received and review it in Clarity's Recordings tab. No recording has been verified yet.

Primary documentation:
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/privacy-disclosure

## Verification — October 17, 2026

- 14 replay runtime tests and the renderer integration test passed.
- `npm test`: 1,664 tests; 1,662 passed, 2 failed.
- Both failures also reproduced against unchanged `HEAD:server.js`:
  - `sports listings show a matched local photo on the valley hub, region category, and API`
  - `Outdoor activity banners (2026-10-13): each live activity page opens with its own photo; the /outdoors landing swaps photo, heading and intro for a single pressed activity`
- JavaScript syntax and diff whitespace checks passed.
- The fixture database produced by the test suite was restored to the pre-test committed file. Existing backup JSON files were preserved.
- No commit was pushed, no deployment triggered, and no production variable changed.

## Authorized release — October 17, 2026

The owner subsequently said: “deploy it so i can start watching.” This authorizes publishing the integration and configuring its Clarity project ID on Railway.

Pre-release browser rehearsal used a localhost-only fixture and local vendor stub: decline made no vendor request; opt-in loaded with body masking; page-anchor navigation unloaded; revoking consent reloaded with no vendor. The fixture is not included in this release.

Two reviewed navigation fixes preserve modified clicks/new tabs and ensure fragment-only navigation unloads the recording document. Sixteen replay runtime tests and the integration test pass. Full isolated-export suite: 1,666 tests, 1,664 passed, with only the two previously documented baseline photo failures. Frozen files and committed database remain unchanged.
