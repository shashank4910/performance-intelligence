/**
 * Funnel template system — stage weights per business model.
 * Weights must sum to 1. Override supported later via API.
 */

import type { FunnelStage } from "./impactTypes";

export type FunnelTemplate = {
  id: string;
  stages: FunnelStage[];
};

const sumWeights = (stages: FunnelStage[]): number =>
  stages.reduce((s, st) => s + st.weight, 0);

function assertWeightsSumToOne(stages: FunnelStage[], id: string): void {
  const sum = sumWeights(stages);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Funnel template "${id}" weights sum to ${sum}, expected 1`);
  }
}

export const funnelTemplates: Record<string, FunnelTemplate> = {
  ecommerce: {
    id: "ecommerce",
    stages: [
      { stage: "Landing", weight: 0.5 },
      { stage: "Product", weight: 0.3 },
      { stage: "Checkout", weight: 0.2 },
    ],
  },
  saas: {
    id: "saas",
    stages: [
      { stage: "Landing", weight: 0.4 },
      { stage: "Signup", weight: 0.4 },
      { stage: "Activation", weight: 0.2 },
    ],
  },
  leadgen: {
    id: "leadgen",
    stages: [
      { stage: "Landing", weight: 0.5 },
      { stage: "Form", weight: 0.35 },
      { stage: "Submit", weight: 0.15 },
    ],
  },
  aiTool: {
    id: "aiTool",
    stages: [
      { stage: "Landing", weight: 0.35 },
      { stage: "Try", weight: 0.4 },
      { stage: "Convert", weight: 0.25 },
    ],
  },
  media: {
    id: "media",
    stages: [
      { stage: "Landing", weight: 0.4 },
      { stage: "Engagement", weight: 0.4 },
      { stage: "Monetization", weight: 0.2 },
    ],
  },
};

// Validate at load
Object.entries(funnelTemplates).forEach(([id, t]) => assertWeightsSumToOne(t.stages, id));

export function getFunnelTemplate(id: string): FunnelTemplate | undefined {
  return funnelTemplates[id];
}
