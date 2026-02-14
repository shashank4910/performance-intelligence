import {
  calculateSpeedRisk,
  calculateOverallHealth,
  getRiskLevel,
  computeAllScores,
  type LighthouseMetrics,
} from "../lib/riskEngine";

function metrics(overrides: Partial<LighthouseMetrics> = {}): LighthouseMetrics {
  return {
    lcp: 0,
    cls: 0,
    inp: 0,
    tbt: 0,
    fcp: 0,
    speedIndex: 0,
    domSize: 0,
    mainThreadWork: 0,
    ...overrides,
  };
}

describe("calculateSpeedRisk", () => {
  it("returns 0 when all metrics are below threshold", () => {
    const m = metrics({
      lcp: 0,
      tbt: 0,
      speedIndex: 0,
    });
    expect(calculateSpeedRisk(m)).toBe(0);
  });

  it("returns 0 when metrics are at low threshold", () => {
    const m = metrics({
      lcp: 2500,
      tbt: 300,
      speedIndex: 3000,
    });
    expect(calculateSpeedRisk(m)).toBe(0);
  });

  it("returns 100 when all metrics are at or above high threshold", () => {
    const m = metrics({
      lcp: 5000,
      tbt: 600,
      speedIndex: 6000,
    });
    expect(calculateSpeedRisk(m)).toBe(100);
  });

  it("returns value between 0 and 100 when metrics are between thresholds", () => {
    const m = metrics({
      lcp: 3750,
      tbt: 450,
      speedIndex: 4500,
    });
    const result = calculateSpeedRisk(m);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("handles extreme values above threshold (returns 100)", () => {
    const m = metrics({
      lcp: 100000,
      tbt: 10000,
      speedIndex: 50000,
    });
    expect(calculateSpeedRisk(m)).toBe(100);
  });

  it("only LCP above threshold contributes to risk", () => {
    const good = metrics({ lcp: 0, tbt: 0, speedIndex: 0 });
    const badLcp = metrics({ lcp: 5000, tbt: 0, speedIndex: 0 });
    expect(calculateSpeedRisk(good)).toBe(0);
    expect(calculateSpeedRisk(badLcp)).toBeGreaterThan(0);
  });
});

describe("calculateOverallHealth", () => {
  it("returns 100 when all risks are 0", () => {
    expect(
      calculateOverallHealth(0, 0, 0, 0, 0)
    ).toBe(100);
  });

  it("returns 0 when all risks are 100", () => {
    expect(
      calculateOverallHealth(100, 100, 100, 100, 100)
    ).toBe(0);
  });

  it("returns 50 when all risks are 50", () => {
    expect(
      calculateOverallHealth(50, 50, 50, 50, 50)
    ).toBe(50);
  });

  it("uses correct weights", () => {
    expect(
      calculateOverallHealth(100, 0, 0, 0, 0)
    ).toBe(70);
  });

  it("handles boundary: single risk at 40", () => {
    const h = calculateOverallHealth(40, 0, 0, 0, 0);
    expect(h).toBe(88);
  });

  it("returns integer", () => {
    const result = calculateOverallHealth(33, 33, 33, 33, 33);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("getRiskLevel", () => {
  it("returns Low for 0–39", () => {
    expect(getRiskLevel(0)).toBe("Low");
    expect(getRiskLevel(39)).toBe("Low");
  });

  it("returns Medium for 40–69", () => {
    expect(getRiskLevel(40)).toBe("Medium");
    expect(getRiskLevel(69)).toBe("Medium");
  });

  it("returns High for 70–100+", () => {
    expect(getRiskLevel(70)).toBe("High");
    expect(getRiskLevel(100)).toBe("High");
    expect(getRiskLevel(1000)).toBe("High");
  });

  it("handles negative values as Low", () => {
    expect(getRiskLevel(-1)).toBe("Low");
  });
});

describe("computeAllScores", () => {
  it("returns all expected fields", () => {
    const m = metrics({
      lcp: 5000,
      tbt: 600,
      speedIndex: 6000,
    });

    const result = computeAllScores(m);

    expect(result).toHaveProperty("speedRisk");
    expect(result).toHaveProperty("uxRisk");
    expect(result).toHaveProperty("seoRisk");
    expect(result).toHaveProperty("conversionRisk");
    expect(result).toHaveProperty("scalingRisk");
    expect(result).toHaveProperty("overallHealth");
  });
});
