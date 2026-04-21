/**
 * Revenue Impact Model V2 — Defensible build (April 2026)
 *
 * Earlier V2 was locked but produced extreme outputs (raw multiplicative survival
 * with aggressive curves and no aggregate cap). This build keeps the same shape
 * (per-metric impact + combine + baseline × abandonment) but adds:
 *
 *   1. Per-metric cap     → no single metric can claim more than 60% abandonment
 *   2. Hybrid combination → 50% multiplicative + 50% mean(impact_i)
 *   3. Damping            → final = 1 - (1 - raw)^0.7
 *   4. Global cap         → final abandonment ≤ 50%
 *   5. Softer LCP curve   → inflection 3.2s (was 2.5s)
 *   6. Softer TBT/INP     → coefficients halved
 *
 * Net effect: realistic, bounded estimates that never exceed half of baseline.
 * See /docs/DECISION_LOG.md and /docs/REVENUE_MODEL_AUDIT.md for the change log.
 */

const PER_METRIC_CAP = 0.6;
const GLOBAL_ABANDONMENT_CAP = 0.5;
const DAMPING_EXPONENT = 0.7;
const HYBRID_WEIGHT_MULTIPLICATIVE = 0.5;
const HYBRID_WEIGHT_AVERAGE = 0.5;

export function impactLCP(lcpMs: number): number {
  if (!Number.isFinite(lcpMs) || lcpMs <= 0) return 0;
  const x = lcpMs / 1000;
  return 1 / (1 + Math.exp(-0.8 * (x - 3.2)));
}

export function impactTBT(tbtMs: number): number {
  if (!Number.isFinite(tbtMs) || tbtMs <= 0) return 0;
  const delay = Math.max(0, tbtMs - 300);
  return 1 - Math.exp(-0.002 * delay);
}

export function impactINP(inpMs: number): number {
  if (!Number.isFinite(inpMs) || inpMs <= 0) return 0;
  const delay = Math.max(0, inpMs - 200);
  return 1 - Math.exp(-0.0018 * delay);
}

export function impactCLS(cls: number): number {
  if (!Number.isFinite(cls) || cls <= 0) return 0;
  const excess = Math.max(0, cls - 0.1);
  return Math.min(0.15, 2.5 * excess);
}

/** Clamp to [0, PER_METRIC_CAP]. Returns 0 for non-finite input. */
function clampMetric(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  return Math.min(PER_METRIC_CAP, raw);
}

/**
 * Hybrid abandonment combiner with damping and a global cap.
 * Inputs may be unclamped; this fn enforces per-metric cap before combining.
 *
 * Pipeline:
 *   capped_i      = min(impact_i, 0.6)
 *   multiplicative = 1 - Π(1 - capped_i)
 *   average        = mean(capped_i)            // includes zeros
 *   raw            = 0.5 * multiplicative + 0.5 * average
 *   damped         = 1 - (1 - raw)^0.7
 *   final          = min(damped, 0.5)
 */
export function computeAbandonment(impacts: number[]): number {
  const safeImpacts = impacts.map(clampMetric);
  if (safeImpacts.length === 0) return 0;

  let survival = 1;
  for (const impact of safeImpacts) survival *= 1 - impact;
  const multiplicative = 1 - survival;

  const average =
    safeImpacts.reduce((a, b) => a + b, 0) / safeImpacts.length;

  const raw =
    HYBRID_WEIGHT_MULTIPLICATIVE * multiplicative +
    HYBRID_WEIGHT_AVERAGE * average;

  const damped = 1 - Math.pow(Math.max(0, 1 - raw), DAMPING_EXPONENT);
  const final = Math.min(GLOBAL_ABANDONMENT_CAP, Math.max(0, damped));

  return Number.isFinite(final) ? final : 0;
}

export function computeBehaviorRevenueImpact(params: {
  baselineRevenue: number;
  metrics: {
    lcp?: number;
    tbt?: number;
    inp?: number;
    cls?: number;
  };
}): {
  totalLoss: number;
  abandonment: number;
  impacts: { LCP: number; TBT: number; INP: number; CLS: number };
  leakByMetric: Record<string, number>;
} {
  const baselineRevenue = Number.isFinite(params.baselineRevenue) ? Math.max(0, params.baselineRevenue) : 0;
  const metrics = params.metrics ?? {};

  const rawImpacts = {
    LCP: metrics.lcp != null ? impactLCP(metrics.lcp) : 0,
    TBT: metrics.tbt != null ? impactTBT(metrics.tbt) : 0,
    INP: metrics.inp != null ? impactINP(metrics.inp) : 0,
    CLS: metrics.cls != null ? impactCLS(metrics.cls) : 0,
  };

  const impacts = {
    LCP: clampMetric(rawImpacts.LCP),
    TBT: clampMetric(rawImpacts.TBT),
    INP: clampMetric(rawImpacts.INP),
    CLS: clampMetric(rawImpacts.CLS),
  };

  const abandonment = computeAbandonment(Object.values(impacts));

  const totalLossRaw = baselineRevenue * abandonment;
  const totalLoss = Number.isFinite(totalLossRaw) ? Math.round(totalLossRaw * 100) / 100 : 0;

  const totalImpact = Object.values(impacts).reduce((a, b) => a + b, 0) || 1;
  const leakByMetric: Record<string, number> = {};

  for (const key of Object.keys(impacts) as Array<keyof typeof impacts>) {
    const share = impacts[key] / totalImpact;
    const metricLeak = totalLoss * (Number.isFinite(share) ? share : 0);
    leakByMetric[key.toLowerCase()] = Number.isFinite(metricLeak) ? Math.round(metricLeak * 100) / 100 : 0;
  }

  return {
    totalLoss,
    abandonment,
    impacts,
    leakByMetric,
  };
}
