# Revenue Stability Monitoring — Feature specification

**Status:** Shipped (engine + API + dashboard)  
**Last updated:** 2026-04-20

**Related:** `docs/AI_CONTEXT.md`, `docs/DECISION_LOG.md` (revenue range bounds), `lib/revenueStabilityMonitoring.ts`, `GET /api/projects/[projectId]/revenue-stability`

---

## Objective

Build **Revenue Stability Monitoring** — a **business monitoring system**, not a timeline or chart product.

**Primary question:** *Is my revenue getting safer or more at risk over time?*

---

## Core principles (non-negotiable)

1. **No raw metrics first**
2. **No chart-first UI**
3. **Decision → then explanation**
4. **Every output maps to revenue risk**
5. **Feels like a continuous monitor, not a report**

---

## Data model

Uses existing **`PerformanceSnapshot`**, extended with:

| Field | Purpose |
|-------|---------|
| `revenueAtRiskMin` / `revenueAtRiskMax` | Monthly at-risk range from `opportunityBoundsFromLoss` (same as headline loss × sensitivity bounds) |
| `dominantStage` | `landing` \| `interaction` \| `conversion` — from **`dominantStageFromLeakByMetric(leak_by_metric)`** |
| `monitoringScores` | JSON `{ speed, ux, seo, conversion }` — risk scores 0–100 at run time |

Core metrics remain on existing columns: `lcp`, `inp`, `cls` (seconds for LCP/INP, unitless CLS).

---

## Core engine

Compare **`currentSnapshot`** vs **`previousSnapshot`**:

- `deltaRevenueMin` / `deltaRevenueMax` — dollar deltas on range endpoints  
- `deltaHealth` — overall health delta  
- **Trend:** `worsening` \| `improving` \| `stable` from **midpoint** of revenue-at-risk range (±2% band = stable)  
- **Alert:** midpoint increase **> 10%** *or* **dominant stage worsens** (e.g. landing → interaction)

User-facing copy avoids ms, metric names, and raw Lighthouse jargon in the monitoring panel.

---

## Output sections (implemented)

1. **Current status** — 1–2 sentences, plain English  
2. **What changed** — up to 3 directional bullets (+/−/=); INP omitted from interaction copy when INP is missing; no layout/conversion blame when CLS is negligible  
3. **Revenue trend** — `Previous:` / `Current:` lines using **exact** engine range strings  
4. **Alert** (conditional) — shown when alert logic fires  
5. **Minimal history** (Pro, `extended=1`) — up to 5 lines: `[Date] — Improved|Stable|Worsened` only  

**Not implemented (per hard restrictions):** charts, metric timelines, tagging UI, competitor overlay, PIQ score.

---

## Monetization hooks (product)

| Tier | Behavior |
|------|----------|
| **Free** | Last comparison only (`extended=0` → two most recent snapshots) |
| **Pro** | `?extended=1` — up to **30 days** of snapshots + minimal history list |
| **Growth / Enterprise** | Alerts delivery, export/API — future billing integration |

Client passes **`isProUser`** (demo Pro or `userPlan === "pro"`) to request extended history.

---

## Implementation map

| Piece | Location |
|-------|----------|
| Engine | `lib/revenueStabilityMonitoring.ts` |
| Tests | `__tests__/revenueStabilityMonitoring.test.ts` |
| Snapshot write | `app/api/analyze/route.ts`, `app/api/save-pending-result/route.ts` |
| API | `app/api/projects/[projectId]/revenue-stability/route.ts` |
| UI | `components/RevenueStabilityMonitoring.tsx`, dashboard `#performance-change` |
| Prisma | `revenueAtRiskMin`, `revenueAtRiskMax`, `dominantStage`, `monitoringScores` on `performance_snapshot` |

Run after schema pull: `npx prisma db push` (or migrate in production).

---

## Mandatory test cases (see Jest file)

Tests 1–6 from the product spec are covered, including **TEST 6** cross-check: improving revenue trend must not co-occur with dominant stage worsening without flagging inconsistency (`validateStageRevenueAlignment`).

---

## Failure conditions (engineering)

- Output surfaces must not show raw ms/s in this panel  
- Revenue lines must match stored engine values  
- Inconsistent trend vs stage logs **`Inconsistent system output`** (see `validateMonitoringConsistency`, `validateStageRevenueAlignment`)
