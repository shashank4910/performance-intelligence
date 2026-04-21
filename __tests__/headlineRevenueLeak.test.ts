import {
  behaviorMetricsMsFromLighthouseAudits,
  behaviorMetricsMsFromSnapshotSeconds,
  computeHeadlineRevenueLeak,
  resolveLeakForMetricDrawer,
} from "../lib/headlineRevenueLeak";

describe("headlineRevenueLeak", () => {
  it("behaviorMetricsMsFromLighthouseAudits reads Lighthouse audit ms", () => {
    const audits = {
      "largest-contentful-paint": { numericValue: 2800 },
      "total-blocking-time": { numericValue: 400 },
      "interaction-to-next-paint": { numericValue: 180 },
      "cumulative-layout-shift": { numericValue: 0.12 },
    };
    expect(behaviorMetricsMsFromLighthouseAudits(audits)).toEqual({
      lcp: 2800,
      tbt: 400,
      inp: 180,
      cls: 0.12,
    });
  });

  it("behaviorMetricsMsFromSnapshotSeconds converts seconds to ms for LCP/TBT/INP", () => {
    expect(
      behaviorMetricsMsFromSnapshotSeconds({
        lcp: 2.5,
        inp: 0.2,
        tbt: 0.3,
        cls: 0.05,
      })
    ).toEqual({
      lcp: 2500,
      inp: 200,
      tbt: 300,
      cls: 0.05,
    });
  });

  it("computeHeadlineRevenueLeak returns positive total and lcp/tbt/inp/cls leak keys", () => {
    const baseline = 100_000;
    const metrics = { lcp: 3000, tbt: 500, inp: 250, cls: 0.15 };
    const a = computeHeadlineRevenueLeak(baseline, metrics);
    expect(a.totalLoss).toBeGreaterThan(0);
    expect(Object.keys(a.leakByMetric).sort()).toEqual(["cls", "inp", "lcp", "tbt"]);
  });

  it("resolveLeakForMetricDrawer uses direct keys when present", () => {
    const leak = { lcp: 100, tbt: 40, inp: 60, cls: 20 };
    expect(resolveLeakForMetricDrawer("lcp", leak)).toBe(100);
    expect(resolveLeakForMetricDrawer("tbt", leak)).toBe(40);
  });

  it("resolveLeakForMetricDrawer pools TBT+INP for TTI when tti key absent", () => {
    const leak = { lcp: 100, tbt: 40, inp: 60, cls: 20 };
    expect(resolveLeakForMetricDrawer("tti", leak)).toBe(100);
  });
});
