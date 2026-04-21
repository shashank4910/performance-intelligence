/**
 * Presentation only: one-line "primary constraint" from structured model output.
 * No metric names, numbers, or overlap with system diagnosis wording.
 */

import type { DiagnosisBand, DiagnosisStage } from "@/lib/systemDiagnosisPresentation";

export type PrimaryConstraintAxis = "speed" | "interaction" | "stability";

export type PrimaryConstraintPresentationInput = {
  dominantStage: DiagnosisStage;
  severity: {
    speed: DiagnosisBand;
    interaction: DiagnosisBand;
    stability: DiagnosisBand;
  };
  impactWeights: {
    landing: number;
    interaction: number;
    conversion: number;
  };
};

const SEVERITY_RANK: Record<DiagnosisBand, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Funnel stage used to break ties (speed → landing, interaction → interaction, stability → conversion). */
function stageForAxis(axis: PrimaryConstraintAxis): DiagnosisStage {
  if (axis === "speed") return "landing";
  if (axis === "interaction") return "interaction";
  return "conversion";
}

function weightForAxis(axis: PrimaryConstraintAxis, w: PrimaryConstraintPresentationInput["impactWeights"]): number {
  if (axis === "speed") return w.landing;
  if (axis === "interaction") return w.interaction;
  return w.conversion;
}

/**
 * Strongest constraint: highest severity, then axis aligned with dominantStage, then highest impact weight.
 * Deterministic when fully tied (speed before interaction before stability).
 */
export function strongestConstraintAxis(input: PrimaryConstraintPresentationInput): PrimaryConstraintAxis {
  const axes: PrimaryConstraintAxis[] = ["speed", "interaction", "stability"];
  const { dominantStage, severity, impactWeights } = input;

  const scored = axes.map((axis) => ({
    axis,
    sevRank: SEVERITY_RANK[severity[axis]] ?? 2,
    dominantBonus: stageForAxis(axis) === dominantStage ? 1 : 0,
    weight: weightForAxis(axis, impactWeights),
  }));

  scored.sort((a, b) => {
    if (b.sevRank !== a.sevRank) return b.sevRank - a.sevRank;
    if (b.dominantBonus !== a.dominantBonus) return b.dominantBonus - a.dominantBonus;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return axes.indexOf(a.axis) - axes.indexOf(b.axis);
  });

  return scored[0].axis;
}

/** Single sentence; stage sharpens outcome without new reasoning. */
function lineFor(axis: PrimaryConstraintAxis, dominant: DiagnosisStage): string {
  if (axis === "speed") {
    if (dominant === "landing") return "Slow loading is limiting initial engagement.";
    if (dominant === "interaction") return "Slow loading is limiting user flow once people start moving.";
    return "Slow loading is limiting progress as people approach completion.";
  }
  if (axis === "interaction") {
    if (dominant === "landing") return "Laggy responses are limiting early engagement.";
    if (dominant === "interaction") return "Interaction responsiveness is limiting user engagement.";
    return "Laggy responses are limiting confidence at completion.";
  }
  if (dominant === "landing") return "An inconsistent feel is limiting first-impression confidence.";
  if (dominant === "interaction") return "An inconsistent feel is limiting smooth flow.";
  return "Instability at key moments is limiting conversion confidence.";
}

/**
 * Returns exactly one plain-English sentence.
 */
export function presentPrimaryConstraint(input: PrimaryConstraintPresentationInput): string {
  const axis = strongestConstraintAxis(input);
  return lineFor(axis, input.dominantStage);
}
