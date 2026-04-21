/**
 * Balanced AI-Assisted Funnel-Aware Revenue Impact Engine — public API.
 */

export { runImpactEngine, suggestBusinessModel, generateExecutiveExplanation, generateStrategicRecommendation, generateConfidenceExplanation } from "./impactEngineService";
export type { ImpactEngineServiceInput, ImpactEngineServiceResult } from "./impactEngineService";
export { runRevenueProjection } from "./revenueProjectionEngine";
export type { RevenueProjectionInput, RevenueProjectionResult } from "./revenueProjectionEngine";
export { runCompetitorOverlay } from "./competitorOverlayEngine";
export type { CompetitorOverlayInput, CompetitorOverlayResult } from "./competitorOverlayEngine";
export { businessModelRegistry, getBusinessModel, listBusinessModelIds } from "./businessModelRegistry";
export { getFunnelTemplate, funnelTemplates } from "./funnelTemplates";
export type { FunnelTemplate } from "./funnelTemplates";
export { sensitivityModel_v1, getSensitivityProfile } from "./sensitivityModels";
export type { StageSensitivity, SensitivityProfile } from "./sensitivityModels";
export type {
  PerformanceSnapshotLike,
  BusinessInputs,
  CompetitorPerformanceLike,
  OpportunityRange,
  ImpactDriver,
  CompetitorDelta,
  ImpactEngineOutput,
  HistoricalImpactRecord,
  BusinessModelDefinition,
  FunnelStage,
  ConfidenceLevel,
  SensitivityLevel,
} from "./impactTypes";
