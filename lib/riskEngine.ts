/**
 * Metrics from Lighthouse/PageSpeed used for risk scoring.
 * All time values in milliseconds unless noted.
 */
export interface LighthouseMetrics {
  lcp: number;
  cls: number;
  inp: number;
  tbt: number;
  fcp: number;
  speedIndex: number;
  domSize: number;
  mainThreadWork: number;
}

/** Clamp a value to 0–100 and round to integer. */
function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Map value to risk 0–100: 0 at/below low, 100 at/above high, linear in between. */
function linearRisk(value: number, low: number, high: number): number {
  if (value <= low) return 0;
  if (value >= high) return 100;
  return ((value - low) / (high - low)) * 100;
}

/**
 * Speed risk (0–100). Increases with:
 * - LCP > 2500ms
 * - TBT > 300ms
 * - Speed Index > 3000ms
 */
export function calculateSpeedRisk(metrics: LighthouseMetrics): number {
  const lcpRisk = linearRisk(metrics.lcp, 2500, 5000);
  const tbtRisk = linearRisk(metrics.tbt, 300, 600);
  const speedIndexRisk = linearRisk(metrics.speedIndex, 3000, 6000);
  const combined = (lcpRisk * 0.4 + tbtRisk * 0.35 + speedIndexRisk * 0.25);
  return clampScore(combined);
}

/**
 * UX risk (0–100). Increases with:
 * - CLS > 0.1
 * - INP > 200ms
 * - TBT high
 */
export function calculateUxRisk(metrics: LighthouseMetrics): number {
  const clsRisk = linearRisk(metrics.cls, 0.1, 0.25);
  const inpRisk = linearRisk(metrics.inp, 200, 500);
  const tbtRisk = linearRisk(metrics.tbt, 300, 600);
  const combined = (clsRisk * 0.4 + inpRisk * 0.35 + tbtRisk * 0.25);
  return clampScore(combined);
}

/**
 * SEO risk (0–100). Increases with:
 * - LCP severe (mobile/core vitals)
 * - FCP / Speed Index as proxy for mobile performance
 */
export function calculateSeoRisk(metrics: LighthouseMetrics): number {
  const lcpRisk = linearRisk(metrics.lcp, 2500, 5000);
  const fcpRisk = linearRisk(metrics.fcp, 1800, 3000);
  const speedIndexRisk = linearRisk(metrics.speedIndex, 3000, 6000);
  const combined = (lcpRisk * 0.5 + fcpRisk * 0.25 + speedIndexRisk * 0.25);
  return clampScore(combined);
}

/**
 * Conversion risk (0–100). Increases with:
 * - LCP slow
 * - INP slow
 * - TBT high
 */
export function calculateConversionRisk(metrics: LighthouseMetrics): number {
  const lcpRisk = linearRisk(metrics.lcp, 2500, 5000);
  const inpRisk = linearRisk(metrics.inp, 200, 500);
  const tbtRisk = linearRisk(metrics.tbt, 300, 600);
  const combined = (lcpRisk * 0.35 + inpRisk * 0.35 + tbtRisk * 0.3);
  return clampScore(combined);
}

/**
 * Scaling risk (0–100). Increases with:
 * - DOM size large
 * - Main thread work heavy
 * - TBT high
 */
export function calculateScalingRisk(metrics: LighthouseMetrics): number {
  const domRisk = linearRisk(metrics.domSize, 1500, 3000);
  const mainThreadRisk = linearRisk(metrics.mainThreadWork, 3000, 6000);
  const tbtRisk = linearRisk(metrics.tbt, 300, 600);
  const combined = (domRisk * 0.35 + mainThreadRisk * 0.35 + tbtRisk * 0.3);
  return clampScore(combined);
}

/** Weights for overall health: speed 30%, ux 25%, seo 15%, conversion 20%, scaling 10%. */
const HEALTH_WEIGHTS = {
  speed: 0.3,
  ux: 0.25,
  seo: 0.15,
  conversion: 0.2,
  scaling: 0.1,
} as const;

/**
 * Overall health score (0–100). 100 = healthy.
 * Formula: 100 - weighted average of risk scores.
 */
export function calculateOverallHealth(
  speedRisk: number,
  uxRisk: number,
  seoRisk: number,
  conversionRisk: number,
  scalingRisk: number
): number {
  const weightedRisk =
    speedRisk * HEALTH_WEIGHTS.speed +
    uxRisk * HEALTH_WEIGHTS.ux +
    seoRisk * HEALTH_WEIGHTS.seo +
    conversionRisk * HEALTH_WEIGHTS.conversion +
    scalingRisk * HEALTH_WEIGHTS.scaling;
  return clampScore(100 - weightedRisk);
}

/**
 * Compute all risk scores and overall health from Lighthouse metrics.
 */
export function computeAllScores(metrics: LighthouseMetrics) {
  const speedRisk = calculateSpeedRisk(metrics);
  const uxRisk = calculateUxRisk(metrics);
  const seoRisk = calculateSeoRisk(metrics);
  const conversionRisk = calculateConversionRisk(metrics);
  const scalingRisk = calculateScalingRisk(metrics);
  const overallHealth = calculateOverallHealth(
    speedRisk,
    uxRisk,
    seoRisk,
    conversionRisk,
    scalingRisk
  );
  return {
    speedRisk,
    uxRisk,
    seoRisk,
    conversionRisk,
    scalingRisk,
    overallHealth,
  };
}

/** Risk level label from score: 0–39 Low, 40–69 Medium, 70–100 High. */
export function getRiskLevel(score: number): "Low" | "Medium" | "High" {
  if (score <= 39) return "Low";
  if (score <= 69) return "Medium";
  return "High";
}
