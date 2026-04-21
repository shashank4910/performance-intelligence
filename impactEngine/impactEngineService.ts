/**
 * Balanced AI-Assisted Funnel-Aware Revenue Impact Engine — service layer.
 * Orchestrates: deterministic projection, competitor overlay, AI assist (narrative only).
 * persistInputs: false = simulation only, do not store businessInputs.
 */

import type {
  PerformanceSnapshotLike,
  BusinessInputs,
  CompetitorPerformanceLike,
  ImpactEngineOutput,
  HistoricalImpactRecord,
  ConfidenceLevel,
} from "./impactTypes";
import { getBusinessModel } from "./businessModelRegistry";
import { sensitivityModel_v1 } from "./sensitivityModels";
import { runRevenueProjection } from "./revenueProjectionEngine";
import { runCompetitorOverlay } from "./competitorOverlayEngine";

export type SensitivityMode = "conservative" | "balanced" | "aggressive";

export type ImpactEngineServiceInput = {
  performanceSnapshot: PerformanceSnapshotLike;
  businessInputs: BusinessInputs;
  businessModelId: string;
  sensitivityMode?: SensitivityMode;
  competitorPerformance?: CompetitorPerformanceLike | null;
  /** If false, run in memory only; do not persist businessInputs. */
  persistInputs?: boolean;
};

export type ImpactEngineServiceResult = ImpactEngineOutput & {
  /** For historical trend charting. */
  historicalRecord?: HistoricalImpactRecord;
};

/**
 * Run the full impact engine: projection, optional competitor overlay.
 * AI assist (explanation, recommendation, confidence narrative, model suggestion)
 * is not invoked here — callers can call optional AI helpers separately with this result.
 */
export function runImpactEngine(input: ImpactEngineServiceInput): ImpactEngineServiceResult {
  const {
    performanceSnapshot,
    businessInputs,
    businessModelId,
    sensitivityMode = "balanced",
    competitorPerformance,
    persistInputs = false,
  } = input;

  const model = getBusinessModel(businessModelId);
  const modelVersion = sensitivityModel_v1.version;
  const businessModel = model?.id ?? businessModelId;

  const projection = runRevenueProjection({
    performanceSnapshot,
    businessInputs,
    businessModelId: model ? businessModelId : "ecommerce",
    sensitivityMode,
  });

  let opportunityRange = projection.opportunityRange;
  let competitorDelta = undefined;
  if (competitorPerformance && (competitorPerformance.overallHealth != null || competitorPerformance.lcp != null)) {
    const overlay = runCompetitorOverlay({
      performanceSnapshot,
      competitorPerformance,
      opportunityRange: projection.opportunityRange,
    });
    opportunityRange = overlay.opportunityRange;
    competitorDelta = overlay.competitorDelta;
  }

  const output: ImpactEngineOutput = {
    modelVersion,
    businessModel,
    baselineRevenue: projection.baselineRevenue,
    optimizedRevenueRange: projection.optimizedRevenueRange,
    opportunityRange,
    primaryDrivers: projection.primaryDrivers,
    competitorDelta,
    confidenceLevel: projection.confidenceLevel,
    sensitivityModeUsed: projection.sensitivityModeUsed,
  };

  const result: ImpactEngineServiceResult = { ...output };
  if (performanceSnapshot.id) {
    result.historicalRecord = {
      snapshotId: performanceSnapshot.id,
      opportunityRange,
      timestamp: performanceSnapshot.timestamp
        ? new Date(performanceSnapshot.timestamp).toISOString()
        : new Date().toISOString(),
      baselineRevenue: projection.baselineRevenue,
    };
  }

  return result;
}

/**
 * Stub for AI-assisted business model suggestion.
 * Call from API with OpenAI when needed; do not use for revenue math.
 */
export async function suggestBusinessModel(
  _industryHint?: string,
  _performanceSnapshot?: PerformanceSnapshotLike
): Promise<string | undefined> {
  return undefined;
}

/**
 * Stub for AI executive explanation.
 * AI must NOT calculate revenue or override deterministic math.
 */
export async function generateExecutiveExplanation(
  _result: ImpactEngineOutput
): Promise<string | undefined> {
  return undefined;
}

/**
 * Stub for AI strategic recommendation.
 */
export async function generateStrategicRecommendation(
  _result: ImpactEngineOutput
): Promise<string | undefined> {
  return undefined;
}

/**
 * Stub for AI confidence explanation.
 */
export async function generateConfidenceExplanation(
  _confidenceLevel: ConfidenceLevel,
  _result: ImpactEngineOutput
): Promise<string | undefined> {
  return undefined;
}
