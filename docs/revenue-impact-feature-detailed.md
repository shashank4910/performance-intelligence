# Revenue Impact Feature — Detailed Explanation

This document is the **full** description of the Revenue Impact feature: purpose, rules, files, data, APIs, UI, and flows. Use it as the single source of truth to avoid confusion or deviations.

---

## Part 1 — Purpose and Principles

### 1.1 What the feature does

- **Translates performance gaps into revenue impact** using clear, direct language.
- Lets the user **configure business context** (model, monthly revenue, sensitivity) and **run a simulation once** to see:
  - **Strategic Map:** where the gap matters most (matrix, opportunity concentration, industry alignment, strategic brief).
  - **Financial Projection:** opportunity range (low / expected / high), % uplift, confidence, timestamp.
- **No automatic calculation** anywhere except inside the dedicated workspace when the user clicks **Run simulation**.
- **One-time result:** results do not auto-update when performance or inputs change; the user must re-run.
- **Opportunity framing only:** we speak in terms of “revenue opportunity” and “uplift,” not “revenue loss” or fear-based messaging. We show ranges and confidence, never a single-point prediction.

### 1.2 Strict boundaries (never do)

- **Do not modify** the impact engine logic, sensitivity models, scoring engine, or metric intelligence in `impactEngine/`.
- **Do not change** Lighthouse processing or authentication.
- **Do not run** the impact engine from the dashboard or report; only from the workspace on **Run simulation**.
- **Do not auto-recalculate** when snapshot or business inputs change.
- **Do not** show a single-point revenue prediction; always ranges (low / expected / high) and confidence.
- **Do not** add scare language or fake precision; keep monetary outputs rounded and tone calm.

---

## Part 2 — Where the feature appears (routes and UI)

| Location | Route / context | What the user sees |
|----------|-----------------|--------------------|
| **Dashboard project page** | `/dashboard/[projectId]` | Revenue Impact **section** with **Revenue Impact Card**. Sidebar “Revenue Impact” links to workspace. |
| **Report page** | `/report` | Same **Revenue Impact Card**; no `projectId`, so link goes to `/dashboard`. |
| **Revenue Impact Workspace** | `/dashboard/[projectId]/revenue-impact` | Full simulation UI: header, business context, performance snapshot, **Run simulation**, results (Strategic Map / Financial Projection toggle). |
| **Sidebar** | When path is `/dashboard/[projectId]` or `/dashboard/[projectId]/revenue-impact` | “Revenue Impact” nav item. On project page it links to `/dashboard/[projectId]/revenue-impact`; on workspace page it stays active. |

- **Card** = entry point (configure CTA or summary + “Open Simulation Workspace”). Never runs the engine.
- **Workspace** = only place where the user can run the simulation and see both Strategic Map and Financial Projection.

---

## Part 3 — Files and their roles

### 3.1 Impact engine (read-only for this feature; do not change)

| File | Role |
|------|------|
| `impactEngine/index.ts` | Public API: exports `runImpactEngine`, `listBusinessModelIds`, types, funnel/sensitivity/benchmark helpers. |
| `impactEngine/impactEngineService.ts` | Runs deterministic projection + optional competitor overlay. Input: snapshot, businessInputs, businessModelId. Output: opportunityRange, primaryDrivers, confidenceLevel, etc. |
| `impactEngine/revenueProjectionEngine.ts` | Deterministic opportunity range and primary drivers from snapshot + business inputs. |
| `impactEngine/competitorOverlayEngine.ts` | Optional competitor adjustment of opportunity range. |
| `impactEngine/businessModelRegistry.ts` | Registry of business models (ecommerce, saas, leadgen, aiTool, media). Each has funnelTemplateId and sensitivityProfileId. |
| `impactEngine/funnelTemplates.ts` | Stage weights per business model (e.g. ecommerce: Landing 0.5, Product 0.3, Checkout 0.2). |
| `impactEngine/sensitivityModels.ts` | Per-stage, per-metric sensitivity (high/medium/low). Used by projection engine and strategic matrix. |
| `impactEngine/impactTypes.ts` | Types: PerformanceSnapshotLike, BusinessInputs, OpportunityRange, ImpactDriver, ImpactEngineOutput, etc. |

### 3.2 Project business profile (storage)

| File | Role |
|------|------|
| `impactEngine/projectBusinessProfileService.ts` | Service layer: `getBusinessProfile(projectId)`, `saveBusinessProfile(projectId, data)`, `updateLastCalculation(projectId, opportunityData)`. Uses Prisma; converts Decimal to number in responses. |
| `prisma/schema.prisma` | Defines `ProjectBusinessProfile` model and relation to `Project`. |

### 3.3 APIs

| File | Role |
|------|------|
| `app/api/project-business-profile/route.ts` | GET (profile by projectId), POST (upsert profile), PATCH (update last opportunity + confidence). All require auth; all check project ownership via `getProjectForUser(projectId, userId)`. |
| `app/api/projects/[projectId]/route.ts` | GET: returns project `{ id, url }` and latest performance snapshot for the workspace. Auth required. |
| `app/api/strategic-brief/route.ts` | POST: body has businessModel, dominantStage, dominantMetric, opportunityRange, confidenceLevel, industryTier. Returns 6–8 line strategic brief (OpenAI when key set; else deterministic fallback). Auth required. |
| `app/api/strategic-cell-refinement/route.ts` | POST: body has businessModel, stage, metric, impactLevel, industryTier, leverageLevel. Returns 1–2 sentence refinement for hover panel. Auth required. |

### 3.4 Strategic matrix (UX layer only; no revenue math)

| File | Role |
|------|------|
| `lib/strategicGrowthMatrix.ts` | `computeStrategicMatrix(businessModelId, snapshot, industryKey)`. Reads funnel templates, sensitivity profiles, industry benchmarks. Computes per-cell score (stage weight × sensitivity × performance delta vs benchmark, adjusted by overall health). Returns cells (with intensity low/medium/high), stageContributions (%), industryTier, row/col labels. Does not call impact engine. |
| `lib/industryBenchmarks.ts` | Benchmark values (LCP, INP, CLS, TBT, healthMedian) per industry (ecommerce, fintech, saas, generic). Used by strategic matrix and tier derivation. |

### 3.5 UI components

| File | Role |
|------|------|
| `components/RevenueImpactCard.tsx` | Dashboard/report card. If no profile: “Revenue Impact Simulation” + “Configure & Run Simulation →”. If profile: business model, monthly revenue, last opportunity, confidence + “Open Simulation Workspace →”. Fetches profile via GET project-business-profile. Never calls runImpactEngine. |
| `components/RevenueImpactWorkspace.tsx` | Full workspace: header, business context form (auto-save 800 ms), performance snapshot (read-only), Run simulation button, results panel with toggle (Strategic Map | Financial Projection). Calls runImpactEngine on Run; then PATCH to save last result. |
| `components/StrategicMapView.tsx` | Strategic Map view: intro copy, matrix (color-only cells), hover panel (deterministic + AI refinement cached per cell), opportunity concentration bar, industry alignment scale, strategic brief (AI once per run or fallback). Uses computeStrategicMatrix and optional strategic-brief / strategic-cell-refinement APIs. |
| `app/dashboard/[projectId]/page.tsx` | Renders Revenue Impact section with `<RevenueImpactCard projectId={projectId} />`. |
| `app/dashboard/[projectId]/revenue-impact/page.tsx` | Renders `<RevenueImpactWorkspace projectId={projectId} />`. |
| `app/report/page.tsx` | Renders `<RevenueImpactCard />` (no projectId). |
| `components/DashboardSidebar.tsx` | “Revenue Impact” nav: when on a project page, links to `/dashboard/[projectId]/revenue-impact`; when on workspace, shows as active. |

### 3.6 Report templates (no calculations)

| File | Role |
|------|------|
| `lib/revenueImpactReportTemplate.ts` | `renderRevenueImpactReport(data)` — 8-section executive report. `renderFounderFriendlyRevenueReport(data)` — 9-section founder report. Both only insert provided values; caller supplies all numbers. |

---

## Part 4 — Database

### 4.1 Table: project_business_profile

- **Prisma model:** `ProjectBusinessProfile`.
- **Fields:**
  - `id` — cuid.
  - `projectId` — unique, FK to Project.
  - `businessModelId` — text (e.g. ecommerce, saas).
  - `monthlyRevenue` — Decimal(14,2).
  - `advancedInputs` — Json (optional).
  - `sensitivityMode` — text: `conservative` | `balanced` | `aggressive`.
  - `lastCalculatedOpportunity` — Json (e.g. `{ low, expected, high }`).
  - `lastConfidence` — text (e.g. low, moderate, high).
  - `updatedAt` — timestamp, auto-updated.
- **Relation:** One-to-one with Project (one business profile per project).

### 4.2 Related data

- **Project** — id, url, userId, etc. Project has many PerformanceSnapshot and optional one ProjectBusinessProfile.
- **PerformanceSnapshot** — projectId, timestamp, overallHealth, lcp, inp, ttfb, cls, tbt, etc. Used to build the snapshot passed to the workspace and to the impact engine / strategic matrix.

---

## Part 5 — APIs in detail

### 5.1 GET /api/project-business-profile

- **Query:** `projectId` (required).
- **Auth:** Required; project must belong to user.
- **Response:** `{ profile: ProjectBusinessProfileRow | null }`. Profile includes id, projectId, businessModelId, monthlyRevenue, advancedInputs, sensitivityMode, lastCalculatedOpportunity, lastConfidence, updatedAt (ISO string).

### 5.2 POST /api/project-business-profile

- **Body:** projectId, businessModelId, monthlyRevenue, advancedInputs (optional), sensitivityMode.
- **Auth:** Required; project must belong to user.
- **Behavior:** Upserts project_business_profile by projectId.
- **Response:** `{ profile: ProjectBusinessProfileRow }`.

### 5.3 PATCH /api/project-business-profile

- **Body:** projectId, lastCalculatedOpportunity (object with low, expected, high), lastConfidence (string).
- **Auth:** Required; project must belong to user.
- **Behavior:** Updates only lastCalculatedOpportunity and lastConfidence for the project’s profile.
- **Response:** `{ profile: { id, projectId, lastCalculatedOpportunity, lastConfidence, updatedAt } }` or 404 if no profile.

### 5.4 GET /api/projects/[projectId]

- **Auth:** Required; project must belong to user.
- **Response:** `{ project: { id, url }, lastSnapshot: { id, overallHealth, lcp, inp, ttfb, cls, tbt, timestamp } | null }`.

### 5.5 POST /api/strategic-brief

- **Body:** businessModel, dominantStage, dominantMetric, opportunityRange, confidenceLevel, industryTier.
- **Auth:** Required.
- **Response:** `{ brief: string }` (6–8 lines). Uses OpenAI when OPENAI_API_KEY set; else deterministic fallback.

### 5.6 POST /api/strategic-cell-refinement

- **Body:** businessModel, stage, metric, impactLevel, industryTier, leverageLevel.
- **Auth:** Required.
- **Response:** `{ refinement: string }` (1–2 sentences). OpenAI when key set; else fallback.

---

## Part 6 — Impact engine (what we call, not what we change)

### 6.1 When it runs

- **Only** when the user clicks **Run simulation** in the workspace.
- **Never** from the card, dashboard, or report.

### 6.2 Input (ImpactEngineServiceInput)

- `performanceSnapshot` — PerformanceSnapshotLike (id, overallHealth, lcp, inp, ttfb, cls, tbt, timestamp).
- `businessInputs` — BusinessInputs (monthlyRevenue, optional mobileTrafficPercent, etc.).
- `businessModelId` — string (e.g. ecommerce).
- `competitorPerformance` — optional; not used by default in workspace.
- `persistInputs` — false in workspace (simulation only).

### 6.3 Output (ImpactEngineServiceResult)

- `opportunityRange` — { low, expected, high }.
- `primaryDrivers` — array of { metric, stage, influence, description }.
- `confidenceLevel` — low | moderate | high.
- `baselineRevenue`, `optimizedRevenueRange`, `businessModel`, `modelVersion`.
- Optional: `competitorDelta`, `historicalRecord`.

### 6.4 Flow in workspace

1. Persist current form to profile (POST project-business-profile) so a row exists.
2. Build snapshot from context’s lastSnapshot (or empty).
3. Call `runImpactEngine({ performanceSnapshot, businessInputs, businessModelId, persistInputs: false })`.
4. PATCH project-business-profile with `lastCalculatedOpportunity` and `lastConfidence`.
5. Set result in state; show Strategic Map (default) or Financial Projection.

---

## Part 7 — Strategic growth matrix (UX only)

### 7.1 Role

- Provides the **Strategic Map** view: matrix, opportunity concentration, industry alignment, and inputs for the strategic brief.
- **Does not** change revenue math; only reads funnel templates, sensitivity profiles, industry benchmarks, and snapshot.

### 7.2 Input

- `businessModelId` — e.g. ecommerce.
- `snapshot` — PerformanceSnapshotLike (overallHealth, lcp, inp, cls, tbt, etc.).
- `industryKey` — e.g. ecommerce, saas, generic (from industryBenchmarks).

### 7.3 Output (StrategicMatrixResult)

- **cells** — 3×4 matrix (rows: Landing, Activation, Conversion; cols: LCP, INP, CLS, MainThread). Each cell: combinedScore, intensity (low/medium/high), impactLevel, revenueLeverage, industryPosition, coreExplanation.
- **stageContributions** — array of { stage, percent } (e.g. Landing 67%, Activation 21%, Conversion 12%).
- **industryTier** — Below Baseline | Baseline | Top Quartile | Best-in-Class.
- **industryTierPerMetric** — optional per-metric tier.
- **rowLabels**, **colLabels** — for display.

### 7.4 Cell score (conceptual)

- Combines: stage weight (from funnel template), sensitivity level (high/medium/low → numeric), performance delta vs benchmark (per metric), and an adjustment when overall health is low so the matrix does not stay mostly green on a bad site.
- Intensity: low (green) / medium (amber) / high (red). No numbers shown in cells.

### 7.5 Hover panel (per cell)

- Deterministic: Impact level, Revenue leverage, Industry position, core explanation sentence.
- Optional AI: 1–2 sentences from strategic-cell-refinement API; **cached per cell** so we do not call on every hover.

### 7.6 Strategic brief

- Fetched **once per run** from strategic-brief API (or deterministic fallback if API fails or no key).
- Inputs: businessModel, dominantStage, dominantMetric, opportunityRange, confidenceLevel, industryTier.
- Shown below industry alignment; 6–8 lines.

---

## Part 8 — Revenue Impact Card (detail)

### 8.1 Props

- `projectId?: string | null`. When absent (e.g. on report page), card shows configure CTA and link to `/dashboard`.

### 8.2 States

- **Loading (and projectId set):** “Loading…”.
- **No profile (or no projectId):** “Revenue Impact Simulation” + short description + “Configure & Run Simulation →”. Link: `/dashboard/[projectId]/revenue-impact` or `/dashboard`.
- **Profile exists:** Business model, Monthly revenue, Last calculated opportunity (if any) in low/expected/high, Confidence badge, “Open Simulation Workspace →”.

### 8.3 Behavior

- Fetches profile with GET `/api/project-business-profile?projectId=...` when projectId is present.
- Never calls runImpactEngine.
- Link opens in new tab when projectId present (`target="_blank"`).

---

## Part 9 — Revenue Impact Workspace (detail)

### 9.1 Sections in order

1. **Header** — “Revenue Impact Simulation”, project name (from context), last updated (from profile).
2. **Business context panel** — Business model (dropdown from registry), monthly revenue (required number), sensitivity mode (conservative | balanced | aggressive), collapsible advanced inputs (JSON). Auto-save on change (debounce 800 ms); shows “Saving…” then “Saved ✓”. Does not run simulation.
3. **Performance snapshot** — Read-only: Overall health, LCP, TTI/INP, CLS from latest snapshot. If no snapshot, message to run analysis from home.
4. **Run simulation** — Single button. Only action that runs the impact engine and updates stored result and UI.
5. **Results panel** — Rendered only when `result` exists. Toggle: [ Strategic Map ] [ Financial Projection ]. Default after run: Strategic Map.

### 9.2 Strategic Map view

- Short explanation of matrix (rows = stages, columns = levers; color = impact; hover for details).
- If overall health &lt; 50: note that matrix is adjusted when site is underperforming.
- Matrix table (color-only cells), hover panel per cell (deterministic + cached AI refinement).
- Opportunity concentration bar + short explanation.
- Industry alignment scale + short explanation.
- Strategic brief block + short explanation (AI or fallback).

### 9.3 Financial Projection view

- Opportunity range (low, expected, high) in currency.
- If baselineRevenue &gt; 0: % uplift of expected vs monthly revenue.
- Confidence badge with tooltip (what confidence reflects).
- Primary drivers list.
- Competitor delta narrative if present.
- Timestamp: “Simulation run using performance snapshot from [date].”

### 9.4 Data loading

- On mount: GET project-business-profile and GET projects/[projectId] in parallel. Profile populates form; context provides project name and lastSnapshot for snapshot display and for run.

---

## Part 10 — Report templates (detail)

### 10.1 Executive report — renderRevenueImpactReport(data)

- **Input type:** RevenueImpactReportInput (current_revenue, impact_low/high, uplift_low/high, uplift_percent_low/high, primary_stage, primary_lever, metric_name, current_metric_value, industry_benchmark, gap_value, industry_alignment, confidence_level, snapshot_date).
- **Sections (8):** Revenue Snapshot, Metric Comparison, Why This Impacts Revenue, Primary Focus, Expected Outcome, Industry Position, Confidence Statement, Snapshot Reference.
- **Rule:** No calculations; only string insertion. Caller supplies all numbers.

### 10.2 Founder-friendly report — renderFounderFriendlyRevenueReport(data)

- **Input type:** FounderFriendlyReportInput (adds website_url; same monetary and metric fields).
- **Sections (9):** Revenue Snapshot, What This Means, Primary Focus, Metric Gap, Why This Affects Revenue, Expected Outcome, Industry Position, Confidence, Snapshot Reference.
- **Rule:** Same: no calculations; only insertion. Tone: simple, direct, product-partner style.

---

## Part 11 — Data flow summary

1. **User on dashboard** → Card fetches profile (GET project-business-profile). If no profile → configure CTA. If profile → summary + link to workspace.
2. **User opens workspace** → Load profile + project context (GET project-business-profile, GET projects/[projectId]). Form shows saved business context; snapshot shows latest performance.
3. **User edits business context** → Debounced POST project-business-profile (auto-save). “Saving…” / “Saved ✓”.
4. **User clicks Run simulation** → POST profile (ensure row), runImpactEngine(...), PATCH lastCalculatedOpportunity + lastConfidence, set result in state. UI shows Strategic Map or Financial Projection.
5. **Strategic Map** → computeStrategicMatrix(...) from snapshot + businessModelId. Optional: one strategic-brief request per run; per-cell refinement on hover (cached).
6. **No automatic re-run** when snapshot or inputs change; user must click Run again.

---

## Part 12 — Quick reference tables

### 12.1 Business models (registry)

| id | funnelTemplateId | sensitivityProfileId |
|----|------------------|----------------------|
| ecommerce | ecommerce | ecommerce |
| saas | saas | saas |
| leadgen | leadgen | leadgen |
| aiTool | aiTool | aiTool |
| media | media | media |

### 12.2 Sensitivity modes (stored in profile)

| Value | Use |
|-------|-----|
| conservative | User choice; stored and displayed. |
| balanced | Default. |
| aggressive | User choice. |

(Engine logic is not changed by this feature; sensitivity mode is stored for UX/future use.)

### 12.3 Matrix intensity → color

| Intensity | Color |
|-----------|--------|
| low | Soft green |
| medium | Amber |
| high | Red |

### 12.4 Industry alignment tiers

Below Baseline | Baseline | Top Quartile | Best-in-Class.

---

## Part 13 — Principles to avoid deviation

1. **Simulation is explicit** — Only “Run simulation” in the workspace triggers the impact engine.
2. **Results are one-time** — No auto-refresh; user re-runs to update.
3. **Opportunity only** — Ranges and uplift; no single number or fear messaging.
4. **Engine untouched** — Revenue math lives only in impactEngine/; we only call it and display.
5. **Profile per project** — One business profile per project; card and workspace use same APIs.
6. **Strategic Map default** — After a run, default view is Strategic Map; Financial Projection is the other tab.
7. **No calculations in templates** — Report templates only insert provided values; caller supplies all numbers.

This is the full description of the Revenue Impact feature. Use it as the single source of truth for behavior, boundaries, and implementation details.
