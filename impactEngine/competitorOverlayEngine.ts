/**
 * Competitor overlay engine — deterministic comparison and opportunity adjustment.
 */

import type {
  PerformanceSnapshotLike,
  CompetitorPerformanceLike,
  OpportunityRange,
  CompetitorDelta,
} from "./impactTypes";

function relativePosition(
  snapshot: PerformanceSnapshotLike,
  competitor: CompetitorPerformanceLike
): "behind" | "on par" | "ahead" {
  const healthCur = snapshot.overallHealth ?? 0;
  const healthComp = competitor.overallHealth ?? 0;
  const healthDiff = healthCur - healthComp;
  if (healthDiff > 15) return "ahead";
  if (healthDiff < -15) return "behind";
  return "on par";
}

function buildNarrative(position: "behind" | "on par" | "ahead"): string {
  switch (position) {
    case "behind":
      return "Competitor performance is stronger; closing the gap could widen your opportunity range.";
    case "ahead":
      return "Your performance leads; maintaining it helps protect revenue opportunity.";
    default:
      return "Performance is in line with competitor; optimization can still capture upside.";
  }
}

function adjustRange(
  range: OpportunityRange,
  adjustment: "widen" | "neutral" | "narrow"
): OpportunityRange {
  if (adjustment === "neutral") return range;
  const f = adjustment === "widen" ? 1.15 : 0.88;
  return {
    low: Math.round(range.low * f),
    expected: Math.round(range.expected * f),
    high: Math.round(range.high * f),
  };
}

export type CompetitorOverlayInput = {
  performanceSnapshot: PerformanceSnapshotLike;
  competitorPerformance: CompetitorPerformanceLike;
  opportunityRange: OpportunityRange;
};

export type CompetitorOverlayResult = {
  opportunityRange: OpportunityRange;
  competitorDelta: CompetitorDelta;
};

export function runCompetitorOverlay(input: CompetitorOverlayInput): CompetitorOverlayResult {
  const { performanceSnapshot, competitorPerformance, opportunityRange } = input;
  const position = relativePosition(performanceSnapshot, competitorPerformance);
  const narrative = buildNarrative(position);
  let opportunityAdjustment: "widen" | "neutral" | "narrow" = "neutral";
  if (position === "behind") opportunityAdjustment = "widen";
  if (position === "ahead") opportunityAdjustment = "narrow";
  const adjustedRange = adjustRange(opportunityRange, opportunityAdjustment);
  return {
    opportunityRange: adjustedRange,
    competitorDelta: { narrative, relativePosition: position, opportunityAdjustment },
  };
}
