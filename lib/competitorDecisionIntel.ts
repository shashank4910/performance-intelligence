import type { CompetitorAnalysisOutput } from "@/engine/competitorAnalysis";

export type CompetitivePressure = "LOW" | "MEDIUM" | "HIGH";

export type CompetitorDecisionIntel = {
  /** Primary decision headline — no raw metrics */
  decisionHeadline: string;
  /** Optional one-line context (e.g. multi set) */
  contextLine: string | null;
  /** Gap diagnosis — first impression, interaction, drop-off */
  gapBullets: [string, string, string];
  /** Why this matters commercially */
  businessLink: string;
  /** Revenue signal line (optional, avoids repetition when negligible) */
  revenueSignalLine: string | null;
  competitivePressure: CompetitivePressure;
  /** Exactly three prioritized actions */
  prioritizedActions: [string, string, string];
};

function effectiveGapScore(result: CompetitorAnalysisOutput): number {
  if (result.mode === "head_to_head" && result.comparison) {
    if (result.comparison.status === "similar") return 0;
    return Math.abs(result.comparison.gap_score ?? 0);
  }
  if (result.mode === "multi" && typeof result.performance_gap_score === "number") {
    return result.performance_gap_score;
  }
  return 0;
}

function isUserBehind(result: CompetitorAnalysisOutput): boolean {
  if (result.mode === "head_to_head") {
    return result.comparison?.status === "slower";
  }
  return (result.competitor_summary?.faster_competitors ?? 0) > 0;
}

function isUserAhead(result: CompetitorAnalysisOutput): boolean {
  if (result.mode === "head_to_head") {
    return result.comparison?.status === "faster";
  }
  const s = result.competitor_summary;
  if (!s) return false;
  return (
    s.faster_competitors === 0 && s.slower_competitors + s.faster_competitors > 0
  );
}

function competitivePressureFromGap(gap: number, behind: boolean): CompetitivePressure {
  if (!behind || gap <= 0) return "LOW";
  if (gap > 0.12) return "HIGH";
  if (gap > 0.04) return "MEDIUM";
  return "LOW";
}

function behindHeadlineFromDominant(label: CompetitorAnalysisOutput["dominant_driver"]["label"]): string {
  if (label === "First impression speed") {
    return "You are losing users at the start because your site loads slower than the competitor";
  }
  if (label === "Interaction delay") {
    return "You are losing users during key actions because your page responds slower than the competitor";
  }
  return "You are losing users on important steps because the screen shifts while people act";
}

function revenueSignalLine(result: CompetitorAnalysisOutput): string | null {
  const r = result.competitive_risk?.monthly_risk;
  if (r == null || !Number.isFinite(r) || r <= 0) return null;
  if (r < 50) {
    return "Revenue signal sits below a material threshold for this comparison; address experience first.";
  }
  const rounded = Math.round(r);
  return `Directional revenue at stake from this comparison: about $${rounded.toLocaleString("en-US")} / month (estimate, not a guarantee).`;
}

export function buildCompetitorDecisionIntel(result: CompetitorAnalysisOutput): CompetitorDecisionIntel {
  const gap = effectiveGapScore(result);
  const behind = isUserBehind(result);
  const ahead = isUserAhead(result);
  const similarH2H =
    result.mode === "head_to_head" && result.comparison?.status === "similar";
  const multiTied =
    result.mode === "multi" &&
    !!result.competitor_summary &&
    result.competitor_summary.faster_competitors === 0 &&
    result.competitor_summary.slower_competitors === 0;
  const pressure = competitivePressureFromGap(gap, behind);

  let decisionHeadline: string;
  let contextLine: string | null = null;

  if (multiTied) {
    decisionHeadline = "The field is tied on perceived speed";
    contextLine = "No clear leader in this set — conversions will swing on offer, trust, and friction, not incremental speed.";
  } else if (behind) {
    decisionHeadline = behindHeadlineFromDominant(result.dominant_driver.label);
    if (result.mode === "multi" && result.competitor_summary) {
      const { faster_competitors, slower_competitors } = result.competitor_summary;
      const total = faster_competitors + slower_competitors;
      if (total > 0) {
        contextLine = `In this comparison, ${faster_competitors} of ${total} alternatives load or respond faster than your site.`;
      }
    }
  } else if (ahead) {
    decisionHeadline = "You have a speed advantage — protect it or lose it fast";
    if (result.mode === "multi") {
      contextLine = "You lead this set; convert attention before competitors close the speed gap.";
    }
  } else if (similarH2H) {
    decisionHeadline = "Speed is not deciding outcomes in this head-to-head";
    contextLine = "Perceived performance is close enough that offer, trust, and onboarding will swing conversions.";
  } else {
    decisionHeadline = "Speed is not the primary shortfall here";
    contextLine = "You’re not clearly behind on first-load experience versus this set — compete on clarity and conversion mechanics.";
  }

  let gapBullets: [string, string, string];
  if (multiTied) {
    gapBullets = [
      "First-impression speed: the pack looks similar — differentiation comes from clarity and proof, not milliseconds.",
      "Interaction delay: early flows feel comparable; win on who explains value fastest.",
      "Layout stability: shifts here matter less than message-market fit until one side pulls ahead on speed.",
    ];
  } else if (behind) {
    gapBullets = [
      "First-impression speed: a slower opening sends attention to alternatives before your value lands — bounce rises in the first seconds.",
      "Interaction delay: sluggish taps and scrolls cool intent mid-flow, so visitors open competitor tabs before checkout.",
      "Layout stability: shifting chrome during signup or checkout forces rework — carts abandon when steps feel broken.",
    ];
  } else if (ahead) {
    gapBullets = [
      "First-impression speed: fast paint holds attention → visitors stay long enough to read value.",
      "Interaction delay: quick taps sustain intent → users finish tasks instead of tab-switching.",
      "Layout stability: stable chrome on signup/checkout → fewer abandon mid-step.",
    ];
  } else {
    gapBullets = [
      "First-impression speed: neither side dominates the opening seconds — brand and message carry more weight.",
      "Interaction delay: early friction feels comparable; revenue moves on clarity and proof.",
      "Layout stability: neither side shows a clear layout disadvantage — offer fit decides outcomes.",
    ];
  }

  let businessLink: string;
  if (multiTied) {
    businessLink =
      "When everyone feels ‘fast enough,’ buyers default to who they understand fastest and trust most. Win on proof, pricing clarity, and a shorter path to the first win.";
  } else if (behind) {
    businessLink =
      "Competitors win when the first screen feels instant and the product responds immediately — people infer quality and move forward. Most stay-or-leave decisions happen in early interactions, before deeper pages or long copy ever get read.";
  } else if (ahead) {
    businessLink =
      "Faster first paint reads as competence → trust forms earlier → revenue follows if the path to purchase is short; competitors close speed gaps on every heavy release.";
  } else {
    businessLink =
      "When perceived speed is a tie, buyers choose clarity, proof, and low friction. Invest in how you explain value and remove hesitation in the first interactions — that’s where revenue moves.";
  }

  let prioritizedActions: [string, string, string];
  if (multiTied) {
    prioritizedActions = [
      "Run one sharp value-prop test on the hero: one sentence outcome + one proof point — no extra sections.",
      "Remove one optional step in your primary conversion path this sprint (field, modal, or redirect).",
      "Add social proof or risk reversal where doubt is highest (pricing, signup, checkout).",
    ];
  } else if (behind && pressure === "HIGH") {
    prioritizedActions = [
      "Thin the first screen so primary content renders and responds first — fewer competing blocks above the fold.",
      "Defer third parties and heavy scripts until after first interaction — stop blocking scroll and tap.",
      "Re-run this comparison after each release — catch regressions before traffic amplifies them.",
    ];
  } else if (behind && pressure === "MEDIUM") {
    prioritizedActions = [
      "Measure first tap on real devices — that’s where this shortfall costs sessions.",
      "Push non-critical assets below the fold so the opening path stays fast on real networks.",
      "Walk one critical funnel step end-to-end after each change — catch breakage before spend scales.",
    ];
  } else if (behind && pressure === "LOW") {
    prioritizedActions = [
      "Shorten the path to first meaningful paint — narrow shortfalls compound into lost trials.",
      "Remove one blocker that runs before the user can act — scripts, redirects, or oversized hero assets.",
      "Re-run comparison after the change — confirm you’re not still trailing faster sites.",
    ];
  } else if (ahead) {
    prioritizedActions = [
      "Require a mobile smoke test on first screen and first tap before every release — prevent regressions.",
      "Watch bundle and third-party count — extra tools silently narrow your speed lead.",
      "If conversion lags while speed leads, fund offer, proof, and checkout friction — not more speed work.",
    ];
  } else {
    prioritizedActions = [
      "Tighten hero copy and pricing clarity — when speed ties, comprehension speed decides revenue.",
      "Cut optional steps on the path to first purchase or signup — each step taxes conversion.",
      "Test proof and guarantees where doubt is highest before funding marginal speed work.",
    ];
  }

  return {
    decisionHeadline,
    contextLine,
    gapBullets,
    businessLink,
    revenueSignalLine: revenueSignalLine(result),
    competitivePressure: multiTied ? "LOW" : behind ? pressure : "LOW",
    prioritizedActions,
  };
}
