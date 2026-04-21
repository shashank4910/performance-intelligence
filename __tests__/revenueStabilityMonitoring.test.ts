import {
  buildWhatChangedBullets,
  compareMonitoringSnapshots,
  dominantStageFromLeakByMetric,
  formatRevenueAtRiskLine,
  validateStageRevenueAlignment,
  type MonitoringSnapshot,
} from "@/lib/revenueStabilityMonitoring";

function snap(
  partial: Partial<MonitoringSnapshot> & Pick<MonitoringSnapshot, "revenueImpact" | "dominantStage">
): MonitoringSnapshot {
  return {
    timestamp: new Date().toISOString(),
    overallHealth: 50,
    scores: { speed: 40, ux: 40, seo: 40, conversion: 40 },
    coreMetrics: { lcp: 2, inp: 0.2, cls: 0.1 },
    ...partial,
  };
}

describe("compareMonitoringSnapshots", () => {
  test("TEST 1: worsening + alert when revenue range shifts up >10%", () => {
    const previous = snap({
      revenueImpact: { min: 61000, max: 92000 },
      overallHealth: 50,
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 73000, max: 110000 },
      overallHealth: 45,
      dominantStage: "landing",
    });
    const c = compareMonitoringSnapshots(current, previous);
    expect(c.trend).toBe("worsening");
    expect(c.alertTriggered).toBe(true);
  });

  test("TEST 2: improving, no alert", () => {
    const previous = snap({
      revenueImpact: { min: 90000, max: 140000 },
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 70000, max: 100000 },
      dominantStage: "landing",
    });
    const c = compareMonitoringSnapshots(current, previous);
    expect(c.trend).toBe("improving");
    expect(c.alertTriggered).toBe(false);
  });

  test("TEST 3: stable — negligible midpoint change", () => {
    const previous = snap({
      revenueImpact: { min: 10000, max: 20000 },
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 10100, max: 20100 },
      dominantStage: "landing",
    });
    const c = compareMonitoringSnapshots(current, previous);
    expect(c.trend).toBe("stable");
    expect(c.alertTriggered).toBe(false);
  });

  test("alert when dominant stage worsens even if midpoint ~stable", () => {
    const previous = snap({
      revenueImpact: { min: 10000, max: 20000 },
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 10000, max: 20000 },
      dominantStage: "interaction",
    });
    const c = compareMonitoringSnapshots(current, previous);
    expect(c.dominantStageWorsened).toBe(true);
    expect(c.alertTriggered).toBe(true);
  });
});

describe("dominantStageFromLeakByMetric", () => {
  test("CLS bucket wins", () => {
    expect(
      dominantStageFromLeakByMetric({ lcp: 100, tbt: 0, inp: 0, cls: 5000 })
    ).toBe("conversion");
  });
  test("LCP wins when highest", () => {
    expect(
      dominantStageFromLeakByMetric({ lcp: 9000, tbt: 100, inp: 100, cls: 100 })
    ).toBe("landing");
  });
});

describe("buildWhatChangedBullets", () => {
  test("TEST 4: CLS ~0 — no layout stability bullet", () => {
    const previous = snap({
      revenueImpact: { min: 1, max: 2 },
      coreMetrics: { lcp: 2, inp: 0.2, cls: 0 },
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 1, max: 2 },
      coreMetrics: { lcp: 2.1, inp: 0.2, cls: 0 },
      dominantStage: "landing",
    });
    const bullets = buildWhatChangedBullets(current, previous);
    const text = bullets.map((b) => b.text).join(" ");
    expect(text.toLowerCase()).not.toContain("layout");
    expect(text.toLowerCase()).not.toContain("conversion");
  });

  test("TEST 5: INP missing — no interaction responsiveness bullet", () => {
    const previous = snap({
      revenueImpact: { min: 1, max: 2 },
      coreMetrics: { lcp: 2, inp: null, cls: 0.2 },
      dominantStage: "landing",
    });
    const current = snap({
      revenueImpact: { min: 1, max: 2 },
      coreMetrics: { lcp: 2, inp: null, cls: 0.2 },
      dominantStage: "landing",
    });
    const bullets = buildWhatChangedBullets(current, previous);
    const text = bullets.map((b) => b.text).join(" ");
    expect(text.toLowerCase()).not.toContain("interaction");
  });
});

describe("formatRevenueAtRiskLine", () => {
  test("formats K suffix", () => {
    expect(formatRevenueAtRiskLine(61000, 92000)).toBe("$61K–$92K at risk");
  });
});

describe("TEST 6: validateStageRevenueAlignment", () => {
  const err = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = err;
  });

  test("fails when trend improving but stage worsened", () => {
    const c = compareMonitoringSnapshots(
      snap({
        revenueImpact: { min: 1000, max: 2000 },
        dominantStage: "interaction",
      }),
      snap({
        revenueImpact: { min: 50000, max: 80000 },
        dominantStage: "landing",
      })
    );
    expect(c.trend).toBe("improving");
    expect(c.dominantStageWorsened).toBe(true);
    expect(validateStageRevenueAlignment(c)).toBe(false);
  });
});
