/**
 * Sensitivity-mode math for Revenue Impact — shared by the workspace UI,
 * persistence path in runSimulation, and tests. Do not change formulas here
 * without updating docs/REVENUE_MODEL_AUDIT alignment.
 */

export type SensitivityMode = "conservative" | "balanced" | "aggressive";

/**
 * Estimate style adjusts the *displayed range bounds* only — never the underlying
 * bounded loss from the V2 behavior model.
 */
export const RANGE_BOUNDS_BY_MODE: Record<SensitivityMode, { low: number; high: number }> = {
  conservative: { low: 0.5, high: 0.75 },
  balanced: { low: 0.6, high: 0.9 },
  aggressive: { low: 0.7, high: 1.0 },
};

/** Mode-aware recovery factors (presentation layer only). */
export const RECOVERY_FACTORS: Record<SensitivityMode, { min: number; max: number; avg: number }> = {
  conservative: { min: 0.5, max: 0.6, avg: 0.55 },
  balanced: { min: 0.6, max: 0.75, avg: 0.675 },
  aggressive: { min: 0.75, max: 0.9, avg: 0.825 },
};

export type RevenueModel = {
  baselineRevenue: number;
  totalLoss: number;
  recoverableLow: number;
  recoverableHigh: number;
  currentRevenue: number;
  projectedLow: number;
  projectedHigh: number;
};

/**
 * Validates and auto-corrects revenue model so invariants hold.
 * INVARIANT GUARANTEE:
 * currentRevenue ≤ projectedRevenue ≤ baselineRevenue
 */
export function validateRevenueModel(model: RevenueModel): RevenueModel {
  const { baselineRevenue, totalLoss, currentRevenue } = model;
  let { recoverableLow, recoverableHigh, projectedLow, projectedHigh } = model;

  if (recoverableHigh > totalLoss) recoverableHigh = totalLoss;
  if (recoverableLow > recoverableHigh) recoverableLow = recoverableHigh * 0.8;

  projectedLow = currentRevenue + recoverableLow;
  projectedHigh = currentRevenue + recoverableHigh;

  if (projectedHigh > baselineRevenue) projectedHigh = baselineRevenue;
  if (projectedLow > projectedHigh) projectedLow = projectedHigh * 0.9;
  if (projectedLow < currentRevenue) projectedLow = currentRevenue;

  return {
    baselineRevenue,
    totalLoss,
    recoverableLow,
    recoverableHigh,
    currentRevenue,
    projectedLow,
    projectedHigh,
  };
}

/** Opportunity low/high from headline loss and mode (matches workspace display). */
export function opportunityBoundsFromLoss(
  totalLoss: number,
  baselineRevenue: number,
  mode: SensitivityMode
): { opportunityLow: number; opportunityHigh: number } {
  const safeBaseline = Math.max(0, baselineRevenue);
  const rangeBounds = RANGE_BOUNDS_BY_MODE[mode];
  const opportunityLow = Math.max(0, Math.round(totalLoss * rangeBounds.low));
  const opportunityHigh = Math.max(
    opportunityLow,
    Math.min(Math.round(totalLoss * rangeBounds.high), safeBaseline)
  );
  return { opportunityLow, opportunityHigh };
}

/** Same as PATCH payload in runSimulation after a run. */
export function persistedOpportunityRange(
  estimatedMonthlyLeak: number,
  baselineRevenue: number,
  mode: SensitivityMode
): { low: number; expected: number; high: number } {
  const safeBaseline = Math.max(0, baselineRevenue);
  const bounds = RANGE_BOUNDS_BY_MODE[mode];
  const rangeLow = Math.round(Math.max(0, estimatedMonthlyLeak * bounds.low));
  const rangeHigh = Math.round(Math.min(estimatedMonthlyLeak * bounds.high, safeBaseline));
  return {
    low: rangeLow,
    expected: Math.round(estimatedMonthlyLeak),
    high: Math.max(rangeLow, rangeHigh),
  };
}
