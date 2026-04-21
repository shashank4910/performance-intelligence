/**
 * Versioned sensitivity model — qualitative mapping only (high/medium/low).
 * Numeric mapping lives inside revenueProjectionEngine only.
 */

/** Metric sensitivity per stage: metric name -> high | medium | low */
export type StageSensitivity = Record<string, "high" | "medium" | "low">;

/** Profile: stage name -> StageSensitivity */
export type SensitivityProfile = Record<string, StageSensitivity>;

export const sensitivityModel_v1 = {
  version: "1.0",
  profiles: {
    ecommerce: {
      Landing: { LCP: "high", TTI: "medium", CLS: "medium" },
      Product: { LCP: "medium", TTI: "medium", CLS: "medium" },
      Checkout: { LCP: "low", TTI: "high", CLS: "high" },
    },
    saas: {
      Landing: { LCP: "medium", TTI: "high", MainThread: "high" },
      Signup: { TTI: "high", MainThread: "high" },
      Activation: { TTI: "high", MainThread: "high" },
    },
    leadgen: {
      Landing: { LCP: "high", TTI: "medium" },
      Form: { TTI: "high", CLS: "high" },
      Submit: { TTI: "high", CLS: "high" },
    },
    aiTool: {
      Landing: { LCP: "medium", TTI: "high" },
      Try: { TTI: "high", MainThread: "high" },
      Convert: { TTI: "high", MainThread: "high" },
    },
    media: {
      Landing: { LCP: "high", TTI: "medium" },
      Engagement: { LCP: "medium", TTI: "medium" },
      Monetization: { TTI: "medium", CLS: "medium" },
    },
  } as Record<string, SensitivityProfile>,
};

export function getSensitivityProfile(profileId: string): SensitivityProfile | undefined {
  return sensitivityModel_v1.profiles[profileId];
}
