/**
 * Revenue & Conversion Impact Engine
 * Boardroom-ready estimates. All calculations are pure functions.
 * Penalties capped realistically; no exaggeration.
 */

export type FunnelRiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type FunnelRisk = {
  awarenessStageRisk: FunnelRiskLevel;
  interactionStageRisk: FunnelRiskLevel;
  checkoutStageRisk: FunnelRiskLevel;
};

export type RevenueImpactInputs = {
  /** LCP in seconds */
  lcpSeconds: number;
  /** INP in milliseconds */
  inpMs: number | null;
  /** TTFB in milliseconds */
  ttfbMs: number | null;
  /** Overall health 0–100 */
  overallHealth: number;
  /** Monthly revenue (currency units) */
  monthlyRevenue: number;
  /** Mobile traffic share 0–100. Applied to weight impact. */
  mobileTrafficPercent?: number;
  /** Optional conversion rate 0–1 (e.g. 0.02 = 2%). Default 0.02 */
  conversionRate?: number;
  /** Optional competitor health 0–100 for future use */
  competitorHealth?: number | null;
};

const CONVERSION_IMPACT_CAP = 0.35;

/**
 * Estimated revenue loss due to speed (research-backed correlation).
 * Google: ~8–12% conversion drop per +1s LCP. Model: base penalty + bounce penalty, cap 35%.
 */
export function estimateRevenueLossDueToSpeed(
  lcpSeconds: number,
  monthlyRevenue: number,
  conversionRate: number = 0.02
): {
  estimatedRevenueLoss: number;
  estimatedConversionDrop: number;
  revenueLossPercentage: number;
  conversionImpactFactor: number;
} {
  const baseSpeedPenalty = Math.max(0, (lcpSeconds - 2.5)) * 0.1;
  let bouncePenalty = 0;
  if (lcpSeconds > 5) bouncePenalty = 0.25;
  else if (lcpSeconds > 4) bouncePenalty = 0.15;

  let conversionImpactFactor = baseSpeedPenalty + bouncePenalty;
  conversionImpactFactor = Math.min(CONVERSION_IMPACT_CAP, conversionImpactFactor);

  const estimatedRevenueLoss = monthlyRevenue * conversionImpactFactor;
  const estimatedConversionDrop = conversionRate * conversionImpactFactor;
  const revenueLossPercentage = conversionImpactFactor * 100;

  return {
    estimatedRevenueLoss: Math.round(estimatedRevenueLoss),
    estimatedConversionDrop,
    revenueLossPercentage,
    conversionImpactFactor,
  };
}

/**
 * Bounce risk from LCP (simplified model: LCP/5 * 100, cap 100).
 */
export function computeBounceRisk(lcpSeconds: number): {
  bounceRiskScore: number;
  bounceSeverity: "Low" | "Moderate" | "High" | "Critical";
} {
  const bounceRiskScore = Math.min(100, Math.max(0, (lcpSeconds / 5) * 100));
  const bounceSeverity =
    bounceRiskScore >= 75 ? "Critical" : bounceRiskScore >= 50 ? "High" : bounceRiskScore >= 25 ? "Moderate" : "Low";
  return { bounceRiskScore: Math.round(bounceRiskScore), bounceSeverity };
}

/**
 * Funnel stage risks from TTFB and INP.
 */
export function computeFunnelRisk(ttfbMs: number | null, inpMs: number | null): FunnelRisk {
  const awarenessStageRisk: FunnelRiskLevel =
    ttfbMs != null && ttfbMs > 800 ? "High" : ttfbMs != null && ttfbMs > 500 ? "Moderate" : "Low";
  const interactionStageRisk: FunnelRiskLevel =
    inpMs != null && inpMs > 300 ? "High" : inpMs != null && inpMs > 200 ? "Moderate" : "Low";
  const checkoutStageRisk: FunnelRiskLevel =
    inpMs != null && inpMs > 300 ? "High" : inpMs != null && inpMs > 200 ? "Moderate" : "Low";
  return {
    awarenessStageRisk,
    interactionStageRisk,
    checkoutStageRisk,
  };
}

/**
 * Checkout friction: High INP + high interaction risk → score 0–100.
 */
export function computeCheckoutFrictionScore(inpMs: number | null, _tbtMs: number | null): number {
  if (inpMs == null) return 0;
  if (inpMs > 500) return Math.min(100, 60 + (inpMs - 500) / 10);
  if (inpMs > 300) return Math.min(100, 40 + (inpMs - 300) / 10);
  if (inpMs > 200) return Math.min(100, 20 + (inpMs - 200) / 10);
  return Math.min(100, (inpMs / 200) * 20);
}

/**
 * Page revenue sensitivity from overall health. Higher sensitivity when health is low.
 */
export function computePageRevenueSensitivity(overallHealth: number): number {
  return Math.min(100, Math.max(0, (100 - overallHealth) * 0.8));
}

/**
 * Build executive summary (template-based, boardroom tone). Max 5 sentences.
 */
export function buildExecutiveSummary(
  estimatedRevenueLoss: number,
  revenueLossPercentage: number,
  bounceSeverity: string,
  primaryDriver: string
): string {
  const parts: string[] = [];
  if (estimatedRevenueLoss > 0) {
    parts.push(
      `Your current performance levels may be reducing monthly revenue by approximately $${estimatedRevenueLoss.toLocaleString()}.`
    );
  }
  parts.push(`The primary driver is ${primaryDriver}.`);
  if (bounceSeverity !== "Low") {
    parts.push(`Bounce risk is ${bounceSeverity.toLowerCase()}, particularly on mobile.`);
  }
  if (revenueLossPercentage > 0) {
    parts.push(
      `Addressing loading speed and interaction responsiveness could recover an estimated ${Math.round(revenueLossPercentage)}% of at-risk revenue.`
    );
  }
  return parts.slice(0, 5).join(" ");
}

/**
 * Main engine: compute full revenue & conversion impact output.
 */
export function computeRevenueConversionImpact(inputs: RevenueImpactInputs): {
  estimatedRevenueLoss: number;
  revenueLossPercentage: number;
  estimatedConversionDrop: number;
  conversionImpactFactor: number;
  bounceRiskScore: number;
  bounceSeverity: "Low" | "Moderate" | "High" | "Critical";
  funnelRisk: FunnelRisk;
  checkoutFrictionScore: number;
  pageRevenueSensitivityScore: number;
  executiveSummary: string;
} {
  const {
    lcpSeconds,
    inpMs,
    ttfbMs,
    overallHealth,
    monthlyRevenue,
    mobileTrafficPercent = 100,
    conversionRate = 0.02,
  } = inputs;

  const mobileWeight = Math.min(100, Math.max(0, mobileTrafficPercent)) / 100;

  const revenueResult =
    monthlyRevenue > 0
      ? estimateRevenueLossDueToSpeed(lcpSeconds, monthlyRevenue * mobileWeight, conversionRate)
      : {
          estimatedRevenueLoss: 0,
          estimatedConversionDrop: 0,
          revenueLossPercentage: 0,
          conversionImpactFactor: 0,
        };

  const { bounceRiskScore, bounceSeverity } = computeBounceRisk(lcpSeconds);
  const funnelRisk = computeFunnelRisk(ttfbMs, inpMs);
  const checkoutFrictionScore = Math.round(computeCheckoutFrictionScore(inpMs, null));
  const pageRevenueSensitivityScore = Math.round(computePageRevenueSensitivity(overallHealth));

  const primaryDriver =
    lcpSeconds > 3 ? "delayed content loading (LCP)" : inpMs != null && inpMs > 200 ? "interaction latency (INP)" : "loading and interaction delay";

  const executiveSummary = buildExecutiveSummary(
    revenueResult.estimatedRevenueLoss,
    revenueResult.revenueLossPercentage,
    bounceSeverity,
    primaryDriver
  );

  return {
    estimatedRevenueLoss: revenueResult.estimatedRevenueLoss,
    revenueLossPercentage: revenueResult.revenueLossPercentage,
    estimatedConversionDrop: revenueResult.estimatedConversionDrop,
    conversionImpactFactor: revenueResult.conversionImpactFactor,
    bounceRiskScore,
    bounceSeverity,
    funnelRisk,
    checkoutFrictionScore,
    pageRevenueSensitivityScore,
    executiveSummary,
  };
}
