import {
  RANGE_BOUNDS_BY_MODE,
  RECOVERY_FACTORS,
  opportunityBoundsFromLoss,
  persistedOpportunityRange,
  validateRevenueModel,
  type SensitivityMode,
} from "@/lib/revenueImpactSensitivityMath";

const MODES: SensitivityMode[] = ["conservative", "balanced", "aggressive"];

describe("Revenue impact sensitivity modes (presentation + persist)", () => {
  describe("RANGE_BOUNDS_BY_MODE", () => {
    it("orders low multipliers: conservative ≤ balanced ≤ aggressive", () => {
      expect(RANGE_BOUNDS_BY_MODE.conservative.low).toBeLessThanOrEqual(RANGE_BOUNDS_BY_MODE.balanced.low);
      expect(RANGE_BOUNDS_BY_MODE.balanced.low).toBeLessThanOrEqual(RANGE_BOUNDS_BY_MODE.aggressive.low);
    });

    it("orders high multipliers: conservative ≤ balanced ≤ aggressive", () => {
      expect(RANGE_BOUNDS_BY_MODE.conservative.high).toBeLessThanOrEqual(RANGE_BOUNDS_BY_MODE.balanced.high);
      expect(RANGE_BOUNDS_BY_MODE.balanced.high).toBeLessThanOrEqual(RANGE_BOUNDS_BY_MODE.aggressive.high);
    });
  });

  describe("RECOVERY_FACTORS", () => {
    it.each(MODES)("has 0<min≤max≤1 and avg between min and max for %s", (mode) => {
      const r = RECOVERY_FACTORS[mode];
      expect(r.min).toBeGreaterThan(0);
      expect(r.max).toBeLessThanOrEqual(1);
      expect(r.min).toBeLessThanOrEqual(r.max);
      expect(r.avg).toBeGreaterThanOrEqual(r.min);
      expect(r.avg).toBeLessThanOrEqual(r.max);
    });
  });

  describe("persistedOpportunityRange (matches runSimulation PATCH range)", () => {
    const leak = 10_000;
    const baseline = 50_000;

    it.each(MODES)("keeps low ≤ high ≤ baseline for %s", (mode) => {
      const r = persistedOpportunityRange(leak, baseline, mode);
      expect(r.low).toBeLessThanOrEqual(r.high);
      expect(r.high).toBeLessThanOrEqual(baseline);
      expect(r.expected).toBe(Math.round(leak));
    });

    it("widens published range as mode becomes more aggressive", () => {
      const c = persistedOpportunityRange(leak, baseline, "conservative");
      const b = persistedOpportunityRange(leak, baseline, "balanced");
      const a = persistedOpportunityRange(leak, baseline, "aggressive");
      const width = (x: { low: number; high: number }) => x.high - x.low;
      expect(width(c)).toBeLessThanOrEqual(width(b));
      expect(width(b)).toBeLessThanOrEqual(width(a));
    });
  });

  describe("opportunityBoundsFromLoss (matches live workspace display)", () => {
    it.each(MODES)("matches persisted low/high for expected loss when baseline caps high", (mode) => {
      const leak = 10_000;
      const baseline = 50_000;
      const p = persistedOpportunityRange(leak, baseline, mode);
      const d = opportunityBoundsFromLoss(p.expected, baseline, mode);
      expect(d.opportunityLow).toBe(p.low);
      expect(d.opportunityHigh).toBe(p.high);
    });

    it("keeps opportunityHigh ≥ opportunityLow (inner min is capped by baseline)", () => {
      const baseline = 5_000;
      const loss = 8_000;
      const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(loss, baseline, "aggressive");
      expect(opportunityHigh).toBeGreaterThanOrEqual(opportunityLow);
      const innerCap = Math.min(Math.round(loss * RANGE_BOUNDS_BY_MODE.aggressive.high), baseline);
      expect(innerCap).toBeLessThanOrEqual(baseline);
    });
  });

  describe("validateRevenueModel invariants", () => {
    it.each(MODES)("keeps projected band inside baseline after recovery scaling for %s", (mode) => {
      const baseline = 40_000;
      const totalLoss = 9_000;
      const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(totalLoss, baseline, mode);
      const recovery = RECOVERY_FACTORS[mode];
      const recoverableLow = opportunityLow * recovery.min;
      const recoverableHigh = opportunityHigh * recovery.max;
      const currentRevenue = Math.max(0, baseline - totalLoss);
      const v = validateRevenueModel({
        baselineRevenue: baseline,
        totalLoss,
        recoverableLow,
        recoverableHigh,
        currentRevenue,
        projectedLow: currentRevenue + recoverableLow,
        projectedHigh: currentRevenue + recoverableHigh,
      });
      expect(v.projectedLow).toBeGreaterThanOrEqual(v.currentRevenue);
      expect(v.projectedHigh).toBeLessThanOrEqual(v.baselineRevenue);
      expect(v.projectedLow).toBeLessThanOrEqual(v.projectedHigh);
    });
  });
});
