# Onboarding — repo layout and flows

## Top-level layout

```
app/           Next.js App Router — pages and API routes
components/    UI (dashboard, metrics board, modals, …)
lib/           Shared logic — impact engine, Prisma, labels, competitor copy helpers
engine/        Competitor analysis (PageSpeed, snapshot, scoring) — usable from client imports carefully
prisma/        Schema and migrations (db push)
docs/          Human and AI context — keep FEATURE_REGISTRY and SYSTEM_STATE current
```

## Main user flows

```
Home (URL input)
    → POST /api/analyze (PageSpeed mobile + desktop)
    → Dashboard or Report with stored snapshot

Dashboard /projectId
    → Sections: health, revenue, metrics drawer, priority fixes, competitor modal
    → Metric drawer: Technical tab | Financial forensic (Pro)

Competitor (separate from main analyze JSON)
    → GET /api/competitor-analysis?url=…&competitorUrls=…
    → engine/competitorAnalysis.ts → comparison_snapshot, risk, actions
```

## Data flow (analyze)

```
PageSpeed API
    → metricIntelligenceEngine (metrics + resources)
    → riskEngine (scores)
    → CORTEX v2 OR v2BehaviorModel (revenue, from profile)
    → revenueLeakCalculator (per-resource attribution)
    → UI + recommendations
```

## Pro vs Free (conceptual)

- **Pro:** `userPlan === "pro"` **or** `localStorage.demoPro === "true"` (see `SYSTEM_STATE.md`).
- Financial tab, revenue recovery detail, and some surfaces are gated.

## Where to change copy

- **Competitor “Why it matters” / deterministic pools:** `lib/competitorPhrasePools.ts`  
- **Competitor decision headline (behind/ahead):** `lib/competitorDecisionIntel.ts`  
- **Drawer recommendations:** `components/DetailedMetricsBoard.tsx`  

## Next steps for new contributors

1. Read `docs/AI_CONTEXT.md`  
2. Skim `docs/FEATURE_REGISTRY.md` for the area you’ll edit  
3. Run `npm run dev` with a valid `.env.local`  
4. After changes, run `npm run lint` and `npm run build`  
