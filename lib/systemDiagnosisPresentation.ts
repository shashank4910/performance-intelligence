/**
 * Presentation only: maps structured diagnosis input (already computed upstream) to plain text.
 * No metric names, numbers, or second-guessing of dominantStage / severity.
 */

export type DiagnosisStage = "landing" | "interaction" | "conversion";

export type DiagnosisBand = "low" | "medium" | "high";

export type SystemDiagnosisPresentationInput = {
  dominantStage: DiagnosisStage;
  secondaryStage?: DiagnosisStage;
  severity: {
    speed: DiagnosisBand;
    interaction: DiagnosisBand;
    stability: DiagnosisBand;
  };
  confidence: DiagnosisBand;
};

type Axis = "speed" | "interaction" | "stability";

const WHERE: Record<DiagnosisStage, string> = {
  landing: "Users are dropping before seeing or understanding the product",
  interaction: "Users are dropping while trying to interact or engage",
  conversion: "Users are hesitating before completing actions",
};

const CAUSE_HIGH: Record<Axis, string> = {
  speed: "slow loading",
  interaction: "slow or unresponsive interactions",
  stability: "an inconsistent or unstable experience",
};

const CAUSE_MEDIUM: Record<Axis, string> = {
  speed: "slow loading",
  interaction: "interactions that do not feel snappy enough",
  stability: "an inconsistent experience",
};

const IMPACT: Record<DiagnosisStage, string> = {
  landing: "This is limiting early engagement.",
  interaction: "This is reducing meaningful engagement.",
  conversion: "This is affecting conversions.",
};

function axisOrderForDominant(d: DiagnosisStage): Axis[] {
  if (d === "landing") return ["speed", "interaction", "stability"];
  if (d === "interaction") return ["interaction", "speed", "stability"];
  return ["stability", "interaction", "speed"];
}

function causesByBand(
  severity: SystemDiagnosisPresentationInput["severity"],
  order: Axis[]
): { highs: string[]; mediums: string[] } {
  const highs: string[] = [];
  const mediums: string[] = [];
  for (const a of order) {
    if (severity[a] === "high") highs.push(CAUSE_HIGH[a]);
  }
  for (const a of order) {
    if (severity[a] === "medium") mediums.push(CAUSE_MEDIUM[a]);
  }
  return { highs, mediums };
}

function joinCauses(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases[0]}, ${phrases[1]}, and ${phrases[2]}`;
}

/**
 * Returns only the diagnosis string (≤2 sentences). Trusts `dominantStage` and `severity` as given.
 */
export function presentSystemDiagnosis(input: SystemDiagnosisPresentationInput): string {
  const { dominantStage, severity } = input;
  const where = WHERE[dominantStage];
  const order = axisOrderForDominant(dominantStage);
  const { highs, mediums } = causesByBand(severity, order);
  const impact = IMPACT[dominantStage];

  const allMedium =
    severity.speed === "medium" && severity.interaction === "medium" && severity.stability === "medium";
  if (allMedium) {
    return "Friction shows up across loading, interaction, and stability in similar measure. You still notice it during routine use.";
  }

  const allLow =
    severity.speed === "low" && severity.interaction === "low" && severity.stability === "low";
  if (allLow) {
    return `${where}. The rest of the journey looks comparatively calm, so keep guarding what already works.`;
  }

  let first: string;
  if (highs.length > 0) {
    first = `${where} due to ${joinCauses(highs)}.`;
  } else if (mediums.length > 0) {
    first = `${where}, partly because of ${joinCauses(mediums)}.`;
  } else {
    first = `${where}.`;
  }

  return `${first} ${impact}`;
}
