import {
  buildPrimaryConstraintPresentationInputFromAnalyzeData,
  presentPrimaryConstraint,
  strongestConstraintAxis,
} from "@/lib/primaryConstraint";
import type { PrimaryConstraintPresentationInput } from "@/lib/primaryConstraintPresentation";

describe("strongestConstraintAxis", () => {
  it("prefers higher severity", () => {
    const input: PrimaryConstraintPresentationInput = {
      dominantStage: "landing",
      severity: { speed: "medium", interaction: "high", stability: "low" },
      impactWeights: { landing: 0.35, interaction: 0.5, conversion: 0.15 },
    };
    expect(strongestConstraintAxis(input)).toBe("interaction");
  });

  it("on severity tie, prefers axis aligned with dominantStage", () => {
    const input: PrimaryConstraintPresentationInput = {
      dominantStage: "landing",
      severity: { speed: "high", interaction: "high", stability: "low" },
      impactWeights: { landing: 0.33, interaction: 0.34, conversion: 0.33 },
    };
    expect(strongestConstraintAxis(input)).toBe("speed");
  });

  it("on severity and dominant tie, prefers higher impact weight", () => {
    const input: PrimaryConstraintPresentationInput = {
      dominantStage: "conversion",
      severity: { speed: "high", interaction: "high", stability: "low" },
      impactWeights: { landing: 0.2, interaction: 0.55, conversion: 0.25 },
    };
    expect(strongestConstraintAxis(input)).toBe("interaction");
  });
});

describe("presentPrimaryConstraint", () => {
  it("returns one sentence without jargon", () => {
    const text = presentPrimaryConstraint({
      dominantStage: "interaction",
      severity: { speed: "medium", interaction: "high", stability: "low" },
      impactWeights: { landing: 0.35, interaction: 0.5, conversion: 0.15 },
    });
    expect(text.split(/[.!?]/).filter(Boolean).length).toBe(1);
    expect(text).toMatch(/engagement|flow|completion/i);
    expect(text).not.toMatch(/LCP|CLS|INP|TBT|%/);
  });

  it("integration: builder + presenter", () => {
    const input = buildPrimaryConstraintPresentationInputFromAnalyzeData({
      revenueImpactInputs: { lcpSeconds: 5, cls: 0.05, inpMs: 800 },
      detailed_metrics: null,
    });
    const line = presentPrimaryConstraint(input);
    expect(line.length).toBeGreaterThan(20);
  });
});
