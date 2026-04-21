# Raw Audit Storage Upgrade

## 1. Prisma schema

`PerformanceSnapshot` has an optional column:

- `rawAudit Json?`

No existing columns were removed.

## 2. /api/analyze changes

- After fetching the PageSpeed response, `lighthouseResult` is taken from `pageSpeedData.lighthouseResult`.
- Before saving, heavy fields are removed via `trimLighthouseForStorage()`:
  - `lighthouseResult.fullPageScreenshot`
  - `lighthouseResult.audits["screenshot-thumbnails"]`
  - `lighthouseResult.audits["final-screenshot"]`
- The trimmed object is stored as `rawAudit` in `performanceSnapshot.create()`.
- Metric extraction and API response shape are unchanged.

## 3. Safe deletion logic

In `trimLighthouseForStorage`:

1. Deep-clone the lighthouse result so the original is not mutated.
2. `delete trimmed.fullPageScreenshot`
3. If `trimmed.audits` exists: `delete audits["screenshot-thumbnails"]`, `delete audits["final-screenshot"]`
4. Return the trimmed object (keeps `audits`, `categories`, `timing`, `environment`).

## 4. Migration commands

From the project root:

```bash
npx prisma migrate dev --name add_raw_audit
```

For production (e.g. Supabase):

```bash
npx prisma migrate deploy
```

Then regenerate the client if needed:

```bash
npx prisma generate
```

## 5. Example saved rawAudit structure (trimmed)

After a run, `rawAudit` in `performance_snapshot` looks like this (trimmed for brevity):

```json
{
  "audits": {
    "network-requests": {
      "id": "network-requests",
      "title": "Network Requests",
      "numericValue": 42,
      "details": { "items": [...] }
    },
    "render-blocking-resources": { "id": "render-blocking-resources", ... },
    "largest-contentful-paint-element": { "id": "largest-contentful-paint-element", ... },
    "long-tasks": { "id": "long-tasks", "details": { "items": [...] } },
    "layout-shift-elements": { "id": "layout-shift-elements", ... },
    "largest-contentful-paint": { ... },
    "cumulative-layout-shift": { ... }
  },
  "categories": { "performance": { ... } },
  "timing": { "total": 12345 },
  "environment": { "networkUserAgent": "...", "hostUserAgent": "..." }
}
```

Not present (removed to reduce size):

- `fullPageScreenshot`
- `audits["screenshot-thumbnails"]`
- `audits["final-screenshot"]`

## Verification (Supabase)

After migration and one analyze as a logged-in user:

1. In Table Editor, open `performance_snapshot`.
2. Confirm a `raw_audit` column exists.
3. Open the latest row’s `raw_audit` JSON.
4. Check that it contains at least:
   - `audits["network-requests"]`
   - `audits["render-blocking-resources"]`
   - `audits["largest-contentful-paint-element"]`
   - `audits["long-tasks"]`
   - `audits["layout-shift-elements"]`

If those keys exist, the upgrade is successful.
