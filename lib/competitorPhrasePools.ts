/**
 * Structured phrase pools for competitor analysis copy (deterministic pick, no RNG).
 * Selection seed: siteKey | module | state | severity | intent
 * index = phrasePoolHash(seed) % pool.length (djb2; same as before)
 */

export type PhraseModule = "competitive_position" | "revenue_exposure" | "what_this_means";

export type PhraseState = "ahead" | "behind" | "similar";

export type PhraseSeverity = "low" | "medium" | "high";

export type PhraseIntent = "explain" | "impact" | "action" | "bridge";

export type PhraseLength = "short" | "medium" | "long";

/** @deprecated Prefer PhraseModule / structured dimensions */
export type WhyMattersIntent =
  | "high_negative"
  | "medium_negative"
  | "low_negative"
  | "neutral"
  | "backend_calm";

export type FirstImpressionIntent = "fast" | "slow" | "similar";
export type InteractionIntent = "fast" | "slow" | "similar";
export type LayoutIntent = "stable" | "unstable" | "similar";
export type SummaryTableIntent = "neutral_no_weakness" | "neutral_minor_gap";
export type FinalSummaryIntent = "advantage" | "disadvantage" | "neutral";

/** PHRASE_POOL[module][state][severity][intent] = one line variants (short); multi-line via length */
export type StructuredPhrasePool = {
  [M in PhraseModule]: {
    [S in PhraseState]: {
      [V in PhraseSeverity]: {
        [I in PhraseIntent]: readonly string[];
      };
    };
  };
};

/** djb2 → non-negative int for modulo */
export function phrasePoolHash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return h >>> 0;
}

export function pickFromPool(seed: string, pool: readonly string[]): string {
  if (pool.length === 0) return "";
  const idx = phrasePoolHash(seed) % pool.length;
  return pool[idx]!;
}

/** Deterministic 5-part key (replaces siteKey | factor | intent). */
export function selectionSeed(
  siteKey: string,
  module: PhraseModule,
  state: PhraseState,
  severity: PhraseSeverity,
  intent: PhraseIntent
): string {
  return `${siteKey}|${module}|${state}|${severity}|${intent}`;
}

const FI_NEUTRAL: readonly string[] = [
  "The page loads at about the same speed as the other site.",
  "People see content at a similar time on both pages.",
  "There is no clear difference in loading speed at the start.",
  "The first screen feels equally fast on both sites.",
  "Loading at the start looks similar across both pages.",
];

const WI_NEUTRAL: readonly string[] = [
  "When people click or scroll, the page feels smooth.",
  "Interaction speed is similar to the other site.",
  "The page responds at about the same speed.",
  "There is no clear difference when using the page.",
  "Both pages feel equally responsive during use.",
];

const WL_NEUTRAL: readonly string[] = [
  "The page stays stable while loading.",
  "Content does not move during normal use.",
  "The screen feels steady while people use it.",
  "There is no unexpected movement on the page.",
  "Users can interact without anything shifting around.",
];

const WHY_FIRST: Record<WhyMattersIntent, readonly string[]> = {
  high_negative: [
    "People wait too long before anything useful shows, so many leave early.",
    "The page takes time to show content, and visitors lose interest quickly.",
    "Nothing useful appears at the start, so people leave before it loads.",
    "The page starts very slowly, and many users do not stay.",
    "Visitors wait at the beginning and may leave before seeing your content.",
  ],
  medium_negative: [
    "There is a clear delay before content appears, which can reduce interest.",
    "People wait a bit before the page becomes useful, and some may leave.",
    "The page takes time to load, and it may not feel fast enough.",
    "Content shows a little late, which can affect engagement.",
    "Visitors notice a delay at the start and may interact less.",
  ],
  low_negative: [
    "There is a small delay, but most people will still continue.",
    "The page starts slightly slower, but it still feels acceptable.",
    "Content appears a bit late, but it does not affect most users.",
    "The delay is minor and unlikely to make people leave.",
    "The start is a little slow, but overall it feels fine.",
  ],
  neutral: FI_NEUTRAL,
  backend_calm: FI_NEUTRAL,
};

const WHY_INTERACTION: Record<WhyMattersIntent, readonly string[]> = {
  high_negative: [
    "When people click or scroll, the page responds slowly, so they may stop using it.",
    "Buttons and menus take time to react, which can frustrate users.",
    "Simple actions feel slow, and people may not continue.",
    "The page does not respond quickly, which makes it hard to use.",
    "Users wait after clicking, and this can make them leave.",
  ],
  medium_negative: [
    "Clicks and scrolls are slower than expected, which affects the experience.",
    "The page responds with a delay, and users may notice it.",
    "Moving around feels a bit slow during normal use.",
    "People feel some delay when they try to use the page.",
    "The page does not react quickly, which can reduce engagement.",
  ],
  low_negative: [
    "There is a small delay when clicking, but most people will not notice.",
    "Interaction feels almost normal with a slight wait.",
    "The page responds well enough for most simple actions.",
    "There is a small pause, but it does not affect usage much.",
    "The delay is minor and easy to ignore.",
  ],
  neutral: WI_NEUTRAL,
  backend_calm: WI_NEUTRAL,
};

const WHY_LAYOUT: Record<WhyMattersIntent, readonly string[]> = {
  high_negative: [
    "The page moves while loading, which can confuse people and cause mistakes.",
    "Buttons shift on the screen, so users may click the wrong thing.",
    "Content moves while people try to use it, which feels unstable.",
    "The screen keeps changing, making it hard to trust the page.",
    "Layout changes during use, which can make users leave.",
  ],
  medium_negative: [
    "Some parts of the page move, which can distract users.",
    "There is some movement while loading, which people may notice.",
    "The layout is not fully stable, which affects the experience.",
    "Small shifts happen during use and can feel annoying.",
    "The page feels less steady compared to other sites.",
  ],
  low_negative: [
    "There is a small amount of movement, but most people are fine with it.",
    "The page shifts a little but remains usable.",
    "Minor movement happens, but it does not affect most users.",
    "The layout is mostly stable with small changes.",
    "Small shifts exist but are hard to notice.",
  ],
  neutral: WL_NEUTRAL,
  backend_calm: WL_NEUTRAL,
};

const WHY_BACKEND: Record<WhyMattersIntent, readonly string[]> = {
  high_negative: [
    "The page takes a long time to start loading, so users may leave early.",
    "Nothing shows for a while, which makes people lose patience.",
    "Each page load feels slow, and users may not continue.",
    "The site takes time to respond, which delays everything.",
    "Users wait too long at the start, which affects engagement.",
  ],
  medium_negative: [
    "Pages take longer to start compared to other sites.",
    "There is a delay before content appears, which users notice.",
    "Each page load has a short but clear wait.",
    "The site takes time to respond at the start.",
    "Users feel a delay before the page becomes visible.",
  ],
  low_negative: [
    "There is a small wait at the start, but most people will not mind.",
    "The page starts slightly slower, but it still feels okay.",
    "The delay is minor and does not affect most users.",
    "There is a short wait before content appears.",
    "The start is slightly slower but still acceptable.",
  ],
  neutral: [
    "The page starts loading at about the same speed as the other site.",
    "The wait time at the beginning feels similar on both pages.",
    "There is no clear difference in start speed.",
    "Both pages begin loading at about the same time.",
    "Start speed looks even across both sites.",
  ],
  backend_calm: [
    "This is not causing any delay right now.",
    "The page starts quickly and feels fine.",
    "There is no waiting problem at the start.",
    "Everything loads fast enough at the beginning.",
    "Start speed is good and not an issue.",
  ],
};

const WTM_FIRST: Record<FirstImpressionIntent, readonly string[]> = {
  fast: [
    "Your page shows useful content sooner when it opens, so visitors reach your main message in less time.",
    "People see your main screen earlier than on the other page, so more users stay through the first moments.",
    "Important content appears first on your page, so new visitors start their task before interest drops.",
    "Your first screen completes before the competitor’s page does, so users wait less at the very beginning.",
    "The visit starts with less empty time on your page, so attention stays on your site instead of drifting away.",
  ],
  slow: [
    "Your page takes longer before useful content shows, so some users leave before they read your offer.",
    "People wait more at the very start on your page, so fewer visitors reach the next step.",
    "The first screen arrives slower than on the other page, so some visitors assume the site is broken or slow.",
    "Useful content shows later when your page opens, so the opening moments cost you engaged sessions.",
    "The visit starts with more waiting on your page, so many users never get to your main content.",
  ],
  similar: [
    "Both pages show the first useful content at about the same time, so neither side clearly wins the opening.",
    "The first screen arrives at about the same pace on both pages, so speed alone does not decide this comparison.",
    "Neither page clearly leads on how fast the first content appears, so other factors decide who keeps users.",
    "Opening speed is even between the two pages, so visitors get a similar first experience either way.",
    "The start of the visit is tied on both pages, so the first screen does not give either side a clear edge.",
  ],
};

const WTM_INTERACTION: Record<InteractionIntent, readonly string[]> = {
  fast: [
    "Clicks and scrolls get a faster response on your page, so people move through tasks without extra waiting.",
    "Buttons react sooner when people use your page, so everyday actions complete in fewer steps.",
    "The page keeps up with taps and drags, so users do not stack repeated clicks or abandon the flow.",
    "Small actions return quicker on your page, so sessions stay on task instead of stalling mid-step.",
    "Your page answers gestures with less delay, so users stay in control during normal browsing.",
  ],
  slow: [
    "The page answers clicks and scrolls more slowly here, so users stall mid-task or open another tab.",
    "People wait after each tap or scroll on your page, so attention drops before they finish the action.",
    "Buttons and menus respond late on your side, so simple tasks take more patience and some users quit.",
    "Moving through the page does not stay quick here, so users may tap again or leave the flow.",
    "Everyday use runs slower on your page than on the competitor’s, so the same actions cost more time.",
  ],
  similar: [
    "Both pages respond at about the same speed to clicks and scrolls, so neither side is clearly snappier.",
    "Taps and drags return at a similar pace on both pages, so day-to-day use is even.",
    "Feedback speed matches between the two pages, so users cannot tell which one reacts faster.",
    "Clicking and scrolling stay balanced across both pages, so routine use does not favor one side.",
    "Response time is even here and on the other page, so interaction speed is not the differentiator.",
  ],
};

const WTM_LAYOUT: Record<LayoutIntent, readonly string[]> = {
  stable: [
    "The screen moves less while things load on your page, so people tap where they intend to tap.",
    "Text and buttons stay put on your side, so reading and clicking stay calmer on key steps.",
    "The page jumps less during normal use here, so signup and checkout paths see fewer mistakes.",
    "Fewer sudden shifts show on your screen, so the layout stays predictable while users work.",
    "Updates disturb the view less on your page, so users spend less time correcting wrong taps.",
  ],
  unstable: [
    "Parts of the page move while people read or tap here, so mistakes and extra clicks increase.",
    "Buttons or text slide under the finger on your page, so users hit the wrong target and back up.",
    "The view jumps more during normal use on your side, so trust drops while the layout shifts.",
    "On-screen blocks hop more often on your page, so keeping track of the task gets harder.",
    "Content shifts in a choppy way on your end, so some visitors quit when the screen keeps changing.",
  ],
  similar: [
    "Both pages move about the same amount during use, so neither screen is clearly steadier.",
    "Layout motion is even between the two pages, so stability is not the edge here.",
    "Shifts during load stay close on both pages, so neither side clearly wins on calm layout.",
    "Reading and tapping stay evenly matched for stability, so neither page is much easier to follow.",
    "Layout motion sits in the middle between both pages, so visitors get a similar experience from movement.",
  ],
};

const FINAL_ADVANTAGE: readonly string[] = [
  "Overall your page is faster than the competitor in this check. Visitors spend less time waiting during the visit, so more sessions reach your content and actions. That protects attention and trials when users compare you side by side with other sites. Re-check speed after each major change so you keep this lead.",
  "You are ahead on speed when the scores are added up. People clear the first screens and responses in less time, so they drop off less often in the opening steps. That usually supports signups, purchases, and return visits more than a slower rival. Watch heavy images and extra scripts when you ship so you do not give the gap back.",
  "Speed is on your side for this comparison. Shorter waits on load and interaction mean users finish more steps in the same visit. For many products, that directly affects how many people become customers. Test on phones and slower networks whenever you change the site so the advantage holds in real conditions.",
  "Your page shows a clear speed edge here. Waiting stays lower for your visitors than on the other page, so you keep a practical advantage in busy sessions. Competitors can close that gap with their own releases, so treat speed as something to defend on every deploy. Prioritize fixes that protect first screen and first tap before scaling traffic.",
];

const FINAL_DISADVANTAGE: readonly string[] = [
  "Overall your page is slower than the competitor in this check. Extra waiting at the start and during use means more people leave before they engage or buy. That directly reduces how many users you can convert from the same traffic. Fix the slowest load and tap moments first, then run this comparison again.",
  "When everything is counted, the other page finishes tasks in less time than yours. Visitors spend more of each visit waiting, so sessions break off before checkout or signup. That puts revenue and growth at risk whenever you compete for the same audience. Lighten the first screens and slow interactions before you spend more on acquisition.",
  "You are behind on speed for this snapshot. Small delays add up across one visit, so users notice delay even when no single step seems extreme. That often costs trials and sales when a faster site is one tab away. Close the biggest gaps on load and tap, then confirm the change with another check.",
  "The competitor’s page moves faster from start to finish in this comparison. People on your site wait longer at each step, so you lose attention to alternatives that respond sooner. Over time that shows up in fewer completed goals from the same visits. Narrow the gap starting from your main entry path, then re-measure.",
];

const FINAL_NEUTRAL: readonly string[] = [
  "Overall, both sites perform at a similar level on speed in this check. Users wait about the same amount at the start and during key actions, so neither side clearly wins on performance alone. Outcomes will depend more on offer, trust, and how easy the path to purchase is. Invest in clarity and conversion before you chase marginal speed gains.",
  "Speed is effectively tied between your page and the competitor here. Visitors get a comparable experience on load and interaction, so performance is not the main reason someone would choose one site over the other. Revenue moves when message, proof, and flow line up with what buyers need. Focus product and copy before opening large speed projects.",
  "Neither page shows a strong speed advantage in this comparison. Waiting times line up closely enough that users are unlikely to pick a winner on speed alone. Business results will swing on who explains value faster and removes doubt in the first interactions. Tighten funnel steps and proof where purchase risk is highest.",
];

const SUMMARY_NO_BEHIND_BROAD: readonly string[] = [
  "No clear weakness — performance is similar across all areas.",
  "No major issue stands out in this comparison.",
  "Everything looks balanced between both sites.",
  "No part clearly performs worse here.",
  "Overall performance is even across these factors.",
];

const SUMMARY_NO_BEHIND_CLOSE: readonly string[] = [
  "No major gaps — performance is close across all areas.",
  "Differences are small and not very important.",
  "Both sites perform at a similar level.",
  "There is no strong advantage or disadvantage.",
  "Performance is close across all factors.",
];

/**
 * Dashboard "Revenue Exposure" card — severity-tiered copy only (no layout).
 * Low tier: no drop / leave / friction / loss / “delays impacting conversions”.
 */
export const REVENUE_EXPOSURE_CARD_POOL: Record<
  PhraseSeverity,
  { primary: readonly string[]; secondary: readonly string[] }
> = {
  high: {
    primary: [
      "Performance issues are impacting conversions, and users are likely dropping before they finish.",
      "Users are likely dropping before they convert, and performance issues are impacting conversions.",
      "Performance issues are impacting conversions. Users are likely dropping on the steps that matter.",
    ],
    secondary: [
      "We can estimate how much revenue this is costing you using your actual traffic and conversion data.",
    ],
  },
  medium: {
    primary: [
      "Some users may experience delays on the paths that matter most.",
      "There may be a minor impact on conversions from current performance patterns.",
      "Some users may experience delays, and there may be a minor impact on conversions.",
    ],
    secondary: [
      "We can estimate how much revenue this is costing you using your actual traffic and conversion data.",
    ],
  },
  low: {
    primary: [
      "Your site is performing well. There are no major performance issues affecting conversions.",
    ],
    secondary: [
      "You can still use your real data to check for smaller improvements.",
    ],
  },
};

/** Deterministic dashboard card lines: siteKey | revenue_exposure | card | severity | line */
export function pickRevenueExposureCardCopy(
  siteKey: string,
  severity: PhraseSeverity
): { primary: string; secondary: string } {
  const tier = REVENUE_EXPOSURE_CARD_POOL[severity];
  const pSeed = `${siteKey}|revenue_exposure|card|${severity}|primary`;
  const sSeed = `${siteKey}|revenue_exposure|card|${severity}|secondary`;
  return {
    primary: pickFromPool(pSeed, tier.primary),
    secondary: pickFromPool(sSeed, tier.secondary),
  };
}

type NegTier = "high_negative" | "medium_negative" | "low_negative";

function whyTierFromImpact(impact: "High" | "Medium" | "Low"): NegTier {
  if (impact === "High") return "high_negative";
  if (impact === "Medium") return "medium_negative";
  return "low_negative";
}

/** Snapshot table factor → intent column (disambiguates 5-part seed per row). */
export function factorToPhraseIntent(factor: string): PhraseIntent {
  switch (factor) {
    case "First impression speed":
      return "explain";
    case "Interaction readiness":
      return "impact";
    case "User drop-off risk":
      return "action";
    case "Backend response":
      return "bridge";
    default:
      return "explain";
  }
}

type SnapshotPosition = "Behind" | "Ahead" | "Similar";

function snapshotPositionToState(position?: SnapshotPosition): PhraseState {
  if (position === "Behind") return "behind";
  if (position === "Ahead") return "ahead";
  return "similar";
}

type WhyItMattersRow = {
  factor: string;
  impact: "High" | "Medium" | "Low";
  position?: SnapshotPosition;
};

function rowToStateSeverity(row: WhyItMattersRow): { state: PhraseState; severity: PhraseSeverity } {
  if (row.factor === "Backend response" && row.impact === "Low") {
    return { state: "similar", severity: "low" };
  }
  const state = snapshotPositionToState(row.position);
  const severity: PhraseSeverity =
    row.impact === "High" ? "high" : row.impact === "Medium" ? "medium" : "low";
  return { state, severity };
}

function behindBlock(
  tier: NegTier
): Record<PhraseIntent, readonly string[]> {
  return {
    explain: WHY_FIRST[tier],
    impact: WHY_INTERACTION[tier],
    action: WHY_LAYOUT[tier],
    bridge: WHY_BACKEND[tier],
  };
}

function neutralBlock(
  explainPool: readonly string[],
  impactPool: readonly string[],
  actionPool: readonly string[],
  bridgePool: readonly string[]
): Record<PhraseIntent, readonly string[]> {
  return {
    explain: explainPool,
    impact: impactPool,
    action: actionPool,
    bridge: bridgePool,
  };
}

/** Full tree: competitive rows use factor → intent column; snapshot summary uses revenue_exposure. */
export const PHRASE_POOL: StructuredPhrasePool = {
  competitive_position: {
    behind: {
      high: behindBlock("high_negative"),
      medium: behindBlock("medium_negative"),
      low: behindBlock("low_negative"),
    },
    ahead: {
      high: neutralBlock(FI_NEUTRAL, WI_NEUTRAL, WL_NEUTRAL, WHY_BACKEND.neutral),
      medium: neutralBlock(FI_NEUTRAL, WI_NEUTRAL, WL_NEUTRAL, WHY_BACKEND.neutral),
      low: neutralBlock(FI_NEUTRAL, WI_NEUTRAL, WL_NEUTRAL, WHY_BACKEND.neutral),
    },
    similar: {
      high: neutralBlock(FI_NEUTRAL, WI_NEUTRAL, WL_NEUTRAL, WHY_BACKEND.neutral),
      medium: neutralBlock(FI_NEUTRAL, WI_NEUTRAL, WL_NEUTRAL, WHY_BACKEND.neutral),
      low: {
        explain: FI_NEUTRAL,
        impact: WI_NEUTRAL,
        action: WL_NEUTRAL,
        bridge: WHY_BACKEND.backend_calm,
      },
    },
  },
  revenue_exposure: {
    ahead: {
      high: { explain: [], impact: [], action: [], bridge: [] },
      medium: { explain: [], impact: [], action: [], bridge: [] },
      low: { explain: [], impact: [], action: [], bridge: [] },
    },
    behind: {
      high: { explain: [], impact: [], action: [], bridge: [] },
      medium: { explain: [], impact: [], action: [], bridge: [] },
      low: { explain: [], impact: [], action: [], bridge: [] },
    },
    similar: {
      high: { explain: [], impact: [], action: [], bridge: [] },
      medium: {
        explain: SUMMARY_NO_BEHIND_CLOSE,
        impact: [],
        action: [],
        bridge: [],
      },
      low: {
        explain: SUMMARY_NO_BEHIND_BROAD,
        impact: [],
        action: [],
        bridge: [],
      },
    },
  },
  what_this_means: {
    ahead: {
      high: {
        explain: WTM_FIRST.fast,
        impact: WTM_INTERACTION.fast,
        action: WTM_LAYOUT.stable,
        bridge: FINAL_ADVANTAGE,
      },
      medium: {
        explain: WTM_FIRST.fast,
        impact: WTM_INTERACTION.fast,
        action: WTM_LAYOUT.stable,
        bridge: FINAL_ADVANTAGE,
      },
      low: {
        explain: WTM_FIRST.fast,
        impact: WTM_INTERACTION.fast,
        action: WTM_LAYOUT.stable,
        bridge: FINAL_ADVANTAGE,
      },
    },
    behind: {
      high: {
        explain: WTM_FIRST.slow,
        impact: WTM_INTERACTION.slow,
        action: WTM_LAYOUT.unstable,
        bridge: FINAL_DISADVANTAGE,
      },
      medium: {
        explain: WTM_FIRST.slow,
        impact: WTM_INTERACTION.slow,
        action: WTM_LAYOUT.unstable,
        bridge: FINAL_DISADVANTAGE,
      },
      low: {
        explain: WTM_FIRST.slow,
        impact: WTM_INTERACTION.slow,
        action: WTM_LAYOUT.unstable,
        bridge: FINAL_DISADVANTAGE,
      },
    },
    similar: {
      high: {
        explain: WTM_FIRST.similar,
        impact: WTM_INTERACTION.similar,
        action: WTM_LAYOUT.similar,
        bridge: FINAL_NEUTRAL,
      },
      medium: {
        explain: WTM_FIRST.similar,
        impact: WTM_INTERACTION.similar,
        action: WTM_LAYOUT.similar,
        bridge: FINAL_NEUTRAL,
      },
      low: {
        explain: WTM_FIRST.similar,
        impact: WTM_INTERACTION.similar,
        action: WTM_LAYOUT.similar,
        bridge: FINAL_NEUTRAL,
      },
    },
  },
};

export function getPool(
  module: PhraseModule,
  state: PhraseState,
  severity: PhraseSeverity,
  intent: PhraseIntent
): readonly string[] {
  return PHRASE_POOL[module][state][severity][intent] ?? [];
}

/**
 * Pick copy using the 5-part seed; supports multi-line output for medium/long where pools hold single-line items.
 * Bridge closing paragraphs (what_this_means) use one pool entry even for long (multi-sentence paragraph).
 */
export function pickStructuredPhrase(
  siteKey: string,
  module: PhraseModule,
  state: PhraseState,
  severity: PhraseSeverity,
  intent: PhraseIntent,
  length: PhraseLength = "short",
  opts?: { paragraphMode?: boolean }
): string {
  const base = selectionSeed(siteKey, module, state, severity, intent);
  let pool = getPool(module, state, severity, intent);
  if (pool.length === 0) {
    const fb = getPool(module, state, "low", intent);
    pool = fb.length > 0 ? fb : getPool(module, "similar", "low", intent);
  }

  if (pool.length === 0) return "";

  const paragraphMode =
    opts?.paragraphMode ?? (module === "what_this_means" && intent === "bridge");

  const useParagraphSingle =
    paragraphMode || pool.some((s) => s.length > 220 || s.includes("\n\n"));

  if (length === "short" || useParagraphSingle) {
    return pickFromPool(base, pool);
  }

  const n = pool.length;
  if (length === "medium") {
    const i0 = phrasePoolHash(`${base}|ln0`) % n;
    let i1 = phrasePoolHash(`${base}|ln1`) % n;
    if (n > 1 && i1 === i0) i1 = (i1 + 1) % n;
    return `${pool[i0]}\n${pool[i1]}`;
  }

  const i0 = phrasePoolHash(`${base}|ln0`) % n;
  let i1 = phrasePoolHash(`${base}|ln1`) % n;
  let i2 = phrasePoolHash(`${base}|ln2`) % n;
  if (n > 1) {
    if (i1 === i0) i1 = (i1 + 1) % n;
    if (i2 === i0 || i2 === i1) i2 = (i2 + 1) % n;
    if (i2 === i0 || i2 === i1) i2 = (i2 + 1) % n;
  }
  return `${pool[i0]}\n${pool[i1]}\n${pool[i2]}`;
}

export function whyMattersIntentForRow(row: WhyItMattersRow): WhyMattersIntent {
  if (row.factor === "Backend response" && row.impact === "Low") return "backend_calm";
  const pos = row.position ?? "Similar";
  if (pos === "Behind") return whyTierFromImpact(row.impact);
  return "neutral";
}

export function pickWhyItMattersPhrase(
  siteKey: string,
  factor: string,
  row: Parameters<typeof whyMattersIntentForRow>[0]
): string {
  const phraseIntent = factorToPhraseIntent(factor);
  if (row.factor === "Backend response" && row.impact === "Low") {
    return pickStructuredPhrase(
      siteKey,
      "competitive_position",
      "similar",
      "low",
      "bridge",
      "short",
      { paragraphMode: true }
    );
  }
  const { state, severity } = rowToStateSeverity(row);
  return pickStructuredPhrase(
    siteKey,
    "competitive_position",
    state,
    severity,
    phraseIntent,
    "short",
    { paragraphMode: true }
  );
}

export function pickWhatThisMeansFirst(siteKey: string, intent: FirstImpressionIntent): string {
  const state: PhraseState = intent === "fast" ? "ahead" : intent === "slow" ? "behind" : "similar";
  return pickStructuredPhrase(siteKey, "what_this_means", state, "medium", "explain", "short");
}

export function pickWhatThisMeansInteraction(siteKey: string, intent: InteractionIntent): string {
  const state: PhraseState = intent === "fast" ? "ahead" : intent === "slow" ? "behind" : "similar";
  return pickStructuredPhrase(siteKey, "what_this_means", state, "medium", "impact", "short");
}

export function pickWhatThisMeansLayout(siteKey: string, intent: LayoutIntent): string {
  const state: PhraseState = intent === "stable" ? "ahead" : intent === "unstable" ? "behind" : "similar";
  return pickStructuredPhrase(siteKey, "what_this_means", state, "medium", "action", "short");
}

export function pickFinalDecisionPhrase(siteKey: string, intent: FinalSummaryIntent): string {
  const state: PhraseState =
    intent === "advantage" ? "ahead" : intent === "disadvantage" ? "behind" : "similar";
  return pickStructuredPhrase(siteKey, "what_this_means", state, "medium", "bridge", "long", {
    paragraphMode: true,
  });
}

export function pickSnapshotSummaryLine(siteKey: string, intent: SummaryTableIntent): string {
  if (intent === "neutral_no_weakness") {
    return pickStructuredPhrase(siteKey, "revenue_exposure", "similar", "low", "explain", "short");
  }
  return pickStructuredPhrase(siteKey, "revenue_exposure", "similar", "medium", "explain", "short");
}
