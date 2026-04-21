import {
  attributeLeakToResources,
  getTopFiveUnderperformers,
  distributeLeakBySeverity,
  geometricDecayLeakFraction,
  compoundLeakFractions,
  calculateRevenueLeakWithModel,
  calculateRevenueLeak,
  getGlobalRevenuePieFromAudits,
  type ResourceForAttribution,
  type MetricValuesForPriority,
} from "../lib/impactEngine/revenueLeakCalculator";
import { computeCortexV2 } from "../lib/impactEngine/cortexV2";
import {
  setLastScannedUrl,
  runAttributionDiagnostic,
  type AttributionDiagnosticResult,
} from "../lib/diagnostics/attributionTester";

const TEST_URL = "https://example.com/test";
const TOTAL_LEAK = 2_602_499.78;
const RESOURCE_COUNT = 51;

function buildAllMediumResources(n: number): ResourceForAttribution[] {
  return Array.from({ length: n }, () => ({ impactLevel: "Medium" as const }));
}

describe("Attribution diagnostic (internal simulation)", () => {
  beforeAll(() => {
    setLastScannedUrl(TEST_URL);
  });

  it("Variance is PASS when all resources are Medium (variance factor applied)", () => {
    const resources = buildAllMediumResources(RESOURCE_COUNT);
    const attributedAmounts = attributeLeakToResources(TOTAL_LEAK, resources);
    const diag = runAttributionDiagnostic(TEST_URL, attributedAmounts, TOTAL_LEAK);

    expect(diag.resourceCount).toBe(RESOURCE_COUNT);
    expect(diag.varianceCheck).toBe("PASS");
    expect(diag.distinctDollarValues).toBeGreaterThan(1);
  });

  it("Summation is PASS: attributed amounts sum exactly to estimatedMonthlyLeak", () => {
    const resources = buildAllMediumResources(RESOURCE_COUNT);
    const attributedAmounts = attributeLeakToResources(TOTAL_LEAK, resources);
    const diag = runAttributionDiagnostic(TEST_URL, attributedAmounts, TOTAL_LEAK);

    expect(diag.summationCheck).toBe("PASS");
    expect(Math.abs(diag.attributedSum - diag.expectedTotal)).toBeLessThanOrEqual(0.01);
  });

  it("Uniqueness is PASS when currentUrl matches lastScannedUrl", () => {
    setLastScannedUrl(TEST_URL);
    const resources = buildAllMediumResources(3);
    const attributedAmounts = attributeLeakToResources(1000, resources);
    const diag = runAttributionDiagnostic(TEST_URL, attributedAmounts, 1000);
    expect(diag.uniquenessCheck).toBe("PASS");
  });

  it("High + Medium get 60% / 40% of leak", () => {
    const resources: ResourceForAttribution[] = [
      { impactLevel: "High" },
      { impactLevel: "Medium" },
    ];
    const attributedAmounts = attributeLeakToResources(1000, resources);
    const highShare = attributedAmounts[0] / 1000;
    const mediumShare = attributedAmounts[1] / 1000;
    expect(highShare).toBeCloseTo(0.6, 2);
    expect(mediumShare).toBeCloseTo(0.4, 2);
    expect(attributedAmounts[0] + attributedAmounts[1]).toBe(1000);
  });
});

describe("Global priority attribution (top-5 underperformers)", () => {
  it("ranks by excess over green threshold (TTI 59s > LCP > TBT)", () => {
    const metrics: MetricValuesForPriority = {
      tti: 59_000,
      tbt: 500,
      lcp: 3000,
    };
    const top = getTopFiveUnderperformers(metrics);
    expect(top.length).toBe(3);
    expect(top[0].metricKey).toBe("tti");
    expect(top[0].excessMs).toBe(59_000 - 3800);
    expect(top[1].metricKey).toBe("lcp");
    expect(top[1].excessMs).toBe(500);
    expect(top[2].metricKey).toBe("tbt");
    expect(top[2].excessMs).toBe(200);
  });

  it("distributeLeakBySeverity: sum of leakByMetric equals totalLeak", () => {
    const totalLeak = 2_600_000;
    const metrics: MetricValuesForPriority = {
      lcp: 4000,
      tti: 6000,
      fcp: 2500,
    };
    const underperformers = getTopFiveUnderperformers(metrics);
    const leakByMetric = distributeLeakBySeverity(totalLeak, underperformers);
    const sum = Object.values(leakByMetric).reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalLeak);
  });

  it("Good metric (at or below threshold) is not in top five; gets 0 leak share", () => {
    const metrics: MetricValuesForPriority = {
      lcp: 2500,
      tti: 5000,
    };
    const top = getTopFiveUnderperformers(metrics);
    expect(top.map((u) => u.metricKey)).not.toContain("lcp");
    const leakByMetric = distributeLeakBySeverity(1000, top);
    expect(leakByMetric["lcp"] ?? 0).toBe(0);
  });
});

describe("Geometric Decay + Compounding (research-based model)", () => {
  it("geometricDecayLeakFraction is 0 at or below t_opt, curves up above", () => {
    expect(geometricDecayLeakFraction(2500, 2500, 0.15)).toBe(0);
    expect(geometricDecayLeakFraction(2000, 2500, 0.15)).toBe(0);
    const f = geometricDecayLeakFraction(10000, 2500, 0.15);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1);
    expect(1 - Math.exp(-0.15 * 7.5)).toBeCloseTo(f, 10);
  });

  it("compoundLeakFractions: 1 - (1-LCP)*(1-TTI)", () => {
    const c = compoundLeakFractions([0.1, 0.2]);
    expect(c).toBeCloseTo(1 - 0.9 * 0.8, 10);
    expect(c).toBeCloseTo(0.28, 10);
  });

  it("calculateRevenueLeakWithModel: LCP+TTI compounding, aggressive for >10s LCP", () => {
    const revenue = 1_000_000;
    const at10s = calculateRevenueLeakWithModel({ lcp: 10000, tti: 0 }, { monthlyRevenue: revenue });
    const at2_5s = calculateRevenueLeakWithModel({ lcp: 2500, tti: 0 }, { monthlyRevenue: revenue });
    expect(at2_5s).toBe(0);
    expect(at10s).toBeGreaterThan(0);
    expect(at10s).toBeLessThanOrEqual(revenue);
  });

  it("calculateRevenueLeak (legacy) uses geometric decay LCP-only", () => {
    expect(calculateRevenueLeak(2500, { monthlyRevenue: 1000 })).toBe(0);
    expect(calculateRevenueLeak(5000, { monthlyRevenue: 1000 })).toBeGreaterThan(0);
  });

  it("USA: square-root weighting favors larger medium over smaller high when sizes differ", () => {
    const resources: ResourceForAttribution[] = [
      { impactLevel: "High", resourceSize: 10_000 },
      { impactLevel: "Medium", resourceSize: 1_000_000 },
    ];
    const amounts = attributeLeakToResources(1000, resources);
    const total = amounts[0] + amounts[1];
    expect(total).toBe(1000);
    const highWeight = Math.sqrt(3 * 10_000);
    const medWeight = Math.sqrt(2 * 1_000_000);
    expect(medWeight).toBeGreaterThan(highWeight);
    expect(amounts[1]).toBeGreaterThan(amounts[0]);
  });
});

describe("Global Revenue Pie (universal metric loop)", () => {
  it("includes only audits with score < 0.9; LCP/TTI/CLS/Unused get decay-derived slices", () => {
    const audits: Record<string, { numericValue?: number; score?: number | null }> = {
      "largest-contentful-paint": { numericValue: 5000, score: 0.5 },
      interactive: { numericValue: 8000, score: 0.4 },
      "cumulative-layout-shift": { numericValue: 0.25, score: 0.6 },
      "unused-css-rules": { numericValue: 150000, score: 0.7 },
    };
    const { totalLeak, leakByMetric } = getGlobalRevenuePieFromAudits(audits, 1_000_000);
    expect(totalLeak).toBeGreaterThan(0);
    expect(leakByMetric.lcp).toBeGreaterThan(0);
    expect(leakByMetric.tti).toBeGreaterThan(0);
    expect(leakByMetric.cls).toBeGreaterThan(0);
    expect(leakByMetric.unusedCss).toBeGreaterThan(0);
    const sum = Object.values(leakByMetric).reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalLeak);
  });

  it("excludes audits with score >= 0.9", () => {
    const audits: Record<string, { numericValue?: number; score?: number | null }> = {
      "largest-contentful-paint": { numericValue: 2000, score: 0.95 },
      interactive: { numericValue: 3000, score: 0.92 },
    };
    const { totalLeak, leakByMetric } = getGlobalRevenuePieFromAudits(audits, 1_000_000);
    expect(totalLeak).toBe(0);
    expect(Object.keys(leakByMetric).length).toBe(0);
  });

  it("distributes to EVERY underperforming metric; Speed Index 12.9s gets significant slice of total", () => {
    const audits: Record<string, { numericValue?: number; score?: number | null }> = {
      "speed-index": { numericValue: 12900, score: 0.2 },
      "largest-contentful-paint": { numericValue: 4000, score: 0.5 },
      interactive: { numericValue: 6000, score: 0.4 },
    };
    const revenue = 2_000_000;
    const { totalLeak, leakByMetric } = getGlobalRevenuePieFromAudits(audits, revenue);
    expect(totalLeak).toBeGreaterThan(0);
    const sum = Object.values(leakByMetric).reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalLeak);
    expect(leakByMetric.speedIndex).toBeGreaterThan(0);
    expect(leakByMetric.speedIndex).toBeGreaterThan(leakByMetric.lcp ?? 0);
  });
});

describe("CORTEX v2 (stage-based multi-curve)", () => {
  it("incorporates all underperforming audits; FinalAbandonment clamped to 0.6", () => {
    const audits: Record<string, { numericValue?: number; score?: number | null }> = {
      "largest-contentful-paint": { numericValue: 6000, score: 0.3 },
      interactive: { numericValue: 10000, score: 0.2 },
      "cumulative-layout-shift": { numericValue: 0.2, score: 0.5 },
      "unused-javascript": { numericValue: 200000, score: 0.6 },
      "total-byte-weight": { numericValue: 800000 },
    };
    const result = computeCortexV2({ audits, monthlyRevenue: 1_000_000 });
    expect(result.totalLeak).toBeGreaterThan(0);
    expect(result.diagnostic.finalAbandonmentProbability).toBeLessThanOrEqual(0.6);
    expect(result.diagnostic.stageVisualImpact).toBeGreaterThanOrEqual(0);
    expect(result.diagnostic.stageInteractionImpact).toBeGreaterThanOrEqual(0);
    expect(result.diagnostic.infrastructureAmplifier).toBeGreaterThanOrEqual(1);
  });

  it("Σ(leakByMetric) === TotalLeak; equality check PASS", () => {
    const audits: Record<string, { numericValue?: number; score?: number | null }> = {
      "first-contentful-paint": { numericValue: 3000, score: 0.6 },
      "total-blocking-time": { numericValue: 600, score: 0.4 },
    };
    const result = computeCortexV2({ audits, monthlyRevenue: 500_000 });
    const sum = Object.values(result.leakByMetric).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.totalLeak);
    expect(result.diagnostic.equalityCheck).toBe("PASS");
  });
});
