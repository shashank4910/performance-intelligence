import {
  buildSystemDiagnosisPresentationInputFromAnalyzeData,
  dominantStageFromImpacts,
  presentSystemDiagnosis,
  secondaryStageFromWeights,
} from "@/lib/systemDiagnosis";
import { presentSystemDiagnosis as presentOnly } from "@/lib/systemDiagnosisPresentation";

describe("dominantStageFromImpacts", () => {
  it("stays on earlier funnel when conversion share is clearly lowest", () => {
    expect(dominantStageFromImpacts(0.5, 0.45, 0.05)).toBe("landing");
    expect(dominantStageFromImpacts(0.4, 0.5, 0.05)).toBe("interaction");
  });

  it("allows conversion when it truly leads", () => {
    expect(dominantStageFromImpacts(0.2, 0.25, 0.55)).toBe("conversion");
  });
});

describe("secondaryStageFromWeights", () => {
  it("returns runner-up by weight", () => {
    expect(secondaryStageFromWeights(0.5, 0.3, 0.2)).toBe("interaction");
    expect(secondaryStageFromWeights(0.2, 0.5, 0.3)).toBe("conversion");
  });
});

describe("presentSystemDiagnosis (presentation only)", () => {
  const base = { confidence: "high" as const, secondaryStage: "landing" as const };

  it("matches interaction + interaction high pattern", () => {
    const text = presentOnly({
      dominantStage: "interaction",
      severity: { speed: "low", interaction: "high", stability: "low" },
      ...base,
    });
    expect(text).toMatch(/trying to interact or engage/i);
    expect(text).toMatch(/slow or unresponsive interactions/i);
    expect(text).toMatch(/meaningful engagement/i);
    expect(text).not.toMatch(/LCP|CLS|INP|TBT|metrics|analysis|based on/i);
  });

  it("matches landing + speed high pattern", () => {
    const text = presentOnly({
      dominantStage: "landing",
      severity: { speed: "high", interaction: "low", stability: "low" },
      ...base,
    });
    expect(text).toMatch(/before seeing or understanding/i);
    expect(text).toMatch(/slow loading/i);
    expect(text).toMatch(/early engagement/i);
  });

  it("conversion dominant + stability medium", () => {
    const text = presentOnly({
      dominantStage: "conversion",
      severity: { speed: "low", interaction: "low", stability: "medium" },
      ...base,
    });
    expect(text).toMatch(/hesitating before completing/i);
    expect(text).toMatch(/inconsistent experience/i);
    expect(text).toMatch(/conversions/i);
  });

  it("all medium — balanced copy", () => {
    const text = presentOnly({
      dominantStage: "landing",
      severity: { speed: "medium", interaction: "medium", stability: "medium" },
      ...base,
    });
    expect(text).toMatch(/Friction shows up across/i);
    expect(text).toMatch(/routine use/i);
  });

  it("uses at most two sentences", () => {
    const text = presentOnly({
      dominantStage: "interaction",
      severity: { speed: "high", interaction: "high", stability: "low" },
      ...base,
    });
    expect(text.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });
});

describe("build + present integration", () => {
  it("returns non-trivial copy from analyze-shaped payload", () => {
    const input = buildSystemDiagnosisPresentationInputFromAnalyzeData({
      estimatedMonthlyLeak: 1000,
      revenueImpactInputs: { lcpSeconds: 5, cls: 0.05, inpMs: 800 },
      detailed_metrics: null,
      confidenceLevel: "High",
    });
    expect(input.dominantStage).toMatch(/landing|interaction|conversion/);
    expect(input.severity.speed).toBeDefined();
    const text = presentSystemDiagnosis(input);
    expect(text.length).toBeGreaterThan(30);
  });
});
