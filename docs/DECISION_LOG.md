# DECISION: Revenue Impact Model — Defensible V1

## Status: LOCKED

## Date: 2026-04-19 (supersedes the 2026-03-18 raw V2 lock)

## Decision

We keep the behavior-based model shape (per-metric impact → combine →
baseline × abandonment) but stabilize it to produce realistic, bounded outputs.

## Model

For each metric:

```
impact_i = clamp(impact_metric(value), 0, 0.6)        // per-metric cap
```

Combine:

```
multiplicative = 1 - Π(1 - impact_i)
average        = mean(impact_i)                        // includes zeros
raw            = 0.5 * multiplicative + 0.5 * average  // hybrid
damped         = 1 - (1 - raw)^0.7                     // damping
abandonment    = min(damped, 0.50)                     // global cap
```

Impact functions:

| Metric | Formula |
| ------ | ------- |
| LCP    | `1 / (1 + exp(-0.8 * (LCP_seconds - 3.2)))` |
| TBT    | `1 - exp(-0.002 * max(0, TBT_ms - 300))`     |
| INP    | `1 - exp(-0.0018 * max(0, INP_ms - 200))`    |
| CLS    | `min(0.15, 2.5 * max(0, CLS - 0.1))`         |

Headline output is a range, not a point:

```
total_loss = baseline_revenue × abandonment
low        = round(bounds.low  × total_loss)
high       = round(min(bounds.high × total_loss, baseline_revenue))
```

Where `bounds` depends on the selected "Estimate style":

| Mode         | bounds.low | bounds.high |
| ------------ | ---------- | ----------- |
| Conservative | 0.50       | 0.75        |
| Balanced     | 0.60       | 0.90        |
| Aggressive   | 0.70       | 1.00        |

`total_loss`, the per-metric cap (0.6), and the 0.5 global abandonment cap are
**not** affected by mode — only the published range bounds shift.

## Reason

The original V2 lock used pure multiplicative survival with aggressive curves
and no aggregate cap. That produced single values like "89% of revenue lost"
which are not believable and undermined trust in the product. The defensible
build keeps the same engine surface but bounds, dampens, and ranges the output
so estimates are decision-grade rather than alarmist.

## Replaces

- Pure multiplicative survival without per-metric or aggregate caps
- Single point output (`Estimated revenue at risk: $X`)
- 0.75 / 1.0 / 1.25 sensitivity multiplier on the headline number
- 33%/34% fabricated stage fallback in the Workspace
- Mismatched TBT units across the two engines (1.0s vs 300ms)

## Rule

This model MUST NOT be changed unless:
- Explicit override is requested, OR
- Real-world data calibration replaces the heuristic coefficients

When changing it, update `lib/impactEngine/v2BehaviorModel.ts` AND
`docs/REVENUE_MODEL_AUDIT.md` in the same PR.

---

# DECISION: Documentation and AI context standards

## Status: ACTIVE

## Date: 2026-04-18

## Decision

The repository maintains a **small set of canonical docs** so humans and AI tools share the same map of the product:

- `README.md` — entry point, scripts, env, links.
- `docs/FEATURE_REGISTRY.md` — where logic lives.
- `docs/SYSTEM_STATE.md` — shipped vs partial vs issues.
- `docs/DECISION_LOG.md` — locked decisions.
- `docs/ONBOARDING.md` — layout and flows.
- `docs/DOCUMENTATION_MAINTENANCE.md` — when to update the above.
- `docs/AI_PROMPT_TEMPLATE.md` — prompt patterns for AI-assisted work.
- `AGENTS.md` — agent-oriented conventions.

Non-trivial PRs should update registry/state when behavior or paths change; see `.github/pull_request_template.md`.

## Reason

Reduces drift between code and narrative, and raises “effective context” for future sessions without loading the entire repo.

## Rule

These files should stay accurate; if a PR changes behavior or file locations, **update the registry or state doc in the same PR** unless the change is trivial (typo-only, comment-only).
