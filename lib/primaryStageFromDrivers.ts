/**
 * Single source of truth: derive primary stage ONLY from impactEngineResult.primaryDrivers.
 * Group by stage, sum influence weight per stage, highest = primaryStage.
 */

import type { ImpactDriver } from "@/impactEngine/impactTypes";

const INFLUENCE_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Returns the stage with the highest total influence from primaryDrivers.
 * If no drivers or tie, returns first stage in list or "Landing".
 */
export function getPrimaryStageFromDrivers(primaryDrivers: ImpactDriver[]): string {
  if (!primaryDrivers.length) return "Landing";
  const byStage: Record<string, number> = {};
  for (const d of primaryDrivers) {
    const stage = d.stage ?? "Landing";
    const w = INFLUENCE_WEIGHT[d.influence] ?? 1;
    byStage[stage] = (byStage[stage] ?? 0) + w;
  }
  let maxStage = "Landing";
  let maxSum = 0;
  for (const [stage, sum] of Object.entries(byStage)) {
    if (sum > maxSum) {
      maxSum = sum;
      maxStage = stage;
    }
  }
  return maxStage;
}

/**
 * Normalized stage contributions from primaryDrivers (0–1 per stage).
 * Keys are stage names; values are fractions that sum to 1.
 */
export function getStageContributionsFromDrivers(primaryDrivers: ImpactDriver[]): { stage: string; percent: number }[] {
  if (!primaryDrivers.length) {
    return [];
  }
  const byStage: Record<string, number> = {};
  for (const d of primaryDrivers) {
    const stage = d.stage ?? "Landing";
    const w = INFLUENCE_WEIGHT[d.influence] ?? 1;
    byStage[stage] = (byStage[stage] ?? 0) + w;
  }
  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return [];
  }
  const rows: { stage: string; percent: number }[] = [];
  for (const [stage, sum] of Object.entries(byStage)) {
    rows.push({ stage, percent: Math.round((sum / total) * 100) });
  }
  rows.sort((a, b) => b.percent - a.percent);
  return rows;
}
