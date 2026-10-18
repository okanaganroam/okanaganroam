# Okanagan Roam session replay

Project: https://clarity.microsoft.com/projects/view/yzgkdc4ogk/impressions
Project ID: `yzgkdc4ogk`
Account: okanaganroam@gmail.com

## Automatic cookieless mode — October 18, 2026

The owner explicitly requested “record visitors automatically without asking,” superseding the earlier opt-in design. No popup, consent buttons or Recording preferences control are rendered.

- Microsoft Clarity's documented limited cookieless mode is used. Both `ad_Storage` and `analytics_Storage` are sent as `denied` before vendor loading. No affirmative consent is fabricated.
- Cookies are switched Off in Clarity project settings; strict masking and bot detection remain enabled.
- Body text is explicitly masked before vendor initialization. No identify calls or custom personal fields are sent.
- Public discovery/listing pages qualify; internal-cookie traffic, private forms, maps, trip pages, URL queries/fragments and parameterized referrers remain excluded.
- Prior recording refusals remain respected. GPC and DNT browser signals also suppress replay. Failure to read the legacy preference fails closed.
- The replay integration writes no local-storage preference or persistent visitor ID. Cookie consent denial prevents Clarity's persistent cookies; pageviews are not joined into a visitor journey.
- Privacy disclosure describes the automatic mode and its exclusions. Google Analytics settings are unchanged.
- Navigation protections preserve new tabs and modified clicks. Same-page query or fragment changes (filters, sort, ?q=, #main) stop the recorder for the rest of that page view without reloading (2026-10-18); private destinations on another path still navigate fully.

## Validation

Sixteen replay runtime tests pass, including new-visitor automatic loading, no interface, both storage signals denied, no local-storage writes, prior refusal, GPC/DNT, masking and protected navigation. Source review found no critical or important issues.

Full isolated-export suite: 1,668/1,671 pass. Three existing baseline failures: Toncini verified-hours rendering, sports photo matching, and outdoor activity banners. Frozen assets and committed database are unchanged.

## Earlier release

The original opt-in integration was deployed as PR #319, merge 73444086d16133b7b5e111db0d378212247f1eda, Railway deployment 2c944335-0276-4815-a054-b329a9b0a3d1. Live consent, masking, revocation and received replay frames were verified then. The automatic mode supersedes its consent interface.

Primary sources:
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-without-cookie-consent
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking
