# Owner video uploads: one-time setup (Cloudflare R2)

Videos go from the owner's phone straight to a private Cloudflare R2 bucket; the Railway volume is never used.
The "Share a video" tile stays hidden until all four variables below are set in Railway.

1. Cloudflare dashboard > R2 > Create bucket (e.g. `okr-videos`, location automatic). Keep it private (no public access).
2. Bucket > Settings > CORS policy:
   ```json
   [{ "AllowedOrigins": ["https://okanaganroam.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
   ```
3. R2 > Manage API tokens > Create token: permission "Object Read & Write", limited to that one bucket. Copy the Access Key ID and Secret Access Key.
4. Railway > okanagan-roam service > Variables:
   - `R2_ACCOUNT_ID` (Cloudflare account id, 32 hex characters, shown on the R2 page)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
5. After the deploy, open any owner link: a "Share a video" tile appears.

Review: /admin/review > Videos. Watch or download, approve, then delete once the reel is posted (free tier is 10 GB).
Limits: 150 MB and 2 minutes per clip, 5 waiting per business, 12 per day per network.
