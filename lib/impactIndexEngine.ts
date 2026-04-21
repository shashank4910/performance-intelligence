/**
 * Deterministic Impact Index per domain. Separate from risk scoring.
 * Do not modify original risk scores.
 */

export const DOMAIN_NAMES = ["Speed", "UX", "SEO", "Conversion", "Scaling"] as const;
export type DomainName = (typeof DOMAIN_NAMES)[number];

export type DomainScores = {
  Speed?: number;
  UX?: number;
  SEO?: number;
  Conversion?: number;
  Scaling?: number;
};

/** How strongly each domain affects LCP, CLS, INP, TTFB (0–1). */
const CORE_WEB_VITAL_INFLUENCE: Record<DomainName, { lcp: number; cls: number; inp: number; ttfb: number }> = {
  Speed: { lcp: 0.35, cls: 0.05, inp: 0.1, ttfb: 0.5 },
  UX: { lcp: 0.1, cls: 0.5, inp: 0.4, ttfb: 0.0 },
  SEO: { lcp: 0.4, cls: 0.2, inp: 0.1, ttfb: 0.3 },
  Conversion: { lcp: 0.3, cls: 0.2, inp: 0.35, ttfb: 0.15 },
  Scaling: { lcp: 0.1, cls: 0.05, inp: 0.05, ttfb: 0.8 },
};

/** User perception: above-the-fold / interaction-sensitive (0–1). */
const USER_PERCEPTION_WEIGHT: Record<DomainName, number> = {
  Speed: 0.95,
  UX: 0.9,
  SEO: 0.7,
  Conversion: 0.85,
  Scaling: 0.5,
};

/** Fix leverage: improving this domain improves multiple metrics (0–1). */
const FIX_LEVERAGE_WEIGHT: Record<DomainName, number> = {
  Speed: 0.9,
  UX: 0.85,
  SEO: 0.6,
  Conversion: 0.8,
  Scaling: 0.7,
};

function normalizeScore(score: number | undefined): number {
  if (score == null || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score)) / 100;
}

/** CoreWebVitalInfluence as single 0–1 value (average of CWV dimensions). */
function getCoreWebVitalInfluence(domain: DomainName): number {
  const w = CORE_WEB_VITAL_INFLUENCE[domain];
  return (w.lcp + w.cls + w.inp + w.ttfb) / 4;
}

/**
 * Compute Impact Index per domain (0–100).
 * ImpactIndex = SeverityWeight*0.40 + CoreWebVitalInfluence*0.30 + UserPerceptionWeight*0.20 + FixLeverageWeight*0.10
 */
export function computeImpactIndex(scores: DomainScores): Record<DomainName, number> {
  const result = {} as Record<DomainName, number>;
  for (const domain of DOMAIN_NAMES) {
    const severityWeight = normalizeScore(scores[domain]);
    const coreWebVitalInfluence = getCoreWebVitalInfluence(domain);
    const userPerceptionWeight = USER_PERCEPTION_WEIGHT[domain];
    const fixLeverageWeight = FIX_LEVERAGE_WEIGHT[domain];
    const raw =
      severityWeight * 0.4 +
      coreWebVitalInfluence * 0.3 +
      userPerceptionWeight * 0.2 +
      fixLeverageWeight * 0.1;
    const normalized = Math.round(Math.max(0, Math.min(100, raw * 100)));
    result[domain] = normalized;
  }
  return result;
}

/** Map risk_breakdown from API to DomainScores. */
export function riskBreakdownToDomainScores(breakdown: {
  speed_risk_score?: number;
  ux_risk_score?: number;
  seo_risk_score?: number;
  conversion_risk_score?: number;
  scaling_risk_score?: number;
} | null | undefined): DomainScores {
  if (!breakdown) return {};
  return {
    Speed: breakdown.speed_risk_score,
    UX: breakdown.ux_risk_score,
    SEO: breakdown.seo_risk_score,
    Conversion: breakdown.conversion_risk_score,
    Scaling: breakdown.scaling_risk_score,
  };
}
