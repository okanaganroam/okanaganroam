# Venue photo release — October 15, 2026

Owner authorized publication in this chat. Assets only replace generic or missing venue images; no venue hours, descriptions, flags, events or planner behavior changed.

## Sources and selections
- Marmalade Bakery: Caelin King email, October 15; explicit permission to use; professional photos credit Kiomi Photography. Selected 231119-marmalade-bakery-594 (1).jpg.
- Priest Creek: Margarita email, October 15; photos supplied for use. Selected IMG_1852.JPG exterior.
- Blue Mountain: Kirsten Munro email, October 15; photos supplied in reply to listing/social photo request. Selected Stenberg-250620-DSC04824.jpg outdoor tasting. Filename alone does not establish photographer credit; credit venue as supplier.
- JoieFarm: Stephanie Madryga email, October 15; explicitly permits any photos in shared Media Assets folder. Selected TR.jpg from JoieFarm Winery Photos. Courtesy credit to JoieFarm.
- Existing local assets restored for Summerland Heritage Cider, The Ryse, MASHAWI, Chulo, Bean to Cup, Truck 59: owner-submitted sources recorded in the earlier local venue inbox update document. Live URLs returned 404 before this release.
- Bar Travelling Man and Jaide & Joel’s already have working image assets. Reviewed supplied alternatives; retain existing covers. Jaide explicitly requests business-name credit.

## Implementation
- Ten JPEG assets added, max 1800px long edge for newly converted selections; originals preserved outside this release.
- Four image-only database changes in data/venue-photos-2026-10-15.json, using scripts/apply-venue-updates.js with expected current image values and backups.
- data/venue-photo-credits.json associates twelve selected photos with visible venue-detail photo credits, escaped in HTML. No database schema change.
- Release based on origin/main in isolated workspace; unrelated original checkout changes excluded, especially its obsolete local database.

## Validation before publication
- node --check server.js passed.
- Rendered all four new venue photo pages using current live records and asserted selected image and credit appear.
- Verified all twelve credited assets exist locally.
- Image-update script dry run identified exactly four image_url changes.
