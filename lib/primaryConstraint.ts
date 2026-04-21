/**
 * Builds primary-constraint presentation input from stored analyze JSON.
 */

import type { MetricSeverity } from "@/lib/revenueStageDistribution";
import {
  computeStageMetricWeights,
  revenueStageSnapshotFromAnalyzeData,
  snapshotAxisSeverities,
} from "@/lib/revenueStageDistribution";
import { dominantStageFromImpacts } from "@/lib/systemDiagnosis";
import type { DiagnosisBand } from "@/lib/systemDiagnosisPresentation";
import type { PrimaryConstraintPresentationInput } from "@/lib/primaryConstraintPresentation";
import { presentPrimaryConstraint } from "@/lib/primaryConstraintPresentation";

export type { PrimaryConstraintPresentationInput } from "@/lib/primaryConstraintPresentation";
export { presentPrimaryConstraint, strongestConstraintAxis } from "@/lib/primaryConstraintPresentation";

function bandFromMetricSeverity(s: MetricSeverity): DiagnosisBand {
  if (s === "bad") return "high";
  if (s === "medium") return "medium";
  if (s === "good") return "low";
  return "medium";
}

export function buildPrimaryConstraintPresentationInputFromAnalyzeData(data: {
  revenueImpactInputs?: { lcpSeconds?: number; cls?: number; inpMs?: number | null } | null;
  detailed_metrics?: Record<string, unknown> | null;
}): PrimaryConstraintPresentationInput {
  const snapshot = revenueStageSnapshotFromAnalyzeData(data);
  const w = computeStageMetricWeights(snapshot);
  const axes = snapshotAxisSeverities(snapshot);

  const landing = w.landing;
  const interaction = w.interaction;
  const conversion = w.conversion;
  const dominantStage = dominantStageFromImpacts(landing, interaction, conversion);

  return {
    dominantStage,
    severity: {
      speed: bandFromMetricSeverity(axes.speed),
      interaction: bandFromMetricSeverity(axes.interaction),
      stability: bandFromMetricSeverity(axes.stability),
    },
    impactWeights: {
      landing,
      interaction,
      conversion,
    },
  };
}
