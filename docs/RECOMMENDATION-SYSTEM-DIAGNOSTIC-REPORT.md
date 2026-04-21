# Recommendation System — Full Implementation Diagnostic Report

**Purpose:** Extract and document the complete implementation of the recommendation system, including free-tier vs pro-tier logic, for external review.  
**No code was modified.** This document is extraction and documentation only.

**Generated:** 2026-03-14

---

## 1. Free Tier Rendering Pipeline

### 1.1 Entry point

- **Component:** `components/DetailedMetricsBoard.tsx`
- **Prop:** `isProUser` (default `false`). When `isProUser === false`, the drawer renders free-tier content.

### 1.2 Free-tier branch (primary path — metric intelligence available)

**Location:** `DetailedMetricsBoard.tsx` ~1274–1312 (first drawer content block).

**Condition:**
```tsx
{!isProUser ? (
  <>
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-sm font-semibold text-[var(--foreground)]">
        Top contributing causes
      </span>
    </div>
    <ul className="space-y-2 mb-4">
      {groupedFreeTier.map((g, i) => (
        <li key={i} className="text-sm text-[var(--foreground)]">
          {g.label} ({g.count})
        </li>
      ))}
    </ul>
    {auditTab === "financial" && (
      <div className="rounded-lg border ...">
        ... "See exactly what is costing you revenue" ...
        <button onClick={() => setUpgradeDemoOpen(true)}>Unlock Performance Intelligence</button>
        ...
      </div>
    )}
  </>
) : ( ... Pro branch ... )}
```

**Data flow for free tier:**

1. **Resources** come from either:
   - `metricIntelligence?.intelligence?.contributingResources`, or
   - Fallback from `active.resources` (dashboard metric) with type/urgency, or
   - `getResourcesFromRawAudit(rawAudit, active.label)` when no intelligence/resources.
2. **Attribution:** `attributeLeakToResources(leakForMetric, resourcesForAttribution)` (revenue leak calculator).
3. **Deduplication:** `deduplicateResourcesByUrl(resources, attributedAmounts)` → `dedupedResources`.
4. **Grouping:** `groupedFreeTier = groupResourcesForFreeTier(dedupedResources)`.
5. **Rendering:** Free tier **does not** use `resources.map` or `displayItems`. It uses **`groupedFreeTier.map`** only, showing `g.label` and `g.count` (e.g. "JavaScript execution bundles (4)", "Third-party scripts (3)").

**Free tier does NOT show:**

- Per-resource URLs or filenames.
- Revenue amounts or leak attribution.
- Recommendations (Why / Recommended fix / Expected improvement).
- Confidence explanation.
- More than the grouped list and, on Financial tab only, the upgrade CTA block.

### 1.3 Free-tier branch (fallback path — AI analysis with resources, no metric intelligence)

**Location:** `DetailedMetricsBoard.tsx` ~1479–1526.

When `shortText` is falsy but `active.resources` exists, the same pattern applies:

- `groupedFallbackFreeTier = groupResourcesForFreeTier(dedupedFallbackResources)`.
- `{!isProUser ? ( ... groupedFallbackFreeTier.map ... + Financial tab CTA ... ) : ( ... Pro fallback ... )}`.

Again, free tier uses **grouped list only** (`groupedFallbackFreeTier.map`), not `fallbackDisplayItems.map`.

### 1.4 Technical tab–only content (both tiers)

- **Metric explanation** (short + detailed) and impact/strategic context are shown only when `auditTab === "technical"` (lines ~1256–1272). This is not gated by `isProUser`; both free and Pro see it on the Technical tab.

---

## 2. Pro Tier Rendering Pipeline

### 2.1 Condition

- **Component:** `DetailedMetricsBoard.tsx`
- **Pro when:** `isProUser === true`.
- **Derived:** `showFinancial = auditTab === "financial" && isProUser` (and `fallbackShowFinancial` for fallback path).

### 2.2 Pro branch (primary path)

**Location:** ~1313–1354.

**Rendering:**

1. **Financial header (Financial tab only):** If `showFinancial && leakForMetric > 0`: shows `formatCurrency(leakForMetric)/mo` and confidence + `confidenceExplanation`.
2. **Section title:** "Top contributing resources (10 of N)" or "Contributing Resources (N)".
3. **List:** `displayItems.slice(0, 10).map((item, idx) => { ... })` — i.e. **top 10 deduped resources**, not grouped.
4. **Per resource (Pro):**
   - **Display name:** `showFinancial ? truncateUrl(res.url) or res.url : getGenericResourceLabel(res.type)` — so on Financial tab Pro sees URLs/filenames; otherwise generic label.
   - **Badges:** type, urgency, and when `showFinancial && resourceLeak > 0`: revenue badge + confidence (e.g. "$202/mo · High").
   - **Recommendation block (only when `showFinancial && rec`):**
     - "Why this matters" → `rec.why`
     - "Recommended fix" → `rec.action`
     - "Expected improvement" → "Recover $X/mo in {metric} revenue."

**Recommendation generation (Pro only):**

- `rec = showFinancial ? getMetricResourceRecommendation(active.label, res) : null`
- So recommendations are **only rendered on the Financial tab for Pro users**. They are produced by `getMetricResourceRecommendation()` in `DetailedMetricsBoard.tsx` (context-aware, resource-type and metric-specific; uses filename, execution time, size thresholds).

### 2.3 Pro fallback path (AI analysis with resources)

**Location:** ~1428–1594.

- Uses `fallbackDisplayItems.slice(0, 10).map(...)` with the same structure: resource name, badges, revenue, and when `fallbackShowFinancial && rec`: Why / Recommended fix / Expected improvement.
- `rec = fallbackShowFinancial ? getMetricResourceRecommendation(active.label, res) : null`.

### 2.4 Summary

- Pro content is gated by `isProUser`. Revenue, per-resource list (top 10), confidence explanation, and recommendation blocks appear only when `isProUser` is true and (for financial/recommendations) when `auditTab === "financial"`.

---

## 3. Paywall Logic Implementation

### 3.1 Where `isProUser` is set (sources of truth)

| Location | Logic | Notes |
|----------|--------|--------|
| **`app/dashboard/[projectId]/page.tsx`** (lines 383–386) | `isProUser={ (typeof data.userPlan === "string" && data.userPlan === "pro") \|\| demoProUnlocked }` | Dashboard: Pro only if stored data has `userPlan === "pro"` or user has unlocked demo. **Does not** use `userAuthenticated`. |
| **`app/report/page.tsx`** (line 253) | `isProUser={demoProUnlocked}` | Report page: Pro only when demo unlocked (from localStorage). |
| **`components/DetailedMetricsBoard.tsx`** (line 957, 970–971) | Default `isProUser = false`; JSDoc: "Must be: user?.plan === 'pro' \|\| (typeof window !== 'undefined' && localStorage.getItem('demoPro') === 'true')" | Consumer must pass correct value; component does not read localStorage itself. |

### 3.2 Where `demoPro` / demo unlock is used

| Location | Code / behavior |
|----------|-----------------|
| **`app/dashboard/[projectId]/page.tsx`** | `const [demoProUnlocked, setDemoProUnlocked] = useState(false);` — `useEffect` reads `localStorage.getItem("demoPro") === "true"` and sets `setDemoProUnlocked(true)`. `onDemoUpgrade={() => setDemoProUnlocked(true)}` passed to `DetailedMetricsBoard`. |
| **`app/report/page.tsx`** | Same: `demoProUnlocked` state synced from `localStorage.getItem("demoPro") === "true"`; `onDemoUpgrade` sets it true. `isProUser={demoProUnlocked}`. |
| **`components/UpgradeModal.tsx`** | On "Complete Demo Upgrade": `localStorage.setItem("demoPro", "true")`, then `onUpgraded?.()`, close modal, open `/financial-report?metric=...&projectId=...`. |
| **`app/financial-report/page.tsx`** | `const isPro = localStorage.getItem("demoPro") === "true";` — if not Pro, redirects to dashboard. Page is Pro-only. |

### 3.3 Where `userAuthenticated` and `userPlan` come from

| Location | Code |
|----------|------|
| **`app/api/analyze/route.ts`** | Cache hit (line ~242): `const response = { ...cached, userAuthenticated: !!session?.user };` — Full run (line ~760): response includes `userAuthenticated: !!session?.user`. **Note:** API does **not** set `userPlan`; only `userAuthenticated` is set from session. |
| **Dashboard data** | `data` is from `stored.data` (sessionStorage). So `userAuthenticated` and `userPlan` in `data` come from the analyze API response (and any code that later adds `userPlan` to stored payload). Dashboard uses only `userPlan === "pro"` and `demoProUnlocked` for `isProUser`, not `userAuthenticated`. |

### 3.4 All UI checks involving tier

- **`DetailedMetricsBoard.tsx`:**
  - `!isProUser` → render free tier (grouped list + optional Financial CTA).
  - `isProUser` → render Pro tier (resource list, revenue, recommendations when `showFinancial`).
  - `showFinancial = auditTab === "financial" && isProUser` — revenue and recommendation blocks only when both Financial tab and Pro.
  - Upgrade CTA: `auditTab === "financial" && (free tier)` → show "Unlock Performance Intelligence" and open `UpgradeModal` on click (`setUpgradeDemoOpen(true)`).

---

## 4. Recommendation Generation Logic

### 4.1 Where recommendations are generated

- **Function:** `getMetricResourceRecommendation(metricLabel, resource)` in `components/DetailedMetricsBoard.tsx` (lines ~389–709).
- **Not used:** `lib/recommendationEngine.ts` exports `generateSimpleRecommendation(resourceContext)`; it is **not** referenced in `DetailedMetricsBoard.tsx`. The drawer uses only the local context-aware `getMetricResourceRecommendation`.

### 4.2 Inputs and behavior of `getMetricResourceRecommendation`

- **Inputs:** `metricLabel` (e.g. "Largest Contentful Paint (LCP)"), `resource` (`ContributingResource`: url, type, transferSize, executionTimeMs, affects, causeType, etc.).
- **Helpers used:** `getFilenameFromUrl(resource.url)`, `formatExecMs(executionTimeMs)`, `formatSizeForRec(transferSize)`, size thresholds `SIZE_500_KB`, `SIZE_1_MB`.
- **Output:** `{ action: string; why: string; technicalDetails: string[] }`.
- **Logic:** Deterministic rules by resource type (image, font, js/javascript, css, document/other) and metric (LCP, TTI, TBT, Speed Index, CLS, Unused JS, Bootup, TTFB, etc.). Scripts use execution severity (>500 ms vs <100 ms) and size (>500 KB, >1 MB) for fix suggestions. "Why" text is metric-specific from a fixed map.

### 4.3 Where recommendations are rendered

- Only in the **Pro** branch and only when **`showFinancial`** is true:
  - Primary path: `showFinancial && rec && ( ... Why / Recommended fix / Expected improvement ... )` (lines ~1319–1333).
  - Fallback path: `fallbackShowFinancial && rec && ( ... )` (lines ~1562–1586).
- Free tier **never** receives or displays recommendation content.

### 4.4 Resource attribution used for recommendations

- **Leak:** Per-metric leak from `leakByMetric` (or derived from `estimatedMonthlyLeak` via `getTopFiveUnderperformers` / `distributeLeakBySeverity` when `leakByMetric` not provided).
- **Attribution:** `attributeLeakToResources(leakForMetric, resourcesForAttribution)` in `lib/impactEngine/revenueLeakCalculator.ts`.
- **Deduplication:** `deduplicateResourcesByUrl(resources, attributedAmounts)` in `DetailedMetricsBoard.tsx`.
- **Priority:** `computePriorityScores(dedupedResources, dedupedAmounts)` — normalized 0–100; display order is by priority (top 10).
- **Confidence:** `getConfidenceForResource(attributedLeak, leakForMetric, metricSeverity, resourceCount)` and `getConfidenceExplanation(attributedAmounts, leakForMetric)` — shown only in Pro Financial tab.

---

## 5. Resource Grouping Logic (Free Tier)

### 5.1 `groupResourcesForFreeTier`

**Location:** `components/DetailedMetricsBoard.tsx` lines 292–308.

**Signature:**
```ts
function groupResourcesForFreeTier(resources: ContributingResource[]): ResourceGroup[]
```
**Type:** `ResourceGroup = { label: string; count: number; impact: number }`.

**Implementation (exact):**
```ts
function groupResourcesForFreeTier(resources: ContributingResource[]): ResourceGroup[] {
  const byKey = new Map<string, { label: string; count: number; impact: number }>();
  for (const res of resources) {
    const key = getCategoryKeyForGrouping(res);
    const label = getResourceCategoryLabel(res);
    const impactVal = URGENCY_WEIGHT[res.urgencyLevel] ?? 1;
    if (byKey.has(key)) {
      const g = byKey.get(key)!;
      g.count += 1;
      g.impact = Math.max(g.impact, impactVal);
    } else {
      byKey.set(key, { label, count: 1, impact: impactVal });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.impact - a.impact);
}
```

- **Category key:** `getCategoryKeyForGrouping(res)` — stable key from resource type + third-party (e.g. "js-first", "js-third", "font", "image", "css", "document", "other").
- **Category label:** `getResourceCategoryLabel(res)` — human-readable plural (e.g. "JavaScript execution bundles", "Third-party scripts", "Web fonts blocking render", "Large image assets", "Render blocking stylesheets", "Page document", "Other resources").
- **Impact:** `URGENCY_WEIGHT`: High=3, Medium=2, Low=1; per-group impact is max urgency in group.
- **Sort:** By count descending, then impact descending.

### 5.2 Where it is used

- **Primary path:** After dedup: `groupedFreeTier = groupResourcesForFreeTier(dedupedResources)` (line 1206). Free-tier UI: `groupedFreeTier.map((g, i) => <li key={i}>{g.label} ({g.count})</li>)`.
- **Fallback path:** `groupedFallbackFreeTier = groupResourcesForFreeTier(dedupedFallbackResources)` (line 1468). Free-tier UI: `groupedFallbackFreeTier.map((g, i) => <li key={i}>{g.label} ({g.count})</li>)`.

### 5.3 UI rendering: grouped vs per-resource

- **Free tier:** Uses **only** `groupedFreeTier.map` / `groupedFallbackFreeTier.map`. It does **not** use `resources.map` or `displayItems.map` for the main content.
- **Pro tier:** Uses **only** `displayItems.slice(0, 10).map` / `fallbackDisplayItems.slice(0, 10).map`. No grouping in Pro list.

---

## 6. Upgrade CTA Logic

### 6.1 When the upgrade CTA appears

- **Condition:** User is on **Financial** tab (`auditTab === "financial"`) and is **free tier** (`!isProUser`).
- **Placement:** Inside the same "Top contributing causes" block, below the grouped list. Two places: primary path (~1291–1311) and fallback path (~1486–1525).
- **Content:** Card with "See exactly what is costing you revenue", short copy, and button "Unlock Performance Intelligence" that calls `setUpgradeDemoOpen(true)`.

### 6.2 Modals

| Modal | When shown | Effect |
|-------|------------|--------|
| **UpgradeModal** | `upgradeDemoOpen === true` (opened by "Unlock Performance Intelligence" in drawer). | "Complete Demo Upgrade" → `localStorage.setItem("demoPro", "true")`, `onDemoUpgrade()`, close, open `/financial-report?metric=...&projectId=...`. |
| **ProUpgradeModal** | `proUpgradeModalOpen === true`. | "Start 14-Day Pro Trial" link to `/dashboard` (placeholder). No localStorage or demo unlock. Set by `setProUpgradeModalOpen(true)` — used elsewhere (e.g. blurred "Unlock with Pro" badge). |

### 6.3 Free-tier drawer CTA

- The free-tier drawer **does** contain an upgrade CTA, but **only when the user is on the Financial tab**. On the Technical tab, free users see only the grouped list and metric explanation; no CTA in the drawer.

### 6.4 Other components (not used in metrics drawer)

- **ReportLockWrapper:** Wraps content in blur + overlay with "Create an account to unlock..." and Sign Up / Login links when `isLocked`. Not used in `DetailedMetricsBoard` or the dashboard/report flows documented here.
- **FixBlueprintLockedPreview:** Renders "Unlock to see Fix Blueprint" with `onUpgrade`. **Not** used in `DetailedMetricsBoard.tsx`; FixBlueprintPro is also not used in the current drawer (recommendations are inline via `getMetricResourceRecommendation`).

---

## 7. Identified Inconsistencies or Missing Checks

### 7.1 Unused import

- **`getGenericCategoryForResource`** is imported from `@/lib/metricDrawerMonetization` in `DetailedMetricsBoard.tsx` but never used. The free-tier display name uses the local **`getGenericResourceLabel(res.type)`** (and Pro uses URL/truncate or that same helper when not showFinancial). So either the import is dead or intended for future use.

### 7.2 `lib/recommendationEngine.ts` unused in drawer

- The shared **`generateSimpleRecommendation(resourceContext)`** in `lib/recommendationEngine.ts` is not used by `DetailedMetricsBoard`. All in-drawer recommendations come from **`getMetricResourceRecommendation`** in the component. If the intent is a single recommendation engine, consider centralizing on one or the other and documenting.

### 7.3 `userPlan` not set by API

- **`app/api/analyze/route.ts`** only sets **`userAuthenticated: !!session?.user`** in the response. It does **not** set `userPlan`. So on the dashboard, `data.userPlan === "pro"` can only be true if something else (e.g. another API or client) adds `userPlan` to the stored payload. Currently, dashboard Pro access is effectively **demo only** (`demoProUnlocked`) unless `userPlan` is populated elsewhere.

### 7.4 ProUpgradeModal vs UpgradeModal

- **ProUpgradeModal** does not set `demoPro` or call an `onUpgraded` callback; it only links to checkout/dashboard. **UpgradeModal** is the one that performs the demo unlock and opens the financial report. So any "Unlock with Pro" that should grant demo access must open **UpgradeModal**, not only ProUpgradeModal.

### 7.5 CTA only on Financial tab

- The in-drawer upgrade CTA ("Unlock Performance Intelligence") appears **only when the user is on the Financial tab**. If the user stays on the Technical tab, they never see this CTA in the drawer. Design choice; documented for review.

### 7.6 FixBlueprintPro / FixBlueprintLockedPreview

- **FixBlueprintPro** and **FixBlueprintLockedPreview** (and `getFixBlueprintSteps` from `metricDrawerMonetization`) are not used in the current drawer implementation. Recommendations are rendered inline (Why / Recommended fix / Expected improvement) from `getMetricResourceRecommendation`. No inconsistency in behavior; just a note that the FixBlueprint components exist for possible alternate UI.

---

## File Reference Summary

| File | Role |
|------|------|
| `components/DetailedMetricsBoard.tsx` | Main drawer; free/Pro branching; `groupResourcesForFreeTier`; `getMetricResourceRecommendation`; upgrade CTA; uses `UpgradeModal` and `ProUpgradeModal`. |
| `app/dashboard/[projectId]/page.tsx` | Sets `isProUser` from `userPlan === "pro"` or `demoProUnlocked`; syncs `demoPro` from localStorage; passes `onDemoUpgrade`. |
| `app/report/page.tsx` | Sets `isProUser={demoProUnlocked}`; same demo sync and `onDemoUpgrade`. |
| `app/api/analyze/route.ts` | Adds `userAuthenticated: !!session?.user` to response; does not set `userPlan`. |
| `app/financial-report/page.tsx` | Pro-only page; uses `localStorage.getItem("demoPro") === "true"` to allow access. |
| `components/UpgradeModal.tsx` | Demo upgrade: sets `demoPro`, calls `onUpgraded`, opens financial report. |
| `components/ProUpgradeModal.tsx` | Generic Pro CTA; no demo unlock. |
| `lib/metricIntelligenceEngine.ts` | Defines `ContributingResource`, `analyzeMetric()`; supplies resources for drawer. |
| `lib/impactEngine/revenueLeakCalculator.ts` | `attributeLeakToResources`, `getTopFiveUnderperformers`, `distributeLeakBySeverity`. |
| `lib/metricDrawerMonetization.ts` | `getGenericCategoryForResource`, `getFixBlueprintSteps`; FixBlueprint* components use it; drawer uses only local helpers for labels. |
| `lib/recommendationEngine.ts` | `generateSimpleRecommendation` — not used by DetailedMetricsBoard. |

---

*End of diagnostic report. No code was modified.*
