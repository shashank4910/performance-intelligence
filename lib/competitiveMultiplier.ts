/**
 * Optional competitive multiplier for Impact Index.
 * If no competitor data: multiplier = 1. Do not require competitor.
 */

import type { DomainName } from "./impactIndexEngine";

export type CompetitorDomainScores = Partial<Record<DomainName, number>>;

/**
 * CompetitiveGapFactor = YourScore - CompetitorAvgScore
 * If gap < 0: Multiplier = 1 + abs(gap)/100
 * If gap >= 0: Multiplier = 1
 */
export function getCompetitiveMultiplier(
  yourScore: number,
  competitorAvgScore: number | null | undefined
): number {
  if (competitorAvgScore == null || Number.isNaN(competitorAvgScore)) return 1;
  const gap = yourScore - competitorAvgScore;
  if (gap >= 0) return 1;
  return 1 + Math.abs(gap) / 100;
}

/**
 * Apply optional competitive multiplier per domain.
 * FinalImpactIndex = ImpactIndex * Multiplier (when competitor data exists).
 */
export function applyCompetitiveMultiplier(
  impactIndex: Record<DomainName, number>,
  yourScores: Partial<Record<DomainName, number>>,
  competitorScores: CompetitorDomainScores | null | undefined
): Record<DomainName, number> {
  if (!competitorScores || Object.keys(competitorScores).length === 0) {
    return { ...impactIndex };
  }
  const result = { ...impactIndex } as Record<DomainName, number>;
  for (const domain of Object.keys(impactIndex) as DomainName[]) {
    const your = yourScores[domain];
    const comp = competitorScores[domain];
    const mult = getCompetitiveMultiplier(your ?? 0, comp);
    result[domain] = Math.round(Math.min(100, impactIndex[domain] * mult));
  }
  return result;
}
