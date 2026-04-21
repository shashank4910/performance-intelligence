# Revenue Impact Model — Audit & Defensible V1 Upgrade

Last updated: 2026-04-19

This document captures (1) the original V2 model audit and (2) the defensible-V1
stabilization that ships in `lib/impactEngine/v2BehaviorModel.ts`. The model is
intentionally simple, bounded, and explainable — it is decision support, not a
prediction system.

---

## 1. Where the math lives

| Concern                                   | File                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| Per-metric impact + abandonment + headline `totalLoss` | `lib/impactEngine/v2BehaviorModel.ts`            |
| Stage / driver attribution + confidence base           | `impactEngine/revenueProjectionEngine.ts`        |
| Stage canonicalization + range + UI assembly           | `components/RevenueImpactWorkspace.tsx`          |
| Server-side leak number (analyze pipeline)             | `app/api/analyze/route.ts` (calls behavior model)|

The Workspace runs **two engines per simulation** and stitches the outputs:

1. `computeBehaviorRevenueImpact` (V2 behavior model) → produces the **total
   monthly revenue impact** that drives the headline range.
2. `runImpactEngine` (revenue projection engine) → produces `primaryDrivers`
   used for stage attribution. Its own opportunity range is **discarded**.

Confidence is now derived **in the Workspace** from input completeness, not
from the projection engine.

---

## 2. Defensible-V1 changes (April 2026)

### 2.1 Per-metric impact functions

| Metric | Formula                                                  | Notes |
| ------ | -------------------------------------------------------- | ----- |
| LCP    | `1 / (1 + exp(-0.8 * (LCP_seconds - 3.2)))`              | Inflection moved 2.5s → 3.2s; slope softened |
| TBT    | `1 - exp(-0.002 * max(0, TBT_ms - 300))`                 | Coefficient halved (0.004 → 0.002)           |
| INP    | `1 - exp(-0.0018 * max(0, INP_ms - 200))`                | Coefficient softened (0.003 → 0.0018)        |
| CLS    | `min(0.15, 2.5 * max(0, CLS - 0.1))`                     | Unchanged                                    |

### 2.2 Per-metric cap

```
impact_i = min(impact_i, 0.6)
```

No single metric can dominate the result with > 60% claimed abandonment.

### 2.3 Hybrid combination

```
multiplicative = 1 - Π(1 - impact_i)
average        = mean(impact_i)         // includes zeros
raw            = 0.5 * multiplicative + 0.5 * average
```

Pure multiplicative survival overstates compounding when several metrics fire.
The 50/50 hybrid keeps the survival shape while pulling the result toward the
linear baseline.

### 2.4 Damping

```
damped = 1 - (1 - raw)^0.7
```

Compresses the long tail above ~40% so worst-case scenarios don't run away.

### 2.5 Global cap

```
final_abandonment = min(damped, 0.50)
```

**Hard rule**: total abandonment can never exceed 50% of baseline revenue.

### 2.6 Range output (Workspace)

```
total_loss = baseline_revenue × final_abandonment
low        = round(bounds.low  × total_loss)
high       = round(min(bounds.high × total_loss, baseline_revenue))
```

`bounds` depends on the selected estimate style (see 2.7). Display:
`Estimated revenue impact: $LOW – $HIGH /month`.

### 2.7 Sensitivity / "Estimate style"

The original 0.75 / 1.0 / 1.25 multiplier on the headline loss has been **removed**.
The mode now adjusts the *displayed range bounds* only — the underlying
`total_loss` is identical across all three modes:

| Mode         | bounds.low | bounds.high | Effect                       |
| ------------ | ---------- | ----------- | ---------------------------- |
| Conservative | 0.50       | 0.75        | narrower, lower-bias range   |
| Balanced     | 0.60       | 0.90        | the canonical default        |
| Aggressive   | 0.70       | 1.00        | wider, higher-bias range (still capped at baseline) |

Rationale: the previous "label only" implementation made the selector look broken
because all three modes showed identical numbers. Range-width adjustment keeps
the model deterministic and bounded, but gives the user a meaningful choice
about how cautious the published range should be. The expected value
(`total_loss`), the per-metric cap, and the 50% global cap are unchanged by mode.

### 2.8 Engine consistency (TBT units)

`impactEngine/revenueProjectionEngine.ts` now imports the V2 impact functions and
converts snapshot units to ms before calling them. This eliminates the previous
TBT mismatch where the projection engine used a 1.0-second threshold while the
behavior model used 300ms.

### 2.9 Stage canonicalization

`canonicalizeStage` now maps every internal funnel-template stage to one of
three canonical UI stages:

| Internal stage(s)                                 | Canonical UI stage |
| ------------------------------------------------- | ------------------ |
| Landing                                           | Landing            |
| Product, Signup, Engagement, Activation, Try, Interact | Activation    |
| Checkout, Form, Submit, Monetization, Convert, Conversion, Trust, Purchase | Conversion |

Per-stage drivers are aggregated (sum) when multiple internal stages map to the
same canonical stage.

### 2.10 33% fallback removed

The previous 33%/34% per-stage fallback (used when a canonical stage had zero
contribution) has been removed. Stages with no contribution show `$0`. The only
remaining degenerate fallback fires when **no driver produces any contribution
at all** — in that case the entire loss is attributed to Landing, never to a
fabricated split.

After normalization, `Landing_loss + Activation_loss + Conversion_loss == total_loss`.

### 2.11 Confidence

Computed in the Workspace from input completeness against the chosen business
model's required keys:

| Provided required keys | Confidence |
| ---------------------- | ---------- |
| 0                      | Low        |
| 1 to N − 1             | Medium     |
| N (all)                | High       |

### 2.12 Trust disclaimer

The result hero now renders the line:

> Estimated impact based on performance patterns and user behavior models.

### 2.13 Number formatting

Existing `formatRevenueReadable` / `formatRevenueReadableAmount` helpers render
M / K suffixes — e.g. `$346K`, `$1.2M`, never `~$346123.4k`.

---

## 3. Before vs after

| Scenario (visitors 100k, conv 5%, AOV $200, LCP 3.0s, TBT 500ms, CLS 0.15) | Before | After |
| -------------------------------------------------------------------------- | ------ | ----- |
| LCP impact                                                                 | 73%    | 46%   |
| TBT impact                                                                 | 55%    | 33%   |
| CLS impact                                                                 | 12.5%  | 12.5% |
| Combined abandonment                                                       | 89%    | 35%   |
| Total loss (baseline $1M)                                                  | $890K  | $347K |
| Headline                                                                   | `$890K/month` | `$208K – $312K /month` |
| Aggressive mode                                                            | $1.11M (above baseline) | unchanged headline |

| Worst-case (LCP 5.0s, TBT 1500ms, CLS 0.3) — baseline $1M | Before | After |
| --------------------------------------------------------- | ------ | ----- |
| Combined abandonment                                      | ~99%   | 47.4% (capped) |
| Total loss                                                | ~$990K | $474K |

The validation target ("$200K – $500K for the canonical scenario") is met.

---

## 4. Open / known caveats

- **No empirical calibration.** Impact-curve coefficients are heuristic
  defaults chosen for shape, not derived from CRUX/RUM datasets. The bounds and
  damping make this safer, but the curves themselves remain assumed.
- **Sensitivity mode is now cosmetic.** The user-visible selector exists for
  framing only. If we want it back as a real lever, expose it as range-width
  control (narrower for conservative, wider for aggressive) — never as a
  multiplier on the headline.
- **Stage attribution still depends on `runImpactEngine`'s qualitative
  high/medium/low influence weights.** Only the canonicalization and missing-
  contribution behavior changed; the underlying driver scoring is unchanged.
- **Recovery range (60%–90%)** is a defensible default but not data-derived.
- **CORTEX path (`lib/impactEngine/cortexV2.ts`)** still runs in
  `app/api/analyze/route.ts` when no business profile exists. It has its own
  formulas and is **not** changed by this upgrade.

---

## 5. Summary

The model is now **bounded, consistent, and explainable**:

- per-metric impact ≤ 60%
- aggregate abandonment ≤ 50%
- TBT/INP/LCP units consistent across both engines
- stage breakdown derived from drivers, no 33% fabrication
- output is a range with a recovery cap at baseline
- confidence reflects how much real data the user gave us

It is intentionally **not** a prediction model.
