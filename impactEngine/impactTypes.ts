export type ConfidenceLevel = "low" | "moderate" | "high";
export type SensitivityLevel = "high" | "medium" | "low";

export type PerformanceSnapshotLike = {
  id?: string;
  overallHealth?: number | null;
  lcp?: number | null;
  inp?: number | null;
  ttfb?: number | null;
  cls?: number | null;
  tbt?: number | null;
  /** Lab TTI in seconds (Lighthouse interactive audit). */
  tti?: number | null;
  timestamp?: string | Date;
};

export type BusinessInputs = {
  monthlyRevenue: number;
  mobileTrafficPercent?: number;
  conversionRate?: number;
  industry?: string;
  [key: string]: unknown;
};

export type CompetitorPerformanceLike = {
  overallHealth?: number | null;
  lcp?: number | null;
  inp?: number | null;
  ttfb?: number | null;
  cls?: number | null;
  tbt?: number | null;
  tti?: number | null;
};

export type OpportunityRange = { low: number; expected: number; high: number };

export type ImpactDriver = {
  metric: string;
  stage?: string;
  influence: SensitivityLevel;
  description: string;
};

export type CompetitorDelta = {
  narrative: string;
  relativePosition: "behind" | "on par" | "ahead";
  opportunityAdjustment: "widen" | "neutral" | "narrow";
};

export type ImpactEngineOutput = {
  modelVersion: string;
  businessModel: string;
  baselineRevenue: number;
  optimizedRevenueRange: OpportunityRange;
  opportunityRange: OpportunityRange;
  primaryDrivers: ImpactDriver[];
  competitorDelta?: CompetitorDelta;
  confidenceLevel: ConfidenceLevel;
  sensitivityModeUsed?: string;
  executiveExplanation?: string;
  strategicRecommendation?: string;
  confidenceExplanation?: string;
  suggestedBusinessModel?: string;
};

export type HistoricalImpactRecord = {
  snapshotId: string;
  opportunityRange: OpportunityRange;
  timestamp: string;
  baselineRevenue: number;
};

export type BusinessModelDefinition = {
  id: string;
  requiredInputs: string[];
  funnelTemplateId: string;
  sensitivityProfileId: string;
};

export type FunnelStage = { stage: string; weight: number };
