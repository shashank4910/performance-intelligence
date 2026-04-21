import { runRevenueProjection } from "../impactEngine/revenueProjectionEngine";

describe("runRevenueProjection TTI vs TBT", () => {
  it("uses lab TTI seconds for TTI driver impact when TTI is high and TBT is low", () => {
    const withTti = runRevenueProjection({
      performanceSnapshot: {
        overallHealth: 50,
        lcp: 2,
        inp: 0.1,
        cls: 0.05,
        tbt: 0.01,
        tti: 18,
      },
      businessInputs: { monthlyRevenue: 50_000, mobileTrafficPercent: 100 },
      businessModelId: "saas",
      sensitivityMode: "balanced",
    });
    const withoutTti = runRevenueProjection({
      performanceSnapshot: {
        overallHealth: 50,
        lcp: 2,
        inp: 0.1,
        cls: 0.05,
        tbt: 0.01,
        tti: undefined,
      },
      businessInputs: { monthlyRevenue: 50_000, mobileTrafficPercent: 100 },
      businessModelId: "saas",
      sensitivityMode: "balanced",
    });
    expect(withTti.primaryDrivers.some((d) => d.metric === "TTI")).toBe(true);
    expect(withTti.opportunityRange.expected).toBeGreaterThan(withoutTti.opportunityRange.expected);
  });
});
