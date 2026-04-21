import {
  buildExecutiveSummaryInputFromAnalyzeData,
  generateExecutiveSummaryJson,
  sanitizeExecutiveSummaryLine,
} from "@/lib/aiExecutiveSummary";

describe("aiExecutiveSummary", () => {
  const baseData = {
    estimatedMonthlyLeak: 1200,
    leak_by_metric: { lcp: 400, tbt: 200, inp: 100, cls: 50 },
    revenueImpactInputs: {
      lcpSeconds: 4.2,
      cls: 0.15,
      inpMs: 350,
    },
    detailed_metrics: {
      core: {
        lcp: { numericValue: 4200 },
        inp: { numericValue: 350 },
        cls: { numericValue: 0.15 },
      },
      blocking: { tbt: { numericValue: 450 } },
      load: { tti: { numericValue: 8500 } },
    },
    fix_priorities: [
      { category: "speed", score: 70, priority: "High" },
      { category: "ux", score: 50, priority: "Medium" },
    ],
    baselineRevenueForCompetitorAnalysis: 50000,
  };

  it("sanitizes numbers and metric tokens", () => {
    expect(sanitizeExecutiveSummaryLine("LCP is 4200ms and 15%")).toBe("is and");
  });

  it("builds inputs aligned with funnel weights", () => {
    const input = buildExecutiveSummaryInputFromAnalyzeData(baseData, {
      baselineRevenue: 50000,
      sensitivityMode: "balanced",
    });
    expect(["landing", "interaction", "conversion"]).toContain(input.dominantStage);
    expect(["speed", "interaction", "stability"]).toContain(input.worstMetricGroup);
    expect(input.contributingSignals.length).toBeGreaterThan(0);
    expect(Number.isFinite(input.revenueImpact.min)).toBe(true);
    expect(Number.isFinite(input.revenueImpact.max)).toBe(true);
  });

  it("generates four plain-language fields without digits", () => {
    const result = generateExecutiveSummaryJson(baseData, { baselineRevenue: 50000, sensitivityMode: "balanced" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { headline, impact, constraint, action } = result.json;
    const all = `${headline} ${impact} ${constraint} ${action}`;
    expect(/\d/.test(all)).toBe(false);
    expect(headline.length).toBeGreaterThan(10);
    expect(constraint.toLowerCase()).toContain("bottleneck");
  });

  it("does not emit forbidden metric abbreviations", () => {
    const result = generateExecutiveSummaryJson(baseData, { baselineRevenue: 50000, sensitivityMode: "balanced" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const all = JSON.stringify(result.json).toLowerCase();
    expect(all).not.toMatch(/\blcp\b|\binp\b|\bcls\b|\btbt\b/);
  });
});
