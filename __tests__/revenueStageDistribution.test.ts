import {
  computeStageMetricWeights,
  distributeRecoverableAcrossStages,
  getSeverity,
  reconcileMaxRecoverableCta,
  STAGE_RECOVERABLE_SUM_TOLERANCE,
  canonicalStageForEngineKey,
  comparePriorityFixes,
} from "@/lib/revenueStageDistribution";

describe("getSeverity", () => {
  it("classifies LCP thresholds", () => {
    expect(getSeverity(2.4, { good: 2.5, medium: 4 })).toBe("good");
    expect(getSeverity(3.0, { good: 2.5, medium: 4 })).toBe("medium");
    expect(getSeverity(5.0, { good: 2.5, medium: 4 })).toBe("bad");
    expect(getSeverity(null, { good: 2.5, medium: 4 })).toBe("unknown");
  });
});

/** TEST 1: Interaction dominance */
describe("TEST 1: Interaction dominance", () => {
  it("LCP medium, TBT bad, CLS good → interaction > landing, conversion capped", () => {
    const snap = {
      lcpSeconds: 3.0,
      inpSeconds: null,
      tbtSeconds: 1.4,
      cls: 0,
    };
    const w = computeStageMetricWeights(snap);
    expect(w.interaction).toBeGreaterThan(w.landing);
    expect(w.conversion).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(w.clsGoodForMessaging).toBe(true);
  });
});

/** TEST 2: Perfect CLS */
describe("TEST 2: Perfect CLS", () => {
  it("CLS = 0 → conversion share ≤ 10% and good messaging flag", () => {
    const w = computeStageMetricWeights({
      lcpSeconds: 4.5,
      inpSeconds: 0.3,
      tbtSeconds: 0.5,
      cls: 0,
    });
    expect(w.conversionShare).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(w.clsGoodForMessaging).toBe(true);
  });
});

/** TEST 3: Sum consistency */
describe("TEST 3: Sum consistency", () => {
  it("stage dollars sum within tolerance of recoverableExpected", () => {
    const opportunityLow = 23_000;
    const opportunityHigh = 34_000;
    const expectedLoss = (opportunityLow + opportunityHigh) / 2;
    const recoveryFactor = 0.7;
    const recoverableExpected = expectedLoss * recoveryFactor;
    const snap = {
      lcpSeconds: 2.8,
      inpSeconds: 0.25,
      tbtSeconds: 0.4,
      cls: 0.12,
    };
    const amounts = distributeRecoverableAcrossStages(snap, recoverableExpected);
    const sum = amounts.Landing + amounts.Activation + amounts.Conversion;
    expect(Math.abs(sum - recoverableExpected) / recoverableExpected).toBeLessThanOrEqual(
      STAGE_RECOVERABLE_SUM_TOLERANCE + 1e-9
    );
  });
});

/** TEST 4: CTA consistency */
describe("TEST 4: CTA consistency", () => {
  it("CTA ≥ each stage and ≥ sum, and ≤ totalLossCap", () => {
    const opportunityHigh = 34_000;
    const recoveryFactorMax = 0.75;
    const stageAmounts = { Landing: 8000, Activation: 12_000, Conversion: 1500 };
    const totalLossCap = 50_000;
    const cta = reconcileMaxRecoverableCta({
      opportunityHigh,
      recoveryFactorMax,
      stageAmounts,
      totalLossCap,
    });
    expect(cta).toBeGreaterThanOrEqual(12_000);
    expect(cta).toBeGreaterThanOrEqual(8000 + 12_000 + 1500);
    expect(cta).toBeLessThanOrEqual(totalLossCap);
  });
});

/** TEST 5: Priority fix alignment */
describe("TEST 5: Priority fix alignment", () => {
  it("when interaction stage dominates, TBT fix sorts before CLS when $ equal", () => {
    const snap = {
      lcpSeconds: 3.0,
      inpSeconds: null,
      tbtSeconds: 1.4,
      cls: 0,
    };
    const sw = computeStageMetricWeights(snap);
    expect(sw.interaction).toBeGreaterThan(sw.conversion);
    const tbtFix = {
      primaryEngineKey: "tbt",
      totalRevenueImpact: 1000,
      confidence: "Medium" as const,
      effortWeight: 1.5,
    };
    const clsFix = {
      primaryEngineKey: "cls",
      totalRevenueImpact: 1000,
      confidence: "Medium" as const,
      effortWeight: 1.5,
    };
    expect(comparePriorityFixes(tbtFix, clsFix, sw)).toBeLessThan(0);
    expect(canonicalStageForEngineKey("tbt")).toBe("Activation");
    expect(canonicalStageForEngineKey("cls")).toBe("Conversion");
  });
});

/** TEST 6: No contradictions — bad interaction cannot sit below good CLS on weight order */
describe("TEST 6: No contradictions", () => {
  it("bad TBT with good CLS still yields interaction ≥ conversion weight", () => {
    const w = computeStageMetricWeights({
      lcpSeconds: 2.0,
      inpSeconds: null,
      tbtSeconds: 2.0,
      cls: 0.02,
    });
    expect(w.interaction).toBeGreaterThanOrEqual(w.conversion);
  });
});
