# FEATURE REGISTRY

Quick reference for where major logic lives. Use this file to navigate the codebase.

---

## PageSpeed ingestion + CrUX field-data fallback

**Location:** `app/api/analyze/route.ts`

**Helper:** `readFieldPercentile(pageSpeedData, key)` — module-scope; returns a numeric percentile from `pageSpeedData.loadingExperience?.metrics[key]?.percentile` first, then `pageSpeedData.originLoadingExperience?.metrics[key]?.percentile`, else `null`. Used for keys `LARGEST_CONTENTFUL_PAINT_MS`, `CUMULATIVE_LAYOUT_SHIFT_SCORE`, `INTERACTION_TO_NEXT_PAINT`, `FIRST_CONTENTFUL_PAINT_MS`.

**Resolution order per metric (lab → URL field → origin field → null):**
- **LCP (ms):** `audits["largest-contentful-paint"].numericValue` → `readFieldPercentile(LARGEST_CONTENTFUL_PAINT_MS)` → `null`.
- **CLS (decimal):** `audits["cumulative-layout-shift"].numericValue` → `readFieldPercentile(CUMULATIVE_LAYOUT_SHIFT_SCORE) / 100` (CrUX stores CLS as integer × 100) → `null`.
- **INP (ms):** `audits["interaction-to-next-paint"].numericValue` → `readFieldPercentile(INTERACTION_TO_NEXT_PAINT)` → `null`. **INP is field-only** in CrUX; without the field fallback, lab-only runs return `null`, which is why the previous `|| 0` path silently logged 0 ms.
- **FCP (ms):** same pattern for `FIRST_CONTENTFUL_PAINT_MS`.

**Persistence (`prisma.performanceSnapshot.create`):**
- `lcp`, `inp`, `cls`, `ttfb` stored as **seconds / decimal** when resolved; **`null`** when genuinely missing (not `0`). Matches the `Float?` columns in `prisma/schema.prisma` so the dashboard renders `—` for missing values via existing `snapshot.inp != null` guards.
- **`trimLighthouseForStorage`** preserves **`loadingExperience`** and **`originLoadingExperience`** onto the stored `rawAudit` (alongside `lighthouseResult`) so later code paths can re-read CrUX data without another API call.

**Dev logging:** `sources: { lcp, cls, inp }` on the analyze log tags each value as `"lab" | "field" | "missing"` to diagnose CrUX vs Lighthouse coverage per URL.

**Why this matters:** The Lighthouse lab audit does **not** emit INP (it is a real-user metric). Before this change, `audits["interaction-to-next-paint"].numericValue || 0` wrote `0` to the snapshot for every URL without CrUX lab emulation, producing misleading "Interaction: 0 ms" rows in the dashboard and distorting stage attribution.

**Legacy data:** Snapshots written before this change can still contain `inp = 0`. Re-analyze the project to overwrite with the field-data value or `null`.

---

## Recommendation Engine

**Location:** `components/DetailedMetricsBoard.tsx`

**Function:** `getMetricResourceRecommendation(metricLabel, resource)` (~line 492)

**Purpose:** Generate contextual recommendations for each resource in the metric drawer (Pro, Financial tab only).

**Inputs:**
- metricLabel (e.g. "Largest Contentful Paint (LCP)")
- resource: url, type, transferSize, executionTimeMs, affects, causeType, urgencyLevel

**Outputs:**
- action
- why
- technicalDetails

**Note:** `lib/recommendationEngine.ts` exports `generateSimpleRecommendation()` but is not used by the drawer.

---

## Revenue Recovery Recommendations (copy + labels)

**Locations:**
- `components/RevenueRecoveryOpportunities.tsx` — `getRecommendationCopy(resourceType, engineKey, displayValue)`; builds opportunity list; uses attributeLeakToResources.
- `lib/revenueRecoveryLabels.ts` — `getActionTitleForResource(url, engineKey, resourceType)`; `getImprovesLabelsForMetric(engineKey)`; `resourceTypeFromUrl`, `getFilenameFromUrl`.

**Purpose:** Action titles (e.g. "Remove unused CSS", "Defer analytics scripts") and "Improves" badges (Speed, UX, Conversion, SEO) for Revenue Recovery cards. Separate from drawer recommendation engine.

---

## Revenue Attribution Engine

**Location:** `lib/impactEngine/revenueLeakCalculator.ts`

**Functions:**
- `attributeLeakToResources(totalLeak, resources)` — Distribute metric-level leak across resources. USA (square-root) weighting; impact level + resource size; sum of amounts equals totalLeak.
- `calculateRevenueLeakWithModel`, `calculateRevenueLeak` — Geometric decay model (LCP/TTI).
- `getTopFiveUnderperformers`, `distributeLeakBySeverity` — Used when leak_by_metric not provided.

**Used by:** DetailedMetricsBoard, RevenueRecoveryOpportunities, ActionPriorityAccordion, app/api/analyze, app/financial-report.

---

## Revenue Leak (behavioral headline)

**Location:** `lib/headlineRevenueLeak.ts` — `computeHeadlineRevenueLeak`, `behaviorMetricsMsFromLighthouseAudits`, `behaviorMetricsMsFromSnapshotSeconds`, `resolveLeakForMetricDrawer`

**Purpose:** Single code path for **`estimatedMonthlyLeak`** and **`leak_by_metric`** from `computeBehaviorRevenueImpact` (locked curves in `lib/impactEngine/v2BehaviorModel.ts`). Drawer/priority UI uses **`resolveLeakForMetricDrawer`** so keys like `tti` map to the behavioral interaction pool (TBT+INP) when there is no separate `tti` slice.

**Used by:** `app/api/analyze/route.ts`, `components/RevenueImpactWorkspace.tsx`, `app/dashboard/[projectId]/page.tsx` (Refine modal refresh), `components/DetailedMetricsBoard.tsx`, `components/ActionPriorityAccordion.tsx`, `app/financial-report/page.tsx`.

---

## Revenue Leak (CORTEX v2 — diagnostic)

**Location:** `lib/impactEngine/cortexV2.ts`

**Function:** `computeCortexV2(input)`

**Purpose:** Stage-based revenue loss (VISUAL_ENTRY, INTERACTION, TRUST, INFRASTRUCTURE). Secondary comparison model.

**Used by:** `app/api/analyze/route.ts` — result attached as **`cortex_diagnostic`** on the analyze JSON (does not replace headline leak).

---

## Resource Deduplication

**Location:** `components/DetailedMetricsBoard.tsx`

**Function:** `deduplicateResourcesByUrl(resources, attributedAmounts)` (~line 445)

**Purpose:** Merge resources that share the same URL; sum attributed amounts for duplicates. Prevents same resource appearing multiple times in drawer list.

---

## Priority Scoring

**Location:** `components/DetailedMetricsBoard.tsx`

**Function:** `computePriorityScores(resources, attributedAmounts)` (~line 733)

**Purpose:** Normalized score 0–100 per resource. Formula: normalizedLeak (leak/maxLeak), normalizedExec (execMs/maxExec), normalizedSize (size/maxSize); then `0.5*normLeak + 0.3*normExec + 0.2*normSize`, scaled to 0–100. Used to order top 10 resources in drawer.

---

## Confidence Model

**Location:** `components/DetailedMetricsBoard.tsx`

**Function:** `getConfidenceForResource(resourceLeak, totalLeakForMetric, metricSeverity, numberOfResources)` (~line 766)

**Purpose:** High/Medium/Low. Composite: attributionWeight (0.5) + metricSeverity (0.3) + resourceConcentration (0.2). Shown in Pro Financial tab only.

---

## Paywall System

**Locations:**
- `app/dashboard/[projectId]/page.tsx` — Sets `isProUser` from `(data.userPlan === "pro") || demoProUnlocked`; syncs `demoProUnlocked` from `localStorage.getItem("demoPro") === "true"` in useEffect; passes `isProUser` and `onDemoUpgrade` to DetailedMetricsBoard, RevenueRecoveryOpportunities, ActionPriorityAccordion.
- `app/financial-report/page.tsx` — Requires `?demo=1` to allow access; then `isProUser = (stored?.data?.userPlan === "pro") || localStorage.getItem("demoPro") === "true"`. If not Pro, renders LockedRevenueRecovery (blurred preview); if Pro, full forensic audit.
- `app/report/page.tsx` — `isProUser={demoProUnlocked}`; demoPro synced from localStorage.
- `components/UpgradeModal.tsx` — "Complete Demo Upgrade": `localStorage.setItem("demoPro", "true")`, `onUpgraded?.()`, open `/financial-report?demo=1&metric=...&projectId=...`.
- `components/LockedRevenueRecovery.tsx` — Locked state for Revenue Recovery: blurred preview of first 2 fixes + CTA "Unlock Performance Intelligence".
- `components/RevenueRecoveryOpportunities.tsx` — When `!isProUser`, renders LockedRevenueRecovery; when `isProUser`, full opportunity cards.

**Logic:** Pro access when `userPlan === "pro"` (from stored analysis data) OR `localStorage.getItem("demoPro") === "true"`. API does not set userPlan; only userAuthenticated is set.

---

## Free-Tier Grouping (drawer)

**Location:** `components/DetailedMetricsBoard.tsx`

**Function:** `groupResourcesForFreeTier(resources)` (~line 292)

**Purpose:** Group resources by category (e.g. "JavaScript execution bundles (4)", "Third-party scripts (3)"); free tier sees only grouped list, no URLs or revenue. Uses `getCategoryKeyForGrouping`, `getResourceCategoryLabel`, URGENCY_WEIGHT.

---

## Priority Fixes

**Location:** `components/ActionPriorityAccordion.tsx`

**Purpose:** Founder-facing decision list in two sections. (1) **Priority Fixes** — only items with `totalRevenueImpact > 0` and `totalRevenueImpact >= MIN_REVENUE_FOR_PRIORITY_FIX` (1); after attribution scaling, sorted by **metric-driven funnel stage** (see `lib/revenueStageDistribution.ts` — stage weight for the fix’s primary metric, then revenue, then confidence, then effort) so the top fix aligns with the highest-impact stage; `slice(0, 5)`; two-column cards (problem/fix left, revenue/effort/confidence/metric right). Header: "Recover up to $X/month across Y fixes" where X = sum(revenueFixes.totalRevenueImpact), Y = revenueFixes.length. Render safeguard: cards use `revenueFixes.filter(item => item.totalRevenueImpact > 0)` so no $0 item appears. (2) **Additional Performance Optimizations** — items with `totalRevenueImpact === 0` or `< MIN_REVENUE_FOR_PRIORITY_FIX`; sorted by `effortWeight` (low first); `slice(0, 5)`; same card layout with "Performance improvement" in place of revenue. "Open Fix Guide" links to `/dashboard/[projectId]?metric={primaryMetricKey}&tab=forensic`.

**Uses:** attributeLeakToResources, leakByMetric, metricsForDashboard; getActionGroupKey, getActionGroupLabel, getImpactExplanation, getResourceGroupLabel; BusinessProblem (Speed/SEO/Conversion) per group. Receives `projectId` for Fix Guide links and optional `revenueStageSnapshot` (dashboard builds it via `revenueStageSnapshotFromAnalyzeData`).

---

## Revenue stage distribution (metric → funnel weights)

**Location:** `lib/revenueStageDistribution.ts`

**Exports:** `getSeverity`, `computeStageMetricWeights`, `distributeRecoverableAcrossStages`, `reconcileMaxRecoverableCta`, `revenueStageSnapshotFromAnalyzeData`, `snapshotAxisSeverities`, `canonicalStageForEngineKey`, `comparePriorityFixes`.

**Purpose:** Single deterministic mapping from LCP / INP+TBT (+ optional TTI) / CLS severities to Landing vs Activation vs Conversion weights; caps conversion when CLS is good; enforces interaction dominance when interaction metrics are bad; distributes **recoverable** dollars with ≤2% drift; reconciles CTA vs stage sums. Used by **Revenue Impact** workspace stage cards + CTA and **Priority Fixes** ordering. **`snapshotAxisSeverities`** feeds internal presentation inputs (same bands; not shown as a separate UI block).

---

## System diagnosis & primary constraint (internal signals only)

**Locations (no dashboard card):**
- `lib/systemDiagnosisPresentation.ts` / `lib/systemDiagnosis.ts` — structured presentation inputs; **`presentSystemDiagnosis`** remains for tests or non-UI callers only.
- `lib/primaryConstraintPresentation.ts` — **`strongestConstraintAxis`**, **`presentPrimaryConstraint`**; **`buildPrimaryConstraintPresentationInputFromAnalyzeData`** in `lib/primaryConstraint.ts`.
- **Founder narrative:** `dominantStage`, **`worstMetricGroup`** (strongest constraint axis), **`contributingSignals`**, and overall risk level (→ revenue exposure tone) are **only** passed into **`generateExecutiveSummaryParagraph`** in `lib/executiveSummaryParagraphOpenAI.ts`. They are **not** rendered as standalone UI.

---

## Website Health card (dashboard)

**Locations:**
- `components/dashboard/WebsiteHealthCard.tsx` — Title, score (0–10 from overall health), progress bar, rule-based status line, freshness caption.
- `lib/dashboardWebsiteHealthCopy.ts` — **`analysisFreshnessCaption`**, **`websiteHealthInterpretationLine`** (display-only; thresholds on the same 0–10 scale as the headline score).

**Purpose:** Compact **status** card in the first column of the **metrics row** below the full-width executive summary strip.

---

## AI Executive Summary (analyze + dashboard)

**Locations:**
- `lib/aiExecutiveSummary.ts` — **`generateExecutiveSummaryJson`**: deterministic four-part facts (`headline`, `impact`, `constraint`, `action`) used as **fallback** when the LLM output fails validation and as **`executive_summary_json`** for structured consumers.
- `lib/executiveSummaryParagraphOpenAI.ts` — **`buildFounderExecutiveInputsFromAnalyzeData`** now returns business-decision inputs (`dominant_stage`, `severity_level`, `primary_constraint`, `user_behavior_breakpoint`, `business_impact`, `contributing_factors`, `priority_order`, `confidence`) derived from stage weights + strongest constraint + fix priorities + risk level. **`generateExecutiveSummaryParagraph`** uses OpenAI (`gpt-4o-mini`) for a single advisory paragraph with validation gates: **150–260 words**, duplicate-sentence filter, minimal banned-phrase filter, and required structural mentions (stage + constraint + action directive). If structure is missing, it retries **once** before fallback. Output normalization includes quote/ascii cleanup and replacement of invalid unicode artifacts. **`summary.executive_summary`** and **`summary.executive_summary_paragraph`** are the same string. With **`EXEC_SUMMARY_DEBUG=1`**, **`summary.executive_summary_debug`** includes **`RAW_AI_SUMMARY`** vs **`FINAL_SUMMARY`** and **`usedFallback`**.
- **Dashboard:** `app/dashboard/[projectId]/page.tsx` — **Executive summary** section (`#executive-summary`) is the **only narrative surface** (the old standalone "What to fix first / System Diagnosis" block was removed). Container uses **`max-w-[min(88ch,92rem,calc(100vw-2rem))]`** — matches the outer dashboard shell on wide viewports, capping line length at ~88ch on ultra-wide monitors — replaces the prior fixed `max-w-[1100px]` that collapsed the paragraph into a narrow column. **`text-pretty` removed** from the paragraph wrapper (Chrome's "pretty" wrapping shrinks the effective column to balance lines, which was clipping long summaries to ~380px wide). Typography unchanged: `text-[1.05rem] sm:text-[1.12rem]`, line-height `1.8` / `sm:1.82`, tracking `0.01em`, color `text-slate-100/95`.
- **`components/ExecutiveSummaryCaption.tsx`** — Client component. Splits `text` on whitespace, renders each word in an `inline-block` span so the animated transform does not disturb baseline layout, and applies staggered `animationDelay` (`startDelayMs + i × stepMs`; defaults `startDelayMs=120`, `stepMs=55`) using the existing **`.exec-subtitle-word`** keyframe in `app/globals.css` (fade + `translateY(0.12em → 0)`, `0.34s ease-out both`). Regular spaces between word spans preserve natural wrapping; paragraph continues to reflow with the container. **Accessibility:** `@media (prefers-reduced-motion: reduce)` in `globals.css` disables the animation and snaps words to `opacity: 1; transform: none`, so readers who prefer no motion see the full paragraph instantly.
- **Guest report:** `app/report/page.tsx` — Plain text when `executive_summary_paragraph` or `executive_summary` exists.

**Requires:** `OPENAI_API_KEY` for LLM synthesis; without it, response still uses deterministic fallback text.

---

## Impact Breakdown card (dashboard)

**Location:** `app/dashboard/[projectId]/page.tsx` (within `section#dashboard`, immediately after the hero metrics row).

**Purpose:** Business-readable rewrite of the legacy "Supporting detail → Risk breakdown" collapsible. Answers **"Where am I losing users, and why?"** — not "What are my metric scores?" Card title: **"Where performance is impacting your business"**. Always visible when `risk_breakdown` is present on the analyze payload (no collapse/expand, no progressive-disclosure gate, no per-card show/hide).

**Shape:** 5 cards, responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`). Each card renders, in order:
1. **Title** — business category label.
2. **Explanation** (primary) — 1–2 line sentence derived from `(category, severity)`; this is the lead element, not a score.
3. **Impact label** (secondary) — color-coded badge (red / amber / emerald ring) using the new business vocabulary.
4. **CTA** (tertiary) — full-width **`View root causes →`** button (`border-[#39FF14]/25 bg-[#39FF14]/5 rounded-lg`, green accent with hover glow). Scrolls to the Metrics Responsible section for the first metric mapped to this category.

**Numeric scores are not rendered** anywhere on this card. `risk_breakdown.*_risk_score` fields are **not read** by the UI (only `*_risk_level` is consumed, via `classifyImpactSeverity`). Category typing dropped the `scoreKey` property from `ImpactCategoryDef` — the card is driven purely by severity + explanation.

**Category mapping (engine signal → UI):**

| Engine (`RiskBreakdown`) | UI title | `riskMetricMap` key | `ImpactCategoryKey` |
|---|---|---|---|
| `speed_risk_*` | Load Experience | `Speed` | `loadExperience` |
| `ux_risk_*` | Interaction Experience | `UX` | `interaction` |
| `seo_risk_*` | Search Visibility | `SEO` | `searchVisibility` |
| `conversion_risk_*` | Conversion Readiness | `Conversion` | `conversion` |
| `scaling_risk_*` | Scalability Risk | `Scaling` | `scaling` |

**Severity collapse (`classifyImpactSeverity`):** `good | low → low`; `moderate | medium | needs improvement → moderate`; everything else (including `high`) → `high`. Drives both the explanation lookup and the badge.

**Impact label (`impactLabelForSeverity`):** `high → "High revenue risk"`; `moderate → "Moderate impact"`; `low → "Low impact"`. Replaces the generic `High` / `Medium` / `Low` tags.

**Explanations (`IMPACT_EXPLANATIONS`):** static copy pool keyed by `(ImpactCategoryKey × ImpactSeverity)` — 15 short sentences total. Selection is deterministic from the same inputs that drive the rest of the Revenue Impact UI (`risk_breakdown` levels from `lib/riskEngine.ts`); there is no separate scoring, no duplicate logic, and no project-level hardcoding — the text simply reflects the level the engine already assigned.

**Navigation (CTA):** calls `revealPanelThenScroll("metrics-responsible", firstMetricKey)` using `lib/riskMetricMap.ts` (`Speed → [lcp, ttfb, fcp, speedIndex]`, `UX → [cls, inp]`, `SEO → [fcp]`, `Conversion → [tti, tbt]`, `Scaling → [ttfb]`). When a category has no mapped metric, it falls back to the panel anchor.

**Removed:** the `supportingDetailOpen` state, the outer "Supporting detail / Show/Hide" collapsible, the per-card `AnimatedNumber` score badge, the tiny "Score N" caption, the `Metrics Responsible` / `Contributing Metrics` rotating CTA label, and the `riskLevelClass` helper (replaced by `impactBadgeClass` with a ring accent). `AnimatedNumber` import and `riskLevelClass` function are no longer referenced on this page.

---

## Fix Guide navigation (metric drawer from URL)

**Locations:**
- `app/dashboard/[projectId]/page.tsx` — Reads `searchParams.get("metric")` and `searchParams.get("tab")`; passes `initialOpenMetricKey={openMetricKey}` and `initialAuditTab={openTab}` to DetailedMetricsBoard.
- `components/DetailedMetricsBoard.tsx` — Accepts `initialOpenMetricKey` and `initialAuditTab`. Effect: when `initialOpenMetricKey` matches a metric, opens that metric’s drawer. Effect: when `initialAuditTab === "forensic"`, sets `auditTab` to `"financial"` (Financial Forensic Audit). When switching metrics, resets to Technical tab only if `initialAuditTab !== "forensic"`, so re-navigation with `?tab=forensic` always shows the forensic tab.

**URL pattern:** `/dashboard/[projectId]?metric={metricKey}&tab=forensic` (e.g. `metric=load-tti&tab=forensic`). Omit `tab` to default to Technical Breakdown when opening the drawer.

---

## Metric Intelligence (resources per metric)

**Location:** `lib/metricIntelligenceEngine.ts`

**Function:** `analyzeMetric(rawAudit, metricKey)`

**Purpose:** Extract contributing resources for a metric from Lighthouse audits; ContributingResource (url, type, transferSize, executionTimeMs, urgencyLevel, etc.). Used by drawer and financial-report.

---

## Competitor analysis (business layer)

**Purpose:** Position the user vs competitors, estimate directional competitive revenue risk, and surface **decision-first** copy — without coupling to `GET /api/analyze` and without raw Lighthouse numbers in the UI.

**API**
- **`GET /api/competitor-analysis`** (`app/api/competitor-analysis/route.ts`) — Query: `url` (or `user_url`), `competitorUrls` (comma-separated, max 3), optional `baselineRevenue` (defaults via registry if omitted). Response: `{ competitive_analysis }` only. Runs **`computeCompetitorAnalysis`** in `engine/competitorAnalysis.ts` (separate PageSpeed runs per URL). Does **not** re-run CORTEX/behavior revenue engines.

**Engine** (`engine/competitorAnalysis.ts`)
- **`computeCompetitorAnalysis`** — Head-to-head vs multi mode; performance-index-style composite from normalized signals; capped competitive risk vs baseline; **`recommended_action`** from effective gap thresholds (`ACT_NOW` / `PRIORITIZE` / `MONITOR`).
- **`comparison_rows`** — Site / Speed / Experience / Position labels; secondary to the snapshot table.
- **`comparison_snapshot`** — Three rows (first impression speed, interaction readiness, user drop-off risk). Each row includes:
  - **`position`** — `Behind` | `Ahead` | `Similar` (vs competitors; no Faster/Slower in the dashboard table).
  - **`why_it_matters`** — One short business-consequence sentence (no technical jargon).
  - **`impact`** — High/Medium/Low competitive **difference** magnitude (used for dominant-driver / confidence weighting).
  - **`business_impact`** — High/Medium/Low **business salience** for the **Impact** column (first impression & drop-off High; interaction Medium).
  - **`your_site`** / **`competitor`** — Internal relative labels (still power **`lib/whatThisMeansSignals.ts`** when **`position`** is absent).
- **Exports:** **`buildComparisonSnapshot`**, **`sortComparisonSnapshotRows`** (order: Behind + High business impact → … → Ahead), **`getPrimaryCompetitorIssue`** (strongest **`business_impact`** among **Behind** rows), **`getSnapshotPosition`**, **`rowBusinessImpact`**, **`actionableLabelForSnapshotRow`**, **`userIsWinningOnSnapshotRow`**. **`differenceColumnForRow`** remains for any legacy/debug use; dashboard table no longer uses it.
- **PageSpeed in this module:** **`fetchLighthouseData`** uses **`process.env.PAGESPEED_API_KEY`** / **`GOOGLE_API_KEY`** only — **does not** import **`lib/pageSpeedEnv`** (avoids pulling `@next/env` / `fs` into the client bundle because the engine is imported by **`app/dashboard/[projectId]/page.tsx`**).
- **`dominant_driver`**, **`action_plan`**, **`competitive_risk`** — unchanged in role (actionable labels, three levers, monthly risk + confidence).
- No LCP/CLS/INP strings in user-facing copy from this module.

**Decision copy** (`lib/competitorDecisionIntel.ts`)
- **`buildCompetitorDecisionIntel`** — Deterministic **`decisionHeadline`**, **`contextLine`**, gap bullets, **`businessLink`**, **`prioritizedActions`**, etc. **Dashboard** uses **`decisionHeadline`** unless **`competitorHeadline()`** overrides (narrow lead + LOW severity).

**“What this means” (language only)** — `lib/whatThisMeansSignals.ts` maps snapshot rows to **`WhatThisMeansSignals`**, preferring **`row.position`** when set (else **`your_site`**). **`POST /api/competitor-what-this-means`** — optional OpenAI (`gpt-4o-mini`); **`lib/whatThisMeansFallback.ts`** on failure/missing key.

**Dashboard** (`app/dashboard/[projectId]/page.tsx`, section `competitive-intelligence`)
- **Compare with Competitors** → modal → fetch with **`baselineRevenueForCompetitorAnalysis`** when present.
- **Render order:** Headline (optional notes) → **Biggest issue** (from **`getPrimaryCompetitorIssue`**, or “no gap behind” copy) → **Snapshot table** — **Factor** | **Position** | **Impact** (🔥/⚠️/neutral by business weighting) | **Why it matters**; sorted; highlighted row → edge/shortfall → **What this means** → **DECISION** / **WHY** → **Business impact** → **Actions** + CTA.

**Related**
- **`GET /api/analyze`** exposes **`baselineRevenueForCompetitorAnalysis`**; does **not** include `competitive_analysis`.
- **`app/api/analyze/route.ts`**, **`app/api/compare/route.ts`**, **`app/api/competitive-intelligence/route.ts`** use **`getPageSpeedApiKey`** from **`lib/pageSpeedEnv.ts`** (with **`ensureNextEnvLoaded`**).
- Legacy compare/creative-intelligence routes — not the primary dashboard flow.

---

## Environment & secrets (Next.js)

**Locations:**
- **`lib/nextEnv.ts`** — **`ensureNextEnvLoaded()`** calls **`loadEnvConfig(process.cwd())`** so `.env` / `.env.local` merge into **`process.env`** before modules that read **`DATABASE_URL`** at init (e.g. **`lib/prisma.ts`**).
- **`lib/pageSpeedEnv.ts`** — **`getPageSpeedApiKey()`** (`PAGESPEED_API_KEY` or **`GOOGLE_API_KEY`**); server API routes only.
- **`.env.example`** — documents **`OPENAI_API_KEY`**, **`PAGESPEED_API_KEY`**, **`DATABASE_URL`**. Real secrets in **`.env.local`** (gitignored).

---

## Database & Prisma

**Locations:**
- **`prisma/schema.prisma`** — Models: `User`, `Project`, `ProjectBusinessProfile`, `PerformanceSnapshot` (table names mapped with `@@map`). **`PerformanceSnapshot`** includes lab **TTI** (`tti`, seconds) alongside LCP/INP/TBT/CLS; **`GET /api/projects/[projectId]`** fills `lastSnapshot.tti` from the DB column or, when null, from stored **`rawAudit`** (`lib/labTtiFromAudit.ts`) so Revenue Impact matches dashboard Lighthouse values.
- **`prisma.config.ts`** — Prisma 7: datasource URL loaded from `.env` / `.env.local` (`DATABASE_URL`); **do not** put `url` in `schema.prisma` (Prisma 7 validation).
- **`lib/prisma.ts`** — **`ensureNextEnvLoaded()`** then **`PrismaClient`** with `@prisma/adapter-pg` + `pg` Pool; dev TLS relaxation for Supabase hostnames as implemented in file.

**Scripts:** `npm run db:push` → `prisma db push` (sync schema to DB; use after clone or schema change).

**Signup:** `POST /api/signup` (`app/api/signup/route.ts`) creates `User` rows; errors for missing tables (`db push`), connection failures (**`lib/dbDiagnostics`**: nested **`cause`** codes), and localhost **`DATABASE_URL`** when nothing is listening.

---

## Dashboard Sections & Scroll Spy

**Location:** `app/dashboard/[projectId]/page.tsx`

**SECTION_IDS:** dashboard, performance-change, revenue-impact, market, competitive-intelligence, growth-impact-roadmap, metrics-responsible, action-priority-list, executive-summary.

**Purpose:** Each section has id and ref; onScroll updates active section for sidebar highlight (useDashboardNav). **Progressive first visit:** `hasUserEngaged` + `localStorage` key `pi-dashboard-engaged-{projectId}`; hero-only until scroll past ~60vh, primary CTA (`Estimate Revenue Impact` → revenue-impact route), Refine, `revealPanelThenScroll`, sidebar expand event, or deep link `?metric=` / `?tab=forensic`. Revealed block uses `.dashboard-reveal-sections` animation in `app/globals.css`. **Collapsible panels:** `components/dashboard/DashboardCollapsibleSection.tsx` (`DashboardCollapsibleSection`, `DashboardDisclosure`). Sidebar in-app anchors dispatch `pi-dashboard-expand-section` (`components/DashboardSidebar.tsx`) so the target panel opens before scroll (also marks dashboard engaged). Note: RevenueRecoveryOpportunities is not on this dashboard; it is used on `app/report/page.tsx`.

---
## Revenue Impact Workspace

**Location:** `components/RevenueImpactWorkspace.tsx` (component name retained for backward compatibility; user-facing page header is "Revenue Impact")

**Route:** `app/dashboard/[projectId]/revenue-impact/page.tsx`

**Purpose:** A founder-facing **financial decision system** for performance-driven revenue risk. Renders a "Where users are dropping" stage breakdown across the three canonical funnel stages (`Landing` / `Activation` / `Conversion`) — surfaced via behavioral, non-technical headings — and ties every output to a decision: how much is at risk, what % of revenue, where users drop, what to fix first, how much can be recovered, whether to trust it. Includes:
- Headline revenue range + percentage-of-revenue context + qualitative recovery framing + behavioral primary insight
- Actionable confidence (label + one-line meaning per level) overridden by input completeness
- Stage breakdown with deterministically-selected behavioral message per card (controlled `STAGE_MESSAGE_POOL`) and a single normalized monthly value labelled "Recoverable impact"
- Presentation-layer stage normalization so per-stage values sum to the **recoverable expected** value (mode-aware), aligning the cards with the CTA's max-recoverable opportunity
- Outcome-driven CTA "Recover up to $X/month from this →" linking to Priority Fixes
- Collapsibles for "Projected revenue after fixes" and "How this estimate works" (plain-language, no metric names)
- Input realism safeguards (soft warnings + internal caps for calculations only)
- Mathematical invariant validation to keep displayed projections within baseline and preserve consistent ranges
- Performance snapshot as supporting evidence

**Data flow (high level):**
- Loads saved business inputs and the latest stored performance snapshot for the project
- On “Calculate revenue impact”, runs `runImpactEngine` using a snapshot derived from stored Lighthouse/PageSpeed metrics
- Builds per-stage **recoverable** dollar amounts from `lib/revenueStageDistribution.ts` (metric severities on the snapshot), summing to `expectedRecoverable`; CTA uses `reconcileMaxRecoverableCta`. `getStageContributionsFromDrivers` is only for legacy/empty-driver callers (returns `[]` when no drivers).
- Persists the latest run metadata back to the project business profile via `/api/project-business-profile` (PATCH)

**Notes / UI behavior:**
- Strategic Map grid and Financial Projection views are not part of the current workspace UI.
- "Estimate style" (UI label for the underlying `sensitivityMode`) adjusts estimation behavior via the impact engine; the UI provides per-option hints (Conservative — lower estimate, Balanced — typical scenario, Aggressive — higher impact). Persisted as `sensitivityMode` for backward compatibility.
- Business model selector auto-prefills empty Conversion rate / AOV with sensible defaults (E-commerce: 2.5% / $75; SaaS: 1.5% signup conversion). User-entered values are never overwritten.
- Business Context input section: single combined helper line ("We estimate how performance impacts conversions. Add your real numbers for better accuracy."); field labels carry unit hints (`Monthly visitors`, `Conversion rate (%)`, `Average order value ($)`, etc.); when user-entered values pass realism checks, an inline reassurance ("Your inputs look realistic for a/an {model} business.") appears.
- "Estimated baseline revenue" is hidden during the input stage and rendered inside the results panel after the user clicks "Calculate revenue impact".
- "Advanced configuration" panel (renamed from "Refine with advanced inputs") replaces the JSON dump with a labelled key/value summary via `formatAdvancedSummary(modelId, inputs, defaults)` — no developer-facing presentation.
- Primary CTA "Calculate revenue impact" uses an enlarged, full-width-on-mobile primary button (`px-8 py-4 text-base font-semibold` with shadow + active-press) to be visually dominant.
- The “after fixes” projected revenue uses clamping/normalization so projections stay within baseline and ranges remain consistent (including soft realism caps for extreme conversion inputs).
- **Results panel structure (defensible-V1 build, decision-system copy):**
  - **Hero card** — same bounded range (computed in `runSimulation` as `[0.6 × totalLoss, min(0.9 × totalLoss, baselineRevenue)]`), now framed as **"Revenue at risk: $LOW – $HIGH /month"**. Below the range:
    - **Percentage context** — "≈ X% – Y% of your revenue at risk", computed UI-side as `round((opportunityRange.{low,high} / baselineRevenue) × 100)`. Hidden when baselineRevenue is missing or zero.
    - **Recovery framing** — qualitative line "A large portion of this loss is recoverable." (no fabricated numbers).
    - **Behavioral primary insight** — derived from the highest-loss stage, not the engine's primary driver: Landing → "Most revenue is lost before users see your page.", Activation → "…when users try to interact.", Conversion → "…when users decide to convert.".
    - **Actionable confidence** — "Confidence: High/Medium/Low" plus a one-line meaning per level: High → "Safe to prioritize this for immediate impact.", Medium → "Directional insight — validate if needed.", Low → "Use as estimate, not a decision driver. Add your business inputs to improve accuracy.".
    - **Trust line** — italic "Based on performance patterns and user behavior impact." (replaces "model"/"simulation" wording).
    - All currency in the results panel uses `formatRevenueReadable` / `formatRevenueReadableAmount` (M/K suffixes, e.g. `$52.1M`, `$520K`).
  - **Stage breakdown** — three cards (Landing / Activation / Conversion). Internal stage names are NEVER exposed; cards use behavioral headings:
    - Landing → "Before users see your page"
    - Activation → "When users try to interact"
    - Conversion → "When users decide to convert"
    - Each card shows ONLY: heading, a single executive-style sentence (cause → effect → business impact), the monthly value, the **"Recoverable impact"** label, and the "Start here" badge on the highest stage. **No technical sub-labels** ("Load speed issue", "Interaction delay", "Layout instability") are surfaced — they were generic, technical, and low-value. After the presentation-layer normalization (below) the per-stage values are additive and sum to `recoverableExpected`, so no "values do not add up" disclaimer is shown.
    - **Stage message pools (UI-only, deterministic):** module-scope `STAGE_MESSAGE_POOL` in `RevenueImpactWorkspace.tsx` defines five equal-strength, single-sentence statements for each of `landing`, `interaction`, `conversion`. Each card picks a sentence via `pickStageMessage(poolKey, expectedLoss)` using `index = Math.floor(expectedLoss || 1) % pool.length` where `expectedLoss = (opportunityRange.low + opportunityRange.high) / 2`. Selection is fully deterministic — same project / same `expectedLoss` always renders the same sentence (no flicker between renders, no `Math.random()`). Sentences contain no metric names (LCP/INP/CLS) and no hedging language ("may", "might", "can"). Canonical-stage → pool mapping: `Landing → landing`, `Activation → interaction`, `Conversion → conversion`.
    - **Metric-quality stage attenuation (UI-only, snapshot-aware):** before normalization each stage's raw contribution is multiplied by `stageQualityFactor(stage, snapshot)`. Threshold map `STAGE_GOOD_THRESHOLDS` defines the "good" bucket per stage (Landing → `lcp ≤ 2.5s`, Activation → `inp ≤ 200ms`, Conversion → `cls ≤ 0.05`). When a stage's metric is at or below its threshold, the raw weight is multiplied by `STAGE_LOW_IMPACT_FACTOR = 0.08` so that stage cannot dominate the breakdown. Missing metric (`null`) returns factor `1` (no scaling). After downstream normalization, any stage whose final share falls below `STAGE_LOW_IMPACT_PERCENT = 12` is rendered with a non-blame line from `STAGE_LOW_IMPACT_MESSAGE` (Conversion → *"Most losses occur before users reach the conversion stage."*; Landing → *"Most losses occur after users have already loaded your page."*; Activation → *"Most losses occur outside the interaction stage of your funnel."*) and is excluded from the "Start here" highlight. The stage is never removed from the breakdown — it remains visible at its de-emphasized share. This eliminates the contradiction case where the snapshot shows e.g. CLS ≈ 0 but the Conversion card still blamed layout shifts. Backend, drivers, and `result.opportunityRange` are untouched.
    - **Mode-aware presentation-layer derivation (single source of truth, no engine change):** `RECOVERY_FACTORS` (Conservative `{min: 0.5, max: 0.6, avg: 0.55}`, Balanced `{min: 0.6, max: 0.75, avg: 0.675}`, Aggressive `{min: 0.75, max: 0.9, avg: 0.825}`) drives every recoverable / projected / CTA / stage value. On every render the workspace re-derives from the engine's mode-independent `totalLoss` (= `result.opportunityRange.expected`) plus the current `sensitivityMode`: at-risk range = `totalLoss × RANGE_BOUNDS_BY_MODE[mode]` (capped at baseline); recoverable bounds = `opportunityLow × recovery.min` and `opportunityHigh × recovery.max`; projected = `currentRevenue + recoverable{Low,High}` (validated by `validateRevenueModel`); stage normalization sums to `expectedRecoverable = expectedLoss × recovery.avg` (where `expectedLoss = (opportunityLow + opportunityHigh) / 2`), rounded to the nearest 1K with the residual delta added to the largest stage; CTA `maxRecoverable = opportunityHigh × recovery.max`. Skipped when `|rawSum − expectedRecoverable| / expectedRecoverable < 5%` (preserves engine signal when already aligned) and when `rawSum === 0`. **Reactivity:** switching estimation style updates the at-risk range, recoverable range, projected revenue, stage values, and CTA in the same render — no engine re-run, no per-mode caching. `highestStageIndex` is computed **after** normalization, so the "Start here" badge and the CTA value reference the same displayed numbers. Dev-only `console.debug` logs `{ mode, recoveryFactor, totalLoss, opportunityLow, opportunityHigh, currentRevenue, recoverableLow, recoverableHigh, projectedLow, projectedHigh, maxRecoverable, stageSum }`. Backend, persistence, and `result.opportunityRange` are untouched.
    - The card with the highest loss is visually elevated AND carries a **"Start here — highest recovery potential"** badge. The badge is now driven dynamically by `highestStageIndex` (was hard-coded to Landing). Stages with no driver contribution show $0 (NO 33% fallback).
  - **Primary CTA** — outcome-driven label **"Recover up to $X/month →"** where `X = round(opportunityHigh × RECOVERY_FACTORS[mode].max)` formatted via `formatRevenueReadableAmount`. Uses the **max recoverable opportunity** (not the at-risk total), so the CTA aligns with the per-stage cards (which sum to `expectedRecoverable`) and the "Projected revenue after fixes" upper bound. Invariants preserved: `CTA ≥ sum(stageValues)`, `CTA ≤ totalLoss`. Falls back to "See what to fix to recover this revenue →" when the computed value is 0. Links to `/dashboard/{projectId}#action-priority-list`. Visually dominant button (`px-8 py-4`, full-width on mobile).
  - **Collapsibles** — "Projected revenue after fixes" is now structured as a **before → after → potential** story (no internal labels like "After fixes", "Baseline revenue", or "Revenue today"). Visual hierarchy: (1) **Primary** (text-sm, most prominent) — *"You're currently making ~$X/month"* and *"Fixing these issues can increase it to $LOW–$HIGH/month"* (improved range accented). (2) **Secondary** (text-xs, subtle) — *"Your full revenue potential is ~$Y/month"*. (3) **Explanation** (text-[11px], lowest emphasis) — *"Fixing these issues won't fully close the gap, but it can recover a significant portion of your lost revenue."* No percentages, no technical/system terms. **"How this is calculated"** (renamed from "How this estimate works"; rendered as a low-emphasis trust layer with `text-xs font-medium text-[var(--muted)]` summary so it does not compete with primary insights) opens with *"This estimate is derived from a structured analysis of how performance impacts user behavior and conversion outcomes across your funnel:"* followed by three behavioral bullets (slow pages → users leave before seeing your product; delays during interaction → reduced engagement and progression; instability during key actions → reduced trust at conversion) and a closing line *"These effects are combined with your traffic and conversion inputs to quantify the revenue impact of performance issues."* No "model"/"algorithm"/"engine"/"AI"/"prediction system" wording, no LCP/CLS/INP names, under 5 lines — feels analytical and credible without being technical. Placed AFTER the revenue breakdown, CTA, and "Projected revenue after fixes" collapsible. Both collapsibles are collapsed by default to keep the surface focused.
  - **Performance snapshot** — supporting evidence grid (Overall health, LCP, TTI/INP, CLS) remains visible below the collapsibles.
  - **Language constraints** — internal terms (`Landing` / `Activation` / `Conversion`), engine wording ("simulation", "stage-based model", "calculation engine"), and metric names are NEVER surfaced in the user-facing copy in this section. Banners use "Re-run the estimate." and the run button uses "Estimating…" / "Calculate revenue impact". Page header is "Revenue Impact" (no "Simulation").
- **Stage canonicalization** (`canonicalizeStage` in `RevenueImpactWorkspace.tsx`):
  - Conversion: contains `conversion`, `convert`, `checkout`, `form`, `submit`, `monetiz`, `purchase`, `trust`
  - Activation: contains `activation`, `interact`, `signup`/`sign up`, `engage`, `product`, `try`
  - Default → Landing
  - Multiple drivers mapping to the same canonical stage are summed before normalization. The engine-side per-stage losses sum to `totalRevenueLeak` (= `opportunityRange.expected`); the **displayed** per-stage values are then re-scaled at the presentation layer so they sum to `expectedRecoverable = ((opportunityLow + opportunityHigh) / 2) × RECOVERY_FACTORS[mode].avg` (see "Mode-aware presentation-layer derivation" above).
- **Estimate style** (sensitivityMode) adjusts the *displayed range bounds* only — the underlying `totalLoss` is identical across modes. Bounds: Conservative 50%–75%, Balanced 60%–90%, Aggressive 70%–100% (capped at baseline). The expected value, per-metric cap, and global cap are unaffected by mode. Persisted as `sensitivityMode` for backward compatibility.
- **Confidence** is overridden in the Workspace from input completeness against the chosen business model's required keys (Low = 0 inputs, Medium = partial, High = all inputs). `runImpactEngine`'s confidence is replaced.
- **See also:** `docs/REVENUE_MODEL_AUDIT.md` for the full math + caps + before/after table.

---

## Revenue Stability Monitoring

**Spec:** `docs/FEATURE_REVENUE_STABILITY_MONITORING.md`

**Purpose:** Business monitoring — *is revenue getting safer or more at risk over time?* — no chart-first UI; decision copy and revenue-at-risk range comparison vs previous snapshot.

**Code:** `lib/revenueStabilityMonitoring.ts` — `compareMonitoringSnapshots`, `buildRevenueStabilityPayload`, `buildWhatChangedBullets`, `dominantStageFromLeakByMetric`.  
**API:** `GET /api/projects/[projectId]/revenue-stability?extended=1` (Pro = 30-day history + minimal direction list).  
**UI:** `components/RevenueStabilityMonitoring.tsx` — dashboard section `#performance-change` (“Revenue Stability Monitoring”).  
**Persist:** `PerformanceSnapshot.revenueAtRiskMin/max`, `dominantStage`, `monitoringScores` — written on analyze and save-pending.

---

## Documentation & onboarding (meta)

| Artifact | Role |
|----------|------|
| `README.md` | Project entry: install, env, scripts, links to docs |
| `AGENTS.md` | Conventions for AI agents (read order, verify commands, hot paths) |
| `docs/AI_CONTEXT.md` | Product mission, principles, AI modification rules |
| `docs/FEATURE_REGISTRY.md` | This file — navigation index |
| `docs/SYSTEM_STATE.md` | Shipped features, issues, planned work |
| `docs/DECISION_LOG.md` | Locked decisions |
| `docs/ONBOARDING.md` | Repo layout and main user/data flows |
| `docs/DOCUMENTATION_MAINTENANCE.md` | Checklist for keeping docs current |
| `docs/AI_PROMPT_TEMPLATE.md` | Copy-paste prompt patterns |
| `.github/pull_request_template.md` | PR checklist including doc updates |
| `.env.example` | Non-secret env var names and hints |
| `.cursor/rules/` | Cursor-specific rules (e.g. dev server restart, doc maintenance) |
