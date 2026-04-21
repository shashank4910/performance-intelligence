/**
 * Business model registry — supported models and their configuration.
 */

import type { BusinessModelDefinition } from "./impactTypes";

export const businessModelRegistry: Record<string, BusinessModelDefinition> = {
  ecommerce: {
    id: "ecommerce",
    requiredInputs: ["monthlyRevenue"],
    funnelTemplateId: "ecommerce",
    sensitivityProfileId: "ecommerce",
  },
  saas: {
    id: "saas",
    requiredInputs: ["monthlyRevenue"],
    funnelTemplateId: "saas",
    sensitivityProfileId: "saas",
  },
  leadgen: {
    id: "leadgen",
    requiredInputs: ["monthlyRevenue"],
    funnelTemplateId: "leadgen",
    sensitivityProfileId: "leadgen",
  },
  aiTool: {
    id: "aiTool",
    requiredInputs: ["monthlyRevenue"],
    funnelTemplateId: "aiTool",
    sensitivityProfileId: "aiTool",
  },
  media: {
    id: "media",
    requiredInputs: ["monthlyRevenue"],
    funnelTemplateId: "media",
    sensitivityProfileId: "media",
  },
};

export function getBusinessModel(id: string): BusinessModelDefinition | undefined {
  return businessModelRegistry[id];
}

export function listBusinessModelIds(): string[] {
  return Object.keys(businessModelRegistry);
}
