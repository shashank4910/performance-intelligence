import type { WhatThisMeansSignals } from "@/lib/whatThisMeansSignals";
import {
  pickFinalDecisionPhrase,
  pickWhatThisMeansFirst,
  pickWhatThisMeansInteraction,
  pickWhatThisMeansLayout,
  type FinalSummaryIntent,
  type FirstImpressionIntent,
  type InteractionIntent,
  type LayoutIntent,
} from "@/lib/competitorPhrasePools";

function toFirstIntent(s: WhatThisMeansSignals["first_impression"]): FirstImpressionIntent {
  if (s === "fast") return "fast";
  if (s === "slow") return "slow";
  return "similar";
}

function toInteractionIntent(s: WhatThisMeansSignals["interaction"]): InteractionIntent {
  if (s === "smooth") return "fast";
  if (s === "delayed") return "slow";
  return "similar";
}

function toLayoutIntent(s: WhatThisMeansSignals["layout"]): LayoutIntent {
  if (s === "stable") return "stable";
  if (s === "unstable") return "unstable";
  return "similar";
}

function toFinalIntent(p: WhatThisMeansSignals["position"]): FinalSummaryIntent {
  if (p === "advantage") return "advantage";
  if (p === "behind") return "disadvantage";
  return "neutral";
}

/**
 * Deterministic copy when AI is off or fails. Same structure as the LLM output.
 */
export function buildWhatThisMeansFallback(signals: WhatThisMeansSignals, siteKey: string): string {
  const seed = siteKey.trim() || "unknown";
  const l1 = pickWhatThisMeansFirst(seed, toFirstIntent(signals.first_impression));
  const l2 = pickWhatThisMeansInteraction(seed, toInteractionIntent(signals.interaction));
  const l3 = pickWhatThisMeansLayout(seed, toLayoutIntent(signals.layout));
  const closing = pickFinalDecisionPhrase(seed, toFinalIntent(signals.position));
  return `WHAT THIS MEANS

1. ${l1}

2. ${l2}

3. ${l3}

${closing}`;
}
