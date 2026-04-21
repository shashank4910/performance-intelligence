# PROJECT STATE EXTRACTION — Performance Intelligence

**Purpose:** Enable another AI or developer to resume development after a long break.  
**Date:** 2025-02-21

---

## 1. PROJECT PURPOSE

### What This Project Builds

**Performance Intelligence** is a SaaS product that turns Lighthouse/PageSpeed performance data into business-focused insights. It answers: *How does my website’s speed affect revenue, and what should I fix first?*

### Target Users

- **Founders and product owners** who need non-technical performance summaries
- **Marketing and growth teams** who care about conversion impact
- **Engineers** who want technical root causes and fix blueprints

### Problem Solved

- Raw Lighthouse data is hard to interpret
- Performance impact on revenue is unclear
- Prioritization of fixes is subjective
- No clear link between metrics and business outcomes

### How the System Works (High Level)

1. User enters a URL on the home page
2. App calls Google PageSpeed API (mobile + desktop)
3. Lighthouse audits are processed into risk scores and revenue leak estimates
4. AI generates executive summary and per-metric root-cause analysis
5. User sees a dashboard with health score, risk breakdown, revenue impact, and metric-level fix blueprints
6. Logged-in users get projects stored in PostgreSQL; guests get a blurred report with signup CTA

---

## 2. CURRENT ARCHITECTURE

### Frontend

- **Framework:** Next.js 16.1.6, React 19.2.3
- **Styling:** Tailwind CSS 4
- **Auth:** NextAuth.js (CredentialsProvider, JWT session)
- **Main pages:**
  - `/` — Home: URL input, analyze button, HeroPreview, feature cards
  - `/report` — Guest report (blurred, localStorage `pendingAnalysisResult`)
  - `/dashboard` — Redirects to first project
  - `/dashboard/[projectId]` — Full report (sessionStorage `pi:project:{id}`)
  - `/dashboard/[projectId]/revenue-impact` — Revenue Impact Workspace
  - `/financial-report` — Pro-only financial forensic view
  - `/performance-history` — Placeholder (redirects to login or dashboard)
  - `/login`, `/auth/login`, `/auth/signup` — Auth flows

### Backend

- **API routes:** Next.js App Router (`app/api/`)
- **Main route:** `GET /api/analyze?url=&revenue=&mobileShare=&industry=` — full analysis pipeline
- **Other routes:**
  - `POST /api/project-business-profile` — Create/update business profile
  - `GET /api/project-business-profile?projectId=` — Fetch profile
  - `PATCH /api/project-business-profile` — Update profile or calculation metadata
  - `POST /api/cortex-narrative` — AI impact narrative
  - `POST /api/metric-explanation` — AI metric explanation
  - `POST /api/auth/[...nextauth]` — NextAuth handlers
  - `POST /api/signup` — User registration
  - `GET /api/projects/[projectId]` — Project CRUD
  - `POST /api/compare`, `POST /api/competitive-intelligence`, `POST /api/diagnosis-summary`, `POST /api/strategic-brief`, `POST /api/strategic-cell-refinement`, `POST /api/save-pending-result` — Present but may be stubs or partial

### Automation Tools

- **Make.com:** Referenced only in `fix-route-structure.ps1` (PowerShell script). That script was used to fix a route structure and contains a Make.com webhook URL. The **current** `app/api/analyze/route.ts` does **not** use Make.com; it calls PageSpeed API directly. No Make.com scenarios are wired into the live app.

### AI Components (OpenAI)

- **Model:** `gpt-4o-mini`
- **Usage:**
  1. **Executive summary** — In `/api/analyze`: given metrics + risk scores → 2–4 sentence summary
  2. **Per-metric AI analysis** — In `/api/analyze`: for each Poor/Needs Improvement metric → `rootCause`, `fixes[]`, `impact`, `difficulty`
  3. **Metric explanation** — In `/api/metric-explanation`: `shortExplanation`, `detailedExplanation` for drawer
  4. **Cortex narrative** — In `/api/cortex-narrative`: stage-based impact narrative (fallback used if no key)

### APIs Used

- **Google PageSpeed Insights v5:** `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=...&strategy=mobile|desktop&key=PAGESPEED_API_KEY`
- **No other external APIs** in the main flow

### Data Flow: URL → Report

```
User enters URL
    ↓
GET /api/analyze?url=...
    ↓
1. Rate limit check (10 req/min per IP)
2. Cache check (getCache) — skip Lighthouse if cached
3. PageSpeed API (mobile)
4. Extract audits → cleanMetrics, detailedMetrics
5. computeAllScores(cleanMetrics) → risk scores
6. computeCortexV2(audits, monthlyRevenue) → estimatedMonthlyLeak, leak_by_metric
7. For each Poor/Needs Improvement metric:
   - getResourcesForMetric(auditId, audits) → resources
   - OpenAI: rootCause, fixes, impact, difficulty (cached ai:{url}:{metricKey})
8. OpenAI: executive_summary
9. Desktop PageSpeed run → deviceImpact
10. If logged in: getOrCreateProject, save PerformanceSnapshot
11. trimLighthouseForStorage → rawAudit
12. setCache(url, response) — excludes rawAudit, revenueImpact
13. Return JSON
    ↓
Frontend: if userAuthenticated → sessionStorage + redirect /dashboard/{projectId}
          else → localStorage pendingAnalysisResult + redirect /report
```

---

## 3. FEATURES ALREADY IMPLEMENTED

### 3.1 URL Performance Audit

- **What:** Analyze any URL via PageSpeed API
- **Where:** `app/api/analyze/route.ts` (GET handler)
- **How:** Fetches mobile + desktop, extracts audits, builds `detailedMetrics`, `cleanMetrics`

### 3.2 Lighthouse Metric Extraction

- **What:** Map Lighthouse audits to structured metrics
- **Where:** `app/api/analyze/route.ts` lines 280–306 (`detailedMetrics`), 379–385 (`cleanMetrics`)
- **How:** Reads `audits["largest-contentful-paint"]`, etc.; handles TTFB fallback from LCP items

### 3.3 clean_metrics Generation

- **What:** Normalized metrics for risk engine
- **Where:** `app/api/analyze/route.ts` lines 379–385
- **Structure:** `{ lcp, cls, inp, tbt, fcp, speedIndex, domSize, mainThreadWork }` (ms or raw)

### 3.4 Risk Scoring

- **What:** Speed, UX, SEO, Conversion, Scaling risk scores (0–100)
- **Where:** `lib/riskEngine.ts`
- **How:** `computeAllScores(cleanMetrics)` → linear risk curves per metric, weighted average for overall health

### 3.5 Revenue Leak Attribution (CORTEX v2)

- **What:** Stage-based revenue leak: Visual Entry, Interaction, Trust, Infrastructure
- **Where:** `lib/impactEngine/cortexV2.ts`
- **How:** Sigmoid/exponential curves per stage, infrastructure amplifier, proportional allocation to metrics; `Σ(leakByMetric) === totalLeak`

### 3.6 Per-Resource Revenue Attribution

- **What:** Distribute metric leak across contributing resources
- **Where:** `lib/impactEngine/revenueLeakCalculator.ts` — `attributeLeakToResources`
- **How:** USA (Unified Severity Attribution) with sqrt(impactWeight × resourceSize)

### 3.7 AI Root Cause Analysis (Per Metric)

- **What:** For Poor/Needs Improvement metrics, OpenAI returns rootCause, fixes, impact, difficulty
- **Where:** `app/api/analyze/route.ts` lines 424–374
- **How:** Cached by `ai:{url}:{metricKey}` (1 hour TTL)

### 3.8 Executive Summary (AI)

- **What:** 2–4 sentence summary for stakeholders
- **Where:** `app/api/analyze/route.ts` lines 458–494
- **How:** OpenAI with metrics + risk scores; fallback on error

### 3.9 Metrics Dashboard + Drawer

- **What:** Sectioned metrics (Core, Load, Blocking, Backend), "View Details" opens right drawer
- **Where:** `components/DetailedMetricsBoard.tsx`
- **How:** Renders `metrics_for_dashboard`; drawer shows short/detailed explanation, Contributing Resources, Technical | Financial tabs, Fix Blueprint (Pro)

### 3.10 Resource Extraction (API + Fallback)

- **What:** Contributing resources per metric
- **Where:** `app/api/analyze/route.ts` — `extractOffendingResources`, `getResourcesForMetric`; `components/DetailedMetricsBoard.tsx` — `getResourcesFromRawAudit`
- **How:** API uses audit details (LCP element, render-blocking, long-tasks, etc.); board falls back to rawAudit when API returns none

### 3.11 Report Lock (Guest Flow)

- **What:** Blurred report + signup overlay for guests
- **Where:** `components/ReportLockWrapper.tsx`
- **How:** `isLocked` → blur(8px) on content, overlay with Sign Up / Login

### 3.12 Demo Pro Unlock

- **What:** `localStorage.demoPro = true` unlocks Pro features without payment
- **Where:** `components/UpgradeModal.tsx`, `app/report/page.tsx`, `app/dashboard/[projectId]/page.tsx`
- **How:** "Complete Demo Upgrade" sets flag, opens `/financial-report`

### 3.13 Business Profile + Revenue Refinement

- **What:** Save monthly revenue, business model, traffic per project
- **Where:** `impactEngine/projectBusinessProfileService.ts`, `app/api/project-business-profile/route.ts`, `components/RefineRevenueModal.tsx`
- **How:** PATCH to project-business-profile; used for CORTEX v2 monthlyRevenue

### 3.14 Revenue Impact Workspace

- **What:** Configure business model, monthly revenue, sensitivity; run impact engine
- **Where:** `components/RevenueImpactWorkspace.tsx`, `impactEngine/impactEngineService.ts`
- **How:** `runImpactEngine` → `runRevenueProjection`, optional `runCompetitorOverlay`; Strategic Map view

### 3.15 Performance Snapshot Storage

- **What:** Persist snapshots for logged-in users
- **Where:** `app/api/analyze/route.ts` lines 541–593, `lib/project.ts`
- **How:** `prisma.performanceSnapshot.create` with overallHealth, lcp, inp, ttfb, cls, tbt, revenueRisk, rawAudit

### 3.16 Performance Delta

- **What:** Compare current vs previous snapshot
- **Where:** `lib/deltaEngine.ts`, used in analyze response
- **How:** `computePerformanceDelta(current, previous)` → deltaHealth, deltaMetrics

### 3.17 Rate Limiting

- **What:** 10 requests per minute per IP
- **Where:** `lib/rateLimit.ts`
- **How:** In-memory Map; used by analyze and metric-explanation routes

### 3.18 Caching

- **What:** 10-minute TTL cache for analyze results
- **Where:** `lib/cache.ts`
- **How:** In-memory Map; rawAudit and revenueImpact excluded from cached payload

### 3.19 Attribution Diagnostic

- **What:** Verify attribution math (uniqueness, variance, summation)
- **Where:** `lib/diagnostics/attributionTester.ts`
- **How:** `runAttributionDiagnostic` + `logDiagnosticReport` at end of analyze

---

## 4. DATA STRUCTURES / VARIABLES

### cleanMetrics (LighthouseMetrics)

- **Structure:** `{ lcp, cls, inp, tbt, fcp, speedIndex, domSize, mainThreadWork }` — all numbers (ms or raw)
- **Created:** `app/api/analyze/route.ts` lines 379–385
- **Used:** `lib/riskEngine.ts` (computeAllScores), revenue calculations

### audits_raw / pageSpeedData.lighthouseResult.audits

- **Structure:** `Record<string, { numericValue?, score?, details?, ... }>`
- **Created:** PageSpeed API response
- **Used:** detailedMetrics, cleanMetrics, getResourcesForMetric, CORTEX v2, AI prompts

### detailedMetrics

- **Structure:** `{ core: { lcp, cls, inp, fcp }, load: { speedIndex, tti, ttfb }, blocking: { tbt, longTasks, bootupTime, mainThread }, backend: { ... } }`
- **Created:** `app/api/analyze/route.ts` lines 280–306
- **Used:** Response, frontend display

### metrics_for_dashboard

- **Structure:** `Array<{ metricKey, label, displayValue, verdict, aiAnalysis?, resources? }>`
- **Created:** `app/api/analyze/route.ts` loop over SECTION_METRICS
- **Used:** `DetailedMetricsBoard` props

### analysis_result / response

- **Structure:** `{ summary, overallHealth, revenueRiskScore, revenueRiskLevel, estimatedMonthlyLeak, leak_by_metric, risk_breakdown, fix_priorities, detailed_metrics, metrics_for_dashboard, rawAudit, revenueImpactInputs, deviceImpact, performanceChange?, projectId?, userAuthenticated, ... }`
- **Created:** `app/api/analyze/route.ts` lines 502–531
- **Used:** Frontend pages (report, dashboard)

### rawAudit

- **Structure:** Trimmed `lighthouseResult` (no fullPageScreenshot, screenshot-thumbnails, final-screenshot)
- **Created:** `trimLighthouseForStorage` in analyze route
- **Used:** Stored in response, PerformanceSnapshot.rawAudit, DetailedMetricsBoard for `getResourcesFromRawAudit`

### leak_by_metric

- **Structure:** `Record<string, number>` — e.g. `{ lcp: 1200, tti: 800, cls: 150 }`
- **Created:** `computeCortexV2(...).leakByMetric`
- **Used:** DetailedMetricsBoard for per-resource attribution, Financial Report

### CortexV2Result

- **Structure:** `{ totalLeak, leakByMetric, diagnostic }`
- **Created:** `lib/impactEngine/cortexV2.ts` — `computeCortexV2`
- **Used:** analyze route for estimatedMonthlyLeak, leak_by_metric

### ContributingResource

- **Structure:** `{ url, type, urgencyLevel, transferSize, reason, affects?, executionTimeMs?, ... }`
- **Created:** `analyzeMetric` (metricIntelligenceEngine), `getResourcesFromRawAudit`, API `extractOffendingResources`
- **Used:** DetailedMetricsBoard drawer, attributeLeakToResources

### StoredProject (sessionStorage)

- **Structure:** `{ url, data: analysis_result, analyzedAt }`
- **Key:** `pi:project:{projectId}`
- **Used:** Dashboard project page

### pendingAnalysisResult (localStorage)

- **Structure:** `{ url, data: analysis_result }`
- **Used:** Guest report page, financial-report fallback

---

## 5. AI PROMPTS

### 5.1 Executive Summary

**Location:** `app/api/analyze/route.ts` lines 461–478

**Full prompt:**
```
You are a Performance Intelligence Engine for a SaaS product.

Given these Lighthouse metrics (times in ms):
${JSON.stringify(cleanMetrics)}

And these computed risk scores (0–100, higher = worse):
- Speed: ${speedRisk}
- UX: ${uxRisk}
- SEO: ${seoRisk}
- Conversion: ${conversionRisk}
- Scaling: ${scalingRisk}
- Overall health: ${overallHealth}/100

Write a short executive summary (2–4 sentences) for a non-technical stakeholder. Focus on what matters most for the business: user experience, conversions, and scalability. Be direct and actionable.

STRICT: Return only valid JSON. No markdown, no explanation outside JSON.

Return EXACTLY:
{ "executive_summary": "Your summary text here." }
```

**Expected output:** `{ executive_summary: string }`

---

### 5.2 Per-Metric AI Analysis (rootCause, fixes)

**Location:** `app/api/analyze/route.ts` lines 424–430

**Full prompt:**
```
You are a performance expert. For this Lighthouse metric that is failing or needs improvement:

Metric: ${label}
Value: ${displayValue}
Lighthouse context: ${auditDesc}

Return ONLY valid JSON with no markdown or extra text:
{ "rootCause": "one short paragraph", "fixes": ["fix1", "fix2", "fix3"], "impact": "Low|Medium|High", "difficulty": "Low|Medium|High" }
```

**Expected output:** `{ rootCause, fixes, impact, difficulty }`

---

### 5.3 Metric Explanation (short + detailed)

**Location:** `lib/metricAIExplanation.ts` — `buildMetricExplanationPrompt`

**Full prompt:**
```
You are explaining ${name} impact to a non-technical founder.

Explain:
- What is happening
- How it affects users
- Why it matters for engagement or conversion
- Why fixing it improves experience

Avoid:
- Numeric references
- Technical jargon
- Lighthouse mentions
- Score discussion

Keep 4–6 sentences max. Clear. Strategic. Insightful.

Context: Issue type ${ctx.keyIssueType}. Contributing resources: ${ctx.totalResourceCount ?? 0}.

Return ONLY valid JSON with no markdown or extra text:
{ "shortExplanation": "2-3 sentences, plain English, no numbers", "detailedExplanation": "4-6 sentences as above" }
```

**Expected output:** `{ shortExplanation, detailedExplanation }`

**Used by:** `app/api/metric-explanation/route.ts` (POST), `generateMetricAIExplanationAsync`

---

### 5.4 Cortex Impact Narrative

**Location:** `lib/impactEngine/cortexNarrative.ts` — `getImpactNarrativePrompt`

**Full prompt:**
```
You are a performance economics analyst.
Explain how a performance issue in the ${stageLabel} stage causes behavioral revenue loss.
Include the exact dollar value: ${amount}.
Use psychologically grounded terms such as:
- Visual Abandonment
- Interaction Paralysis
- Trust Erosion
- Infrastructure Debt

Keep it concise, authoritative, business-focused.
No hype.
No technical jargon unless necessary.
One paragraph only.
```

**Expected output:** Free-form paragraph (no JSON)

**Used by:** `app/api/cortex-narrative/route.ts` (POST) — returns `{ narrative }`; fallback used if no key or error

---

## 6. SCORING LOGIC

### Risk Scoring (lib/riskEngine.ts)

- **Speed risk:** LCP, TBT, Speed Index — linear interpolation from thresholds to 0–100
- **UX risk:** CLS, INP, TBT
- **SEO risk:** LCP, FCP, Speed Index
- **Conversion risk:** LCP, INP, TBT
- **Scaling risk:** DOM size, main thread work, TBT

**Thresholds (examples):** LCP 2500–5000ms, TBT 300–600ms, CLS 0.1–0.25, etc.

### Overall Health

- **Formula:** `100 - weightedRisk`
- **Weights (HEALTH_WEIGHTS):** speed 30%, ux 25%, seo 15%, conversion 20%, scaling 10%
- **Custom weights:** Supported via `?weights=` query; `normalizeWeights` ensures sum = 1

### Category Scores

- Same risk scores used for `risk_breakdown` (speed_risk_score, ux_risk_score, etc.)
- **getRiskLevel(score):** 0–39 Low, 40–69 Medium, 70–100 High

### Fix Priorities

- **generateFixPriorities:** Top 3 categories by `score × weight`, sorted by weighted impact
- **priorityFromScore:** ≥70 High, ≥40 Medium, else Low

### Revenue Risk Score

- **calculateRevenueRiskScore:** Base = speed×0.4 + conversion×0.4 + ux×0.2; adjusted by LCP/INP severity and mobile traffic %

### Business Impact (estimateBusinessImpact)

- overallHealth ≥85: Minimal, 0–3%
- ≥70: Moderate, 3–8%
- ≥50: Significant, 8–15%
- ≥30: Severe, 15–25%
- else: Critical, 25%+

### CORTEX v2 Leak (lib/impactEngine/cortexV2.ts)

- **Stage curves:** Visual (sigmoid), Interaction (exponential), Trust (capped linear), Infrastructure (log multiplier)
- **Final abandonment:** `1 - Π(1 - stageImpact)` × infrastructureAmplifier, capped at 0.6
- **Total leak:** `monthlyRevenue × finalAbandonment` (or traffic×VPV×FAP if traffic provided)
- **Leak by metric:** Proportional to impact; cent-rounding so sum === totalLeak

---

## 7. KNOWN BUGS

### 7.1 Fallback Branch Still Has Blur/Masking (DetailedMetricsBoard)

- **What:** When `active.aiAnalysis` is used (fallback path, no metricIntelligence), the drawer still shows `showFinancialBlur`, `maskRevenueForGuest`, "Click to see Revenue Recovery Plan", and `blur(4px)` for revenue.
- **Where:** `components/DetailedMetricsBoard.tsx` lines ~966–1016 (fallback branch)
- **Expected:** Non-Pro users should not see any revenue UI (no blur, no masked values). Pro users see full dollar badges.
- **Root cause:** Rollback of CORTEX v3 surgical UI was done for the main branch but not for the `active.aiAnalysis` fallback.

### 7.2 riskMetricMap Mismatch

- **What:** `riskMetricMap` maps "Speed" → `["lcp", "ttfb", "fcp", "speedIndex"]` but metric IDs in SECTION_METRIC_IDS use keys like `core-lcp`, `load-ttfb`. `scrollToMetric` may receive `lcp` and need to resolve to `core-lcp` or the correct DOM id.
- **Where:** `lib/riskMetricMap.ts`, `lib/scrollToMetric.ts`
- **Impact:** "Metrics Responsible" / "Contributing Metrics" buttons may scroll to wrong or missing elements.

### 7.3 JSON Parsing from OpenAI

- **What:** OpenAI sometimes returns markdown-wrapped JSON or trailing text. `JSON.parse(content)` can throw.
- **Where:** `app/api/analyze/route.ts` (executive summary, per-metric AI), `lib/metricAIExplanation.ts` (parseMetricExplanationResponse strips ```)
- **Mitigation:** Try/catch with fallback; metric explanation has `parseMetricExplanationResponse` that strips code blocks. Executive summary and per-metric analysis do not strip markdown — may fail on malformed output.

### 7.4 Performance History Placeholder

- **What:** `/performance-history` is a placeholder. Authenticated users are redirected to dashboard; unauthenticated see a CTA. No actual history UI or trend charts.
- **Where:** `app/performance-history/page.tsx`

### 7.5 Prisma Datasource URL

- **What:** `prisma/schema.prisma` datasource has `provider = "postgresql"` but no `url`. `prisma.config.ts` provides url via `defineConfig`. Prisma 7 uses this pattern; ensure `DATABASE_URL` is set in `.env` or `.env.local`.

### 7.6 Extract Offending Resources — request.url

- **What:** `extractOffendingResources` uses `item.request?.url` as fallback for URL. Some Lighthouse audit items use different shapes; `item.url` or `item.source` may be primary. The code handles this but edge cases may yield empty resources for some metrics.

### 7.7 getResourcesFromRawAudit Slice

- **What:** `getResourcesFromRawAudit` returns `items.slice(0, 15)`. If a metric has more than 15 resources in raw audit, the rest are dropped. User rollback spec said "do not limit count" — this may still limit display in fallback path.

---

## 8. INCOMPLETE FEATURES

### 8.1 Performance History / Trend Tracking

- **Planned:** Track performance over time, show deltas, detect regressions.
- **Exists:** `PerformanceSnapshot` table, `computePerformanceDelta`, `getLastSnapshots`, `performanceChange` in response.
- **Missing:** History UI, trend charts, regression alerts. Dashboard "Performance History" section is text-only.

### 8.2 Competitive Intelligence

- **Planned:** Compare with competitor URLs, side-by-side metrics.
- **Exists:** `runCompetitorOverlay` in impactEngine, `competitiveIntelligence.ts`, `competitiveMultiplier.ts`, API route stubs.
- **Missing:** UI to add competitor URLs, run comparison, display results.

### 8.3 Market Position / Benchmarking

- **Planned:** Industry benchmarks, "Gap to Leader".
- **Exists:** `industryBenchmarks.ts`, HeroPreview shows "Market Position" and "Gap to Leader" as "—".
- **Missing:** Real benchmark data, integration with HeroPreview.

### 8.4 Revenue Impact Modeling (Full)

- **Planned:** Funnel-aware revenue projection with sensitivity modes.
- **Exists:** `runImpactEngine`, `runRevenueProjection`, `RevenueImpactWorkspace`, `StrategicMapView`, business profile.
- **Missing:** Full integration with analyze flow; workspace is separate. Dashboard uses CORTEX v2 for leak, not impact engine projection.

### 8.5 Save Pending Result (Guest → User)

- **Planned:** When guest signs up, attach `pendingAnalysisResult` to new user/project.
- **Exists:** `app/api/save-pending-result/route.ts` (stub or partial).
- **Missing:** Flow from signup redirect to save and project creation.

### 8.6 Compare API

- **Exists:** `app/api/compare/route.ts` — implementation unknown.
- **Missing:** Documented behavior, frontend integration.

### 8.7 Strategic Brief / Cell Refinement APIs

- **Exists:** `app/api/strategic-brief/route.ts`, `app/api/strategic-cell-refinement/route.ts`
- **Missing:** Clear usage and integration points.

---

## 9. DATABASE / STORAGE

### Database

- **ORM:** Prisma 7
- **Provider:** PostgreSQL (`DATABASE_URL` in `.env` / `.env.local`)

### Tables

| Table | Purpose |
|-------|---------|
| **user** | id, email, password (bcrypt), createdAt |
| **project** | id, url, industry, userId, createdAt |
| **project_business_profile** | projectId (unique), businessModelId, monthlyRevenue, advancedInputs, sensitivityMode, lastCalculatedOpportunity, lastConfidence, modelVersion, lastRunAt, lastSnapshotTimestamp, updatedAt |
| **performance_snapshot** | id, projectId, timestamp, overallHealth, lcp, inp, ttfb, cls, tbt, revenueRisk, moatScore, domainScores, competitive, rawAudit |

### What Is Stored

- **User:** Credentials for login
- **Project:** URL + industry per user
- **ProjectBusinessProfile:** Business model, revenue, last opportunity calculation
- **PerformanceSnapshot:** Per-run metrics + optional rawAudit (trimmed Lighthouse)

### Reports

- **Not stored in DB.** Analysis results live in:
  - **sessionStorage** (`pi:project:{projectId}`) for logged-in users
  - **localStorage** (`pendingAnalysisResult`) for guests
- Snapshots store numeric metrics and optionally rawAudit, but the full report payload is client-side only.

---

## 10. FILE STRUCTURE

```
performance-intelligence/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts          # Main analysis pipeline
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── compare/route.ts
│   │   ├── competitive-intelligence/route.ts
│   │   ├── cortex-narrative/route.ts
│   │   ├── diagnosis-summary/route.ts
│   │   ├── metric-explanation/route.ts
│   │   ├── project-business-profile/route.ts
│   │   ├── projects/[projectId]/route.ts
│   │   ├── save-pending-result/route.ts
│   │   ├── signup/route.ts
│   │   ├── strategic-brief/route.ts
│   │   └── strategic-cell-refinement/route.ts
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── dashboard/
│   │   ├── [projectId]/
│   │   │   ├── page.tsx              # Project report
│   │   │   └── revenue-impact/page.tsx
│   │   └── layout.tsx
│   ├── financial-report/page.tsx
│   ├── performance-history/page.tsx
│   ├── report/page.tsx               # Guest report
│   ├── analyze/page.tsx               # Redirects to /
│   ├── login/page.tsx
│   ├── page.tsx                       # Home
│   ├── layout.tsx
│   ├── globals.css
│   └── providers.tsx
├── components/
│   ├── AnimatedNumber.tsx
│   ├── DashboardSidebar.tsx
│   ├── DetailedMetricsBoard.tsx       # Metrics + drawer
│   ├── FixBlueprintLockedPreview.tsx
│   ├── FixBlueprintPro.tsx
│   ├── GrowthImpactRoadmap.tsx
│   ├── MetricAuditTabs.tsx
│   ├── ProUpgradeModal.tsx
│   ├── RefineRevenueModal.tsx
│   ├── ReportLockWrapper.tsx
│   ├── RevenueImpactCard.tsx
│   ├── RevenueImpactWorkspace.tsx
│   ├── StrategicMapView.tsx
│   └── UpgradeModal.tsx
├── context/
│   └── DashboardNavContext.tsx
├── impactEngine/
│   ├── index.ts
│   ├── impactEngineService.ts
│   ├── projectBusinessProfileService.ts
│   ├── businessModelRegistry.ts
│   ├── revenueProjectionEngine.ts
│   ├── competitorOverlayEngine.ts
│   ├── funnelTemplates.ts
│   ├── sensitivityModels.ts
│   └── impactTypes.ts
├── lib/
│   ├── auth.ts
│   ├── cache.ts
│   ├── competitiveIntelligence.ts
│   ├── competitiveMultiplier.ts
│   ├── deltaEngine.ts
│   ├── diagnostics/attributionTester.ts
│   ├── impactEngine/
│   │   ├── aiFilter.ts                # getSurgicalCulprits (not used after rollback)
│   │   ├── businessModelRegistry.ts
│   │   ├── cortexNarrative.ts
│   │   ├── cortexV2.ts
│   │   ├── cortexV3.ts                # Not used in drawer after rollback
│   │   ├── revenueLeakCalculator.ts
│   │   └── ...
│   ├── impactIndexEngine.ts
│   ├── industryBenchmarks.ts
│   ├── metricAIExplanation.ts
│   ├── metricDrawerMonetization.ts
│   ├── metricIntelligenceEngine.ts
│   ├── primaryStageFromDrivers.ts
│   ├── project.ts
│   ├── prisma.ts
│   ├── rateLimit.ts
│   ├── recommendationEngine.ts
│   ├── resourceImpactEngine.ts
│   ├── revenueImpactEngine.ts
│   ├── riskEngine.ts
│   ├── riskMetricMap.ts
│   ├── scrollToMetric.ts
│   └── ...
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── PROJECT-STATE-EXTRACTION.md    # This file
│   ├── FORENSIC-EXTRACTION.md
│   └── ...
├── package.json
├── prisma.config.ts
└── fix-route-structure.ps1             # Legacy script (Make.com ref)
```

---

## 11. LAST DEVELOPMENT STATE

### Most Likely Last Focus

1. **CORTEX v3 Surgical UI rollback** — Recent work removed `getSurgicalCulprits`, `runCortexV3Audit`, "Top 7 Surgical Culprits", "Verified by CORTEX-AI", and blurred revenue masking from the **main** drawer path. The **fallback** path (`active.aiAnalysis`) was not fully updated and still uses blur/masking.

2. **Full-information drawer** — Goal was to show all contributing resources (no 7-cap), full text, no compact mode, and simple Pro revenue logic (show $ or hide).

3. **Resource extraction robustness** — `getResourcesForMetric` and `getResourcesFromRawAudit` were extended to support more audit IDs and `request.url` so "Contributing Resources (0)" would not appear when resources exist.

### Evidence

- `lib/impactEngine/aiFilter.ts` exists but is no longer imported in DetailedMetricsBoard.
- `lib/impactEngine/cortexV3.ts` exists but `runCortexV3Audit` is not used in the board.
- Fallback branch in DetailedMetricsBoard still references `maskRevenueForGuest`, `showFinancialBlur`, "Click to see Revenue Recovery Plan".
- Docs mention "Forensic Extraction", "revenue-impact-feature" — suggests revenue and attribution were recent focus.

---

## 12. NEXT DEVELOPMENT STEPS

### Immediate (Bug Fixes)

1. **Remove blur/masking from fallback branch** in `DetailedMetricsBoard.tsx` — align with main path: non-Pro = no revenue UI.
2. **Fix riskMetricMap / scrollToMetric** — Ensure metric IDs match DOM ids used by the board.
3. **Harden OpenAI JSON parsing** — Strip markdown/code blocks for executive summary and per-metric analysis, similar to `parseMetricExplanationResponse`.

### Short-Term (Completeness)

4. **Performance History UI** — Use `performanceChange` and snapshots to show deltas and a simple trend view.
5. **Integrate save-pending-result** — When guest signs up after analyze, save `pendingAnalysisResult` to a new project.
6. **Remove or repurpose `getResourcesFromRawAudit` slice(0, 15)** — If "no limit" is desired, consider increasing or removing the cap.

### Medium-Term (Features)

7. **Competitive Intelligence UI** — Add competitor URLs, run comparison, display in dashboard.
8. **Market benchmarks** — Connect `industryBenchmarks.ts` to HeroPreview and dashboard.
9. **Revenue Impact integration** — Use `runImpactEngine` output in the main dashboard flow where appropriate.

### Cleanup

10. **Remove dead code** — `aiFilter.ts`, `cortexV3.ts` if no longer needed.
11. **Document or implement stub APIs** — compare, competitive-intelligence, diagnosis-summary, strategic-brief, strategic-cell-refinement.
