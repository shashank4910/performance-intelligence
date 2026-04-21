"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { runImpactEngine } from "@/impactEngine";
import type { PerformanceSnapshotLike, BusinessInputs } from "@/impactEngine";
import type { ImpactEngineOutput } from "@/impactEngine/impactTypes";
import type { RevenueImpactProfile } from "./RevenueImpactCard";
import {
  computeStageMetricWeights,
  distributeRecoverableAcrossStages,
  reconcileMaxRecoverableCta,
  type RevenueStageSnapshot,
} from "@/lib/revenueStageDistribution";
import {
  BUSINESS_MODELS,
  DEFAULT_BUSINESS_MODEL_KEY,
  DEFAULT_MODEL_INPUTS,
  computeBaselineRevenue,
  type BusinessModelInputs,
} from "@/lib/impactEngine/businessModelRegistry";
import {
  behaviorMetricsMsFromSnapshotSeconds,
  computeHeadlineRevenueLeak,
} from "@/lib/headlineRevenueLeak";
import { RevenueCalculationProgress } from "./RevenueCalculationProgress";
import {
  type SensitivityMode,
  RECOVERY_FACTORS,
  validateRevenueModel,
  opportunityBoundsFromLoss,
  persistedOpportunityRange,
} from "@/lib/revenueImpactSensitivityMath";

type ProjectContext = {
  project: { id: string; url: string };
  lastSnapshot: {
    id: string;
    overallHealth: number | null;
    lcp: number | null;
    inp: number | null;
    ttfb: number | null;
    cls: number | null;
    tbt: number | null;
    /** Lab TTI (seconds), aligned with dashboard Lighthouse interactive audit. */
    tti?: number | null;
    timestamp: string;
  } | null;
};

/**
 * Human-readable monthly revenue for the results panel.
 * Uses M / K suffixes with sensible decimal places so very large numbers
 * never render as "~$52121.2k". Examples:
 *   12,500,000 -> "$12.5M/month"
 *   520,000    -> "$520K/month"
 *   52,500     -> "$53K/month"
 *   1,500      -> "$1.5K/month"
 *   240        -> "$240/month"
 */
function formatRevenueReadable(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `$${v >= 10 ? Math.round(v).toString() : v.toFixed(1)}M/month`;
  }
  if (n >= 100_000) {
    return `$${Math.round(n / 1_000)}K/month`;
  }
  if (n >= 10_000) {
    return `$${Math.round(n / 1_000)}K/month`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K/month`;
  }
  return `$${Math.round(n)}/month`;
}

/** Same as formatRevenueReadable but without the "/month" suffix — for use in ranges. */
function formatRevenueReadableAmount(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `$${v >= 10 ? Math.round(v).toString() : v.toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `$${Math.round(n / 1_000)}K`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K`;
  }
  return `$${Math.round(n)}`;
}

const MODEL_KEYS = ["ECOMMERCE", "SAAS", "CONTENT_ADS", "LEAD_GEN", "GENERAL"] as const;
/** Map shared engine model id to impactEngine package id (for runImpactEngine). */
function toImpactEngineModelId(id: string): string {
  const map: Record<string, string> = {
    ECOMMERCE: "ecommerce",
    SAAS: "saas",
    CONTENT_ADS: "media",
    LEAD_GEN: "leadgen",
    GENERAL: "ecommerce",
  };
  return map[id] ?? "ecommerce";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function formatTtiSnapshot(s: { tti?: number | null }): string {
  const tti = typeof s.tti === "number" && Number.isFinite(s.tti) && s.tti > 0 ? s.tti : null;
  return tti != null ? `${tti.toFixed(1)} s` : "—";
}

function formatInpSnapshotMs(s: { inp?: number | null }): string {
  const inpS = typeof s.inp === "number" && Number.isFinite(s.inp) && s.inp > 0 ? s.inp : null;
  return inpS != null ? `${(inpS * 1000).toFixed(0)} ms` : "—";
}

/**
 * Build a human-readable summary of the model-specific inputs used by the impact engine.
 * Renders inside the "Advanced configuration" panel as a labelled key/value list (no JSON).
 * Pure formatting helper — no calculation.
 */
function formatAdvancedSummary(
  modelId: string,
  inputs: Record<string, unknown>,
  defaults: BusinessModelInputs
): { label: string; value: string }[] {
  const fmtPercent = (v: unknown, fallback?: number): string => {
    const n = typeof v === "number" ? v : typeof fallback === "number" ? fallback : NaN;
    return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—";
  };
  const fmtMoney = (v: unknown, fallback?: number): string => {
    const n = typeof v === "number" ? v : typeof fallback === "number" ? fallback : NaN;
    return Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—";
  };
  const fmtCount = (v: unknown, fallback?: number): string => {
    const n = typeof v === "number" ? v : typeof fallback === "number" ? fallback : NaN;
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  };
  const fmtNumber = (v: unknown, fallback?: number): string => {
    const n = typeof v === "number" ? v : typeof fallback === "number" ? fallback : NaN;
    return Number.isFinite(n) ? n.toString() : "—";
  };

  const rows: { label: string; value: string }[] = [
    { label: "Monthly visitors", value: fmtCount(inputs.monthlyTraffic, defaults.monthlyTraffic) },
  ];

  switch (modelId) {
    case "ECOMMERCE":
      rows.push(
        { label: "Conversion rate", value: fmtPercent(inputs.conversionRate, defaults.conversionRate) },
        { label: "Average order value", value: fmtMoney(inputs.averageOrderValue, defaults.averageOrderValue) }
      );
      break;
    case "SAAS":
      rows.push(
        { label: "Signup conversion", value: fmtPercent(inputs.trialConversionRate, defaults.trialConversionRate) },
        { label: "Paid conversion", value: fmtPercent(inputs.paidConversionRate, defaults.paidConversionRate) },
        { label: "Subscription price", value: `${fmtMoney(inputs.subscriptionValue, defaults.subscriptionValue)}/mo` }
      );
      break;
    case "CONTENT_ADS":
      rows.push(
        { label: "Pageviews per session", value: fmtNumber(inputs.pageviewsPerSession, defaults.pageviewsPerSession) },
        { label: "RPM", value: fmtMoney(inputs.rpm, defaults.rpm) }
      );
      break;
    case "LEAD_GEN":
      rows.push(
        { label: "Lead conversion", value: fmtPercent(inputs.leadConversionRate, defaults.leadConversionRate) },
        { label: "Lead value", value: fmtMoney(inputs.leadValue, defaults.leadValue) }
      );
      break;
    default:
      rows.push(
        { label: "Conversion rate", value: fmtPercent(inputs.conversionRate, defaults.conversionRate) },
        { label: "Average value", value: fmtMoney(inputs.averageOrderValue, defaults.averageOrderValue) }
      );
  }

  return rows;
}

const SENSITIVITY_OPTIONS: { value: SensitivityMode; label: string; hint: string }[] = [
  { value: "conservative", label: "Conservative", hint: "lower estimate" },
  { value: "balanced", label: "Balanced", hint: "typical scenario" },
  { value: "aggressive", label: "Aggressive", hint: "higher impact" },
];

const SENSITIVITY_EXPLANATION: Record<SensitivityMode, string> = {
  conservative: "Conservative — narrower, lower-bound range. Use for cautious planning.",
  balanced: "Balanced — the typical range for a site like yours.",
  aggressive: "Aggressive — wider, higher-bound range. Use if users are very performance-sensitive.",
};

/**
 * Controlled, founder-facing message pools for each stage card.
 * Every sentence is a single, executive-style statement following
 * cause → effect → business impact. No metric names, no hedging
 * ("may", "might", "can"), no technical sub-labels. Pools are
 * equal-strength so any rotation reads with the same certainty.
 */
const STAGE_MESSAGE_POOL = {
  landing: [
    "Your page loads too slowly, causing users to leave before they even see your product or understand your value.",
    "Slow page loading prevents users from seeing your content, leading them to leave before engaging with your product.",
    "Users abandon your site while it's still loading, before your product becomes visible or meaningful to them.",
    "Delayed page rendering causes users to exit before your value is visible or understood.",
    "Long load times create early friction, pushing users away before they see anything worth engaging with.",
  ],
  interaction: [
    "Slow response to clicks makes your site feel unresponsive, causing users to stop engaging with your product.",
    "Interaction delays frustrate users, leading them to drop off before they meaningfully engage.",
    "Your site reacts slowly to user input, breaking engagement and causing users to abandon interaction.",
    "Lag during interaction disrupts user flow, reducing engagement and increasing drop-offs.",
    "Unresponsive interactions create friction, pushing users away while they are trying to engage.",
  ],
  conversion: [
    "Layout shifts disrupt user actions, reducing trust at the moment users are ready to convert.",
    "Unstable page elements create confusion, causing users to hesitate before completing actions.",
    "Sudden layout changes interfere with user intent, leading to lost conversions.",
    "Visual instability makes your site feel unreliable, reducing confidence during conversion.",
    "Elements move unexpectedly during interaction, causing users to abandon key actions.",
  ],
} as const;

type StagePoolKey = keyof typeof STAGE_MESSAGE_POOL;

/**
 * Stage-level "good" thresholds for the primary metric driving each stage.
 * When the snapshot's metric is at or below the threshold, that stage's
 * contribution to the total loss is attenuated (it cannot be the cause
 * of meaningful drop-off). Also flips the stage card to a non-blame
 * message so the UI does not contradict the snapshot.
 *
 * Sources: web.dev Core Web Vitals "good" buckets.
 *   LCP good ≤ 2.5s  (`snapshot.lcp` is stored in seconds)
 *   INP good ≤ 200ms (`snapshot.inp` is stored in seconds)
 *   CLS good ≤ 0.05  (decimal score)
 */
/**
 * Stage cards use a "low impact" copy line when the recoverable share is below
 * this threshold, or when conversion is gated for good CLS. Same threshold
 * gates the "Start here" highlight (no de-emphasized stage gets the badge).
 */
const STAGE_LOW_IMPACT_PERCENT = 12;

/**
 * Founder-facing copy for stages that are NOT meaningfully responsible for
 * revenue loss. Single sentence, no technical terms, no contradiction with
 * the snapshot. The Conversion line is the spec-required wording.
 */
const STAGE_LOW_IMPACT_MESSAGE: Record<CanonicalStageName, string> = {
  Landing:
    "Most losses occur after users have already loaded your page.",
  Activation:
    "Most losses occur outside the interaction stage of your funnel.",
  Conversion:
    "Most losses occur before users reach the conversion stage.",
};

type CanonicalStageName = "Landing" | "Activation" | "Conversion";

/**
 * Deterministic selector — same inputs always produce the same sentence.
 * Drives variation across projects (different `expectedLoss`) without ever
 * flickering between renders for a given project.
 *
 * Index formula (per spec): `Math.floor(expectedLoss || 1) % pool.length`.
 */
function pickStageMessage(poolKey: StagePoolKey, expectedLoss: number): string {
  const pool = STAGE_MESSAGE_POOL[poolKey];
  const safeLoss = Number.isFinite(expectedLoss) && expectedLoss > 0 ? expectedLoss : 1;
  const index = Math.floor(safeLoss) % pool.length;
  return pool[index];
}

type RevenueImpactWorkspaceProps = {
  projectId: string;
};

/** Frozen baseline + estimate style while business inputs drift from the last run (sensitivity alone does not require recalc). */
type ResultDisplayLock = {
  sensitivityMode: SensitivityMode;
  baselineRevenue: number;
};

export default function RevenueImpactWorkspace({ projectId }: RevenueImpactWorkspaceProps) {
  const [profile, setProfile] = useState<RevenueImpactProfile | null>(null);
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [simulating, setSimulating] = useState(false);
  const [resultsRevealEpoch, setResultsRevealEpoch] = useState(0);
  const [result, setResult] = useState<ImpactEngineOutput | null>(null);
  const [resultDisplayLock, setResultDisplayLock] = useState<ResultDisplayLock | null>(null);

  const [businessModelId, setBusinessModelId] = useState("ECOMMERCE");
  const [traffic, setTraffic] = useState("");
  const [conversionRate, setConversionRate] = useState("");
  const [averageOrderValue, setAverageOrderValue] = useState("");
  const [trialConversionRate, setTrialConversionRate] = useState("");
  const [paidConversionRate, setPaidConversionRate] = useState("");
  const [subscriptionValue, setSubscriptionValue] = useState("");
  const [pageviewsPerSession, setPageviewsPerSession] = useState("");
  const [rpm, setRpm] = useState("");
  const [leadConversionRate, setLeadConversionRate] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sensitivityMode, setSensitivityMode] = useState<SensitivityMode>("balanced");

  useEffect(() => {
    setResult(null);
    setResultDisplayLock(null);
    lastSuccessfulRunInputsRef.current = "";
  }, [projectId]);

  const defaults = DEFAULT_MODEL_INPUTS[businessModelId] ?? DEFAULT_MODEL_INPUTS[DEFAULT_BUSINESS_MODEL_KEY];

  /**
   * Prefill conversion / value fields with sensible defaults when the user picks a different business model.
   * Users can still override; we never overwrite a value the user has already typed.
   */
  const handleBusinessModelChange = (nextId: string) => {
    setBusinessModelId(nextId);
    if (nextId === "ECOMMERCE") {
      if (!conversionRate) setConversionRate("2.5");
      if (!averageOrderValue) setAverageOrderValue("75");
    } else if (nextId === "SAAS") {
      if (!trialConversionRate) setTrialConversionRate("1.5");
    }
  };

  // Realism safeguards (soft validation + internal caps for calculations only).
  // We cap extreme values to reduce overestimation while keeping the user's input visible.
  const ECOMMERCE_CONVERSION_MAX_PERCENT = 10;
  const SAAS_TRIAL_CONVERSION_MAX_PERCENT = 20;
  const SAAS_PAID_CONVERSION_MAX_PERCENT = 10;

  const parsePercentInput = (raw: string): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };

  const conversionRatePercent = parsePercentInput(conversionRate);
  const conversionRateExceeded = conversionRatePercent != null && conversionRatePercent > ECOMMERCE_CONVERSION_MAX_PERCENT;
  const effectiveConversionRateFraction =
    conversionRatePercent != null ? Math.min(conversionRatePercent / 100, ECOMMERCE_CONVERSION_MAX_PERCENT / 100) : undefined;

  const trialConversionRatePercent = parsePercentInput(trialConversionRate);
  const trialConversionRateExceeded = trialConversionRatePercent != null && trialConversionRatePercent > SAAS_TRIAL_CONVERSION_MAX_PERCENT;
  const effectiveTrialConversionRateFraction =
    trialConversionRatePercent != null ? Math.min(trialConversionRatePercent / 100, SAAS_TRIAL_CONVERSION_MAX_PERCENT / 100) : undefined;

  const paidConversionRatePercent = parsePercentInput(paidConversionRate);
  const paidConversionRateExceeded = paidConversionRatePercent != null && paidConversionRatePercent > SAAS_PAID_CONVERSION_MAX_PERCENT;
  const effectivePaidConversionRateFraction =
    paidConversionRatePercent != null ? Math.min(paidConversionRatePercent / 100, SAAS_PAID_CONVERSION_MAX_PERCENT / 100) : undefined;

  const formInputs: BusinessModelInputs = {
    monthlyTraffic: traffic ? Number(traffic.replace(/[^0-9.]/g, "")) : undefined,
    conversionRate: effectiveConversionRateFraction,
    averageOrderValue: averageOrderValue ? Number(averageOrderValue.replace(/[^0-9.]/g, "")) : undefined,
    trialConversionRate: effectiveTrialConversionRateFraction,
    paidConversionRate: effectivePaidConversionRateFraction,
    subscriptionValue: subscriptionValue ? Number(subscriptionValue.replace(/[^0-9.]/g, "")) : undefined,
    pageviewsPerSession: pageviewsPerSession ? Number(pageviewsPerSession.replace(/[^0-9.]/g, "")) : undefined,
    rpm: rpm ? Number(rpm.replace(/[^0-9.]/g, "")) : undefined,
    leadConversionRate: leadConversionRate ? Number(leadConversionRate.replace(/[^0-9.]/g, "")) / 100 : undefined,
    leadValue: leadValue ? Number(leadValue.replace(/[^0-9.]/g, "")) : undefined,
  };
  const baselineRevenue = computeBaselineRevenue(businessModelId, formInputs);
  const aovNumeric = averageOrderValue ? Number(averageOrderValue.replace(/[^0-9.]/g, "")) : undefined;
  const defaultAov = defaults.averageOrderValue;
  const showAovWarning =
    (businessModelId === "ECOMMERCE" || businessModelId === "GENERAL") &&
    typeof aovNumeric === "number" &&
    Number.isFinite(aovNumeric) &&
    aovNumeric > 0 &&
    ((typeof defaultAov === "number" && defaultAov > 0 && aovNumeric >= defaultAov * 4) || aovNumeric >= 500);

  /** Friendly business-model name used in trust feedback copy. */
  const BUSINESS_MODEL_FRIENDLY_NAME: Record<string, string> = {
    ECOMMERCE: "e-commerce",
    SAAS: "SaaS",
    CONTENT_ADS: "content / ads",
    LEAD_GEN: "lead-gen",
    GENERAL: "general",
  };

  /**
   * True when the user has typed at least one value AND no realism warning is active.
   * Drives the inline "inputs look realistic" reassurance line — purely cosmetic, no calculation effect.
   */
  const userEnteredAnyValue = Boolean(
    traffic || conversionRate || averageOrderValue ||
      trialConversionRate || paidConversionRate || subscriptionValue ||
      pageviewsPerSession || rpm || leadConversionRate || leadValue
  );
  const inputsLookRealistic =
    userEnteredAnyValue &&
    !conversionRateExceeded &&
    !trialConversionRateExceeded &&
    !paidConversionRateExceeded &&
    !showAovWarning;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedInputsRef = useRef<string>("");
  /** JSON of { businessModelId, baselineRevenue, advancedInputs } from the last successful Calculate — excludes sensitivity. */
  const lastSuccessfulRunInputsRef = useRef<string>("");

  const persistProfile = useCallback(
    async (
      data: {
        businessModelId: string;
        monthlyRevenue: number;
        advancedInputs?: Record<string, unknown>;
        sensitivityMode: SensitivityMode;
      },
      opts?: { silent?: boolean }
    ) => {
      const silent = opts?.silent ?? false;
      if (!silent) setSaveStatus("saving");
      try {
        const res = await fetch("/api/project-business-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            businessModelId: data.businessModelId,
            monthlyRevenue: data.monthlyRevenue,
            advancedInputs: data.advancedInputs ?? {},
            sensitivityMode: data.sensitivityMode,
          }),
        });
        if (!res.ok) {
          if (!silent) setSaveStatus("idle");
          return;
        }
        const json = (await res.json()) as { profile: RevenueImpactProfile };
        setProfile(json.profile);
        if (!silent) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }
      } catch {
        if (!silent) setSaveStatus("idle");
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, contextRes] = await Promise.all([
          fetch(`/api/project-business-profile?projectId=${encodeURIComponent(projectId)}`),
          fetch(`/api/projects/${encodeURIComponent(projectId)}`),
        ]);
        if (cancelled) return;
        const profileData = profileRes.ok
          ? ((await profileRes.json()) as { profile: RevenueImpactProfile | null })
          : { profile: null };
        const contextData = contextRes.ok
          ? ((await contextRes.json()) as ProjectContext)
          : null;

        setContext(contextData ?? null);
        const p = profileData.profile;
        if (p) {
          setProfile(p);
          const modelId = String(p.businessModelId || "ECOMMERCE").toUpperCase();
          setBusinessModelId(MODEL_KEYS.includes(modelId as (typeof MODEL_KEYS)[number]) ? modelId : "ECOMMERCE");
          const adv = (p.advancedInputs as Record<string, unknown>) ?? {};
          setTraffic(adv.monthlyTraffic != null ? String(adv.monthlyTraffic) : "");
          setConversionRate(adv.conversionRate != null ? String((Number(adv.conversionRate) * 100).toFixed(2)) : "");
          setAverageOrderValue(adv.averageOrderValue != null ? String(adv.averageOrderValue) : "");
          setTrialConversionRate(adv.trialConversionRate != null ? String((Number(adv.trialConversionRate) * 100).toFixed(2)) : "");
          setPaidConversionRate(adv.paidConversionRate != null ? String((Number(adv.paidConversionRate) * 100).toFixed(2)) : "");
          setSubscriptionValue(adv.subscriptionValue != null ? String(adv.subscriptionValue) : "");
          setPageviewsPerSession(adv.pageviewsPerSession != null ? String(adv.pageviewsPerSession) : "");
          setRpm(adv.rpm != null ? String(adv.rpm) : "");
          setLeadConversionRate(adv.leadConversionRate != null ? String((Number(adv.leadConversionRate) * 100).toFixed(2)) : "");
          setLeadValue(adv.leadValue != null ? String(adv.leadValue) : "");
          setSensitivityMode(
            p.sensitivityMode === "conservative" || p.sensitivityMode === "balanced" || p.sensitivityMode === "aggressive"
              ? p.sensitivityMode
              : "balanced"
          );
          savedInputsRef.current = JSON.stringify({ businessModelId: modelId, baselineRevenue: p.monthlyRevenue, formInputs: adv, sensitivityMode: p.sensitivityMode });
        }
      } catch {
        if (!cancelled) setContext(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const advancedInputs = useCallback((): Record<string, unknown> => {
    const base = traffic ? { monthlyTraffic: Number(traffic.replace(/[^0-9.]/g, "")) } : {};
    const key = MODEL_KEYS.includes(businessModelId as (typeof MODEL_KEYS)[number]) ? businessModelId : DEFAULT_BUSINESS_MODEL_KEY;
    const def = DEFAULT_MODEL_INPUTS[key] ?? DEFAULT_MODEL_INPUTS[DEFAULT_BUSINESS_MODEL_KEY];
    switch (key) {
      case "ECOMMERCE":
        return { ...base, conversionRate: conversionRate ? Number(conversionRate.replace(/[^0-9.]/g, "")) / 100 : def.conversionRate, averageOrderValue: averageOrderValue ? Number(averageOrderValue.replace(/[^0-9.]/g, "")) : def.averageOrderValue };
      case "SAAS":
        return { ...base, trialConversionRate: trialConversionRate ? Number(trialConversionRate.replace(/[^0-9.]/g, "")) / 100 : def.trialConversionRate, paidConversionRate: paidConversionRate ? Number(paidConversionRate.replace(/[^0-9.]/g, "")) / 100 : def.paidConversionRate, subscriptionValue: subscriptionValue ? Number(subscriptionValue.replace(/[^0-9.]/g, "")) : def.subscriptionValue };
      case "CONTENT_ADS":
        return { ...base, pageviewsPerSession: pageviewsPerSession ? Number(pageviewsPerSession.replace(/[^0-9.]/g, "")) : def.pageviewsPerSession, rpm: rpm ? Number(rpm.replace(/[^0-9.]/g, "")) : def.rpm };
      case "LEAD_GEN":
        return { ...base, leadConversionRate: leadConversionRate ? Number(leadConversionRate.replace(/[^0-9.]/g, "")) / 100 : def.leadConversionRate, leadValue: leadValue ? Number(leadValue.replace(/[^0-9.]/g, "")) : def.leadValue };
      default:
        return { ...base, conversionRate: conversionRate ? Number(conversionRate.replace(/[^0-9.]/g, "")) / 100 : def.conversionRate, averageOrderValue: averageOrderValue ? Number(averageOrderValue.replace(/[^0-9.]/g, "")) : def.averageOrderValue };
    }
  }, [businessModelId, traffic, conversionRate, averageOrderValue, trialConversionRate, paidConversionRate, subscriptionValue, pageviewsPerSession, rpm, leadConversionRate, leadValue]);

  useEffect(() => {
    const payload = JSON.stringify({ businessModelId, baselineRevenue, advancedInputs: advancedInputs(), sensitivityMode });
    if (payload === savedInputsRef.current) return;
    savedInputsRef.current = payload;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      persistProfile(
        {
          businessModelId,
          monthlyRevenue: Math.round(baselineRevenue),
          advancedInputs: advancedInputs(),
          sensitivityMode,
        },
        { silent: true }
      );
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [businessModelId, baselineRevenue, sensitivityMode, advancedInputs, persistProfile]);

  /** Keep lock in sync for the stale snapshot; when inputs match last run, lock tracks live estimate style + run baseline. */
  useEffect(() => {
    if (!result || !lastSuccessfulRunInputsRef.current) return;
    const runKey = JSON.stringify({
      businessModelId,
      baselineRevenue,
      advancedInputs: advancedInputs(),
    });
    if (runKey !== lastSuccessfulRunInputsRef.current) return;
    setResultDisplayLock((prev) => {
      const next = { baselineRevenue: result.baselineRevenue, sensitivityMode };
      if (
        prev &&
        prev.baselineRevenue === next.baselineRevenue &&
        prev.sensitivityMode === next.sensitivityMode
      ) {
        return prev;
      }
      return next;
    });
  }, [result, businessModelId, baselineRevenue, advancedInputs, sensitivityMode]);

  const runSimulation = useCallback(async () => {
    setSimulating(true);
    try {
    const adv = advancedInputs();
    // Apply realism caps for calculations only (do not change user-visible inputs).
    const advForCalc: Record<string, unknown> = { ...adv };
    if (businessModelId === "ECOMMERCE" || businessModelId === "GENERAL") {
      const cr = typeof advForCalc.conversionRate === "number" ? advForCalc.conversionRate : undefined;
      if (cr != null) advForCalc.conversionRate = Math.min(cr, ECOMMERCE_CONVERSION_MAX_PERCENT / 100);
    }
    if (businessModelId === "SAAS") {
      const tr = typeof advForCalc.trialConversionRate === "number" ? advForCalc.trialConversionRate : undefined;
      if (tr != null) advForCalc.trialConversionRate = Math.min(tr, SAAS_TRIAL_CONVERSION_MAX_PERCENT / 100);
      const pr = typeof advForCalc.paidConversionRate === "number" ? advForCalc.paidConversionRate : undefined;
      if (pr != null) advForCalc.paidConversionRate = Math.min(pr, SAAS_PAID_CONVERSION_MAX_PERCENT / 100);
    }
    await persistProfile(
      {
        businessModelId,
        monthlyRevenue: Math.round(baselineRevenue),
        advancedInputs: adv,
        sensitivityMode,
      },
      { silent: true }
    );
    const snapshot: PerformanceSnapshotLike = context?.lastSnapshot
      ? {
          id: context.lastSnapshot.id,
          overallHealth: context.lastSnapshot.overallHealth,
          lcp: context.lastSnapshot.lcp,
          inp: context.lastSnapshot.inp,
          ttfb: context.lastSnapshot.ttfb,
          cls: context.lastSnapshot.cls,
          tbt: context.lastSnapshot.tbt,
          tti: context.lastSnapshot.tti,
          timestamp: context.lastSnapshot.timestamp,
        }
      : { overallHealth: null };
    const metricsMs = behaviorMetricsMsFromSnapshotSeconds({
      lcp: context?.lastSnapshot?.lcp,
      inp: context?.lastSnapshot?.inp,
      tbt: context?.lastSnapshot?.tbt,
      cls: context?.lastSnapshot?.cls,
    });
    const behaviorResult = computeHeadlineRevenueLeak(baselineRevenue, metricsMs);
    // Defensible range: bounds depend on the selected estimate style, never above
    // baseline. The underlying `totalLoss` is unchanged by the mode — only the
    // published range width shifts (see RANGE_BOUNDS_BY_MODE).
    const estimatedMonthlyLeak = behaviorResult.totalLoss;
    const opportunityRange = persistedOpportunityRange(estimatedMonthlyLeak, baselineRevenue, sensitivityMode);
    const businessInputs: BusinessInputs = {
      monthlyRevenue: baselineRevenue,
      mobileTrafficPercent: 100,
      ...advForCalc,
    };
    const impactOutput = runImpactEngine({
      performanceSnapshot: snapshot,
      businessInputs,
      businessModelId: toImpactEngineModelId(businessModelId),
      sensitivityMode,
      persistInputs: false,
    });
    // Confidence is derived from input completeness, NOT engine internals.
    // Low    = no real inputs (pure defaults)
    // Medium = some inputs, but key fields missing
    // High   = all key fields for the chosen model are user-supplied
    const requiredKeysByModel: Record<string, string[]> = {
      ECOMMERCE: ["monthlyTraffic", "conversionRate", "averageOrderValue"],
      SAAS: ["monthlyTraffic", "trialConversionRate", "subscriptionValue"],
      CONTENT_ADS: ["monthlyTraffic", "pageviewsPerSession", "rpm"],
      LEAD_GEN: ["monthlyTraffic", "leadConversionRate", "leadValue"],
      GENERAL: ["monthlyTraffic", "conversionRate", "averageOrderValue"],
    };
    const required = requiredKeysByModel[businessModelId] ?? requiredKeysByModel.GENERAL;
    const userProvided = required.filter((k) => {
      const v = (adv as Record<string, unknown>)[k];
      return typeof v === "number" && Number.isFinite(v) && v > 0;
    });
    let confidenceLevel: ImpactEngineOutput["confidenceLevel"];
    if (userProvided.length === 0) confidenceLevel = "low";
    else if (userProvided.length < required.length) confidenceLevel = "moderate";
    else confidenceLevel = "high";

    const output: ImpactEngineOutput = {
      ...impactOutput,
      baselineRevenue,
      opportunityRange,
      optimizedRevenueRange: opportunityRange,
      confidenceLevel,
    };
    setResult(output);
    lastSuccessfulRunInputsRef.current = JSON.stringify({
      businessModelId,
      baselineRevenue,
      advancedInputs: adv,
    });
    setResultDisplayLock({
      sensitivityMode,
      baselineRevenue: output.baselineRevenue,
    });
    setResultsRevealEpoch((n) => n + 1);
    const now = new Date().toISOString();
    const snapshotTimestampIso = context?.lastSnapshot?.timestamp ?? now;
    try {
      const res = await fetch("/api/project-business-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          lastCalculatedOpportunity: output.opportunityRange,
          lastConfidence: output.confidenceLevel,
          modelVersion: output.modelVersion,
          lastRunAt: now,
          lastSnapshotTimestamp: snapshotTimestampIso,
        }),
      });
      if (res.ok) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                lastRunAt: now,
                lastSnapshotTimestamp: snapshotTimestampIso,
                modelVersion: output.modelVersion ?? null,
              }
            : null
        );
      }
    } catch {
      // ignore
    }
    } finally {
      setSimulating(false);
    }
  }, [projectId, context?.lastSnapshot, baselineRevenue, advancedInputs, businessModelId, sensitivityMode, persistProfile]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center bg-[#0b1326] px-8">
        <span className="text-sm text-slate-500">Loading workspace…</span>
      </div>
    );
  }

  /** Synchronous (same render) — avoids one-frame leak where results used live baseline before effects ran. */
  const lastRunInputsKey = lastSuccessfulRunInputsRef.current;
  const currentRunInputsKey = JSON.stringify({
    businessModelId,
    baselineRevenue,
    advancedInputs: advancedInputs(),
  });
  const inputsDriftFromLastRun = Boolean(
    result != null && lastRunInputsKey !== "" && currentRunInputsKey !== lastRunInputsKey
  );

  const projectName = context?.project?.url ?? projectId;
  const lastUpdated = profile?.updatedAt ? formatDate(profile.updatedAt) : "—";
  const snapshot = context?.lastSnapshot;

  const stageSnap: RevenueStageSnapshot | null = snapshot
    ? {
        lcpSeconds: snapshot.lcp,
        inpSeconds: snapshot.inp,
        tbtSeconds: snapshot.tbt,
        cls: snapshot.cls,
        ttiSeconds: snapshot.tti,
      }
    : null;

  const stageMetricWeights = stageSnap ? computeStageMetricWeights(stageSnap) : null;

  // ---------------------------------------------------------------------------
  // One engine run yields mode-independent `totalLoss`. While business inputs
  // match the last Calculate, live `sensitivityMode` + `baselineRevenue` drive
  // the UI (all three styles are computable client-side). When inputs drift,
  // freeze to `resultDisplayLock` until the user runs again.
  // ---------------------------------------------------------------------------
  const totalLoss = result?.opportunityRange?.expected ?? 0;
  const staleInputsDisplay = Boolean(
    result != null && inputsDriftFromLastRun && resultDisplayLock != null
  );
  const resultsBaseline = staleInputsDisplay
    ? resultDisplayLock!.baselineRevenue
    : baselineRevenue;
  const resultsSensitivity: SensitivityMode = staleInputsDisplay
    ? resultDisplayLock!.sensitivityMode
    : sensitivityMode;

  const recovery = RECOVERY_FACTORS[resultsSensitivity];

  const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(
    totalLoss,
    resultsBaseline,
    resultsSensitivity
  );

  // Recoverable bounds: at-risk bounds × mode recovery factor.
  const recoverableLow = opportunityLow * recovery.min;
  const recoverableHigh = opportunityHigh * recovery.max;

  const currentRevenue = Math.max(0, resultsBaseline - totalLoss);

  // Projected revenue after fixes = current + recovered.
  const rawProjectedLow = currentRevenue + recoverableLow;
  const rawProjectedHigh = currentRevenue + recoverableHigh;

  const validated = validateRevenueModel({
    baselineRevenue: resultsBaseline,
    totalLoss,
    recoverableLow,
    recoverableHigh,
    currentRevenue,
    projectedLow: rawProjectedLow,
    projectedHigh: rawProjectedHigh,
  });

  // INVARIANT GUARANTEE:
  // currentRevenue ≤ projectedRevenue ≤ baselineRevenue

  type CanonicalStage = "Landing" | "Activation" | "Conversion";
  type StageRow = {
    stage: CanonicalStage;
    percent: number;
    loss: number;
    title: string;
  };

  const expectedLoss = (opportunityLow + opportunityHigh) / 2;
  const expectedRecoverable = expectedLoss * recovery.avg;

  const stageAmounts = distributeRecoverableAcrossStages(stageSnap, expectedRecoverable);
  const stageOrder = ["Landing", "Activation", "Conversion"] as const;
  const revenueLossRows: StageRow[] = stageOrder.map((stage) => {
    const loss = stageAmounts[stage];
    const pct =
      expectedRecoverable > 0 ? Math.round((loss / expectedRecoverable) * 100) : 0;
    return { stage, percent: pct, loss, title: stage };
  });
  const pctSum = revenueLossRows.reduce((a, r) => a + r.percent, 0);
  if (pctSum !== 100 && revenueLossRows.length > 0 && pctSum > 0) {
    const diff = 100 - pctSum;
    revenueLossRows[0].percent = Math.max(0, revenueLossRows[0].percent + diff);
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    const finalStageSum = revenueLossRows.reduce((a, r) => a + r.loss, 0);
    console.debug("[RevenueImpact] mode-aware derivation", {
      mode: resultsSensitivity,
      recoveryFactor: recovery,
      totalLoss: validated.totalLoss,
      opportunityLow,
      opportunityHigh,
      expectedRecoverable,
      currentRevenue: validated.currentRevenue,
      recoverableLow: validated.recoverableLow,
      recoverableHigh: validated.recoverableHigh,
      projectedLow: validated.projectedLow,
      projectedHigh: validated.projectedHigh,
      maxRecoverable: Math.round(opportunityHigh * recovery.max),
      stageSum: finalStageSum,
      stageMetricWeights,
      snapshotMetrics: snapshot
        ? {
            lcpSeconds: snapshot.lcp,
            ttiSeconds: snapshot.tti ?? null,
            inpMs: snapshot.inp != null ? snapshot.inp * 1000 : null,
            cls: snapshot.cls,
          }
        : null,
      stageBreakdown: revenueLossRows.map((r) => ({
        stage: r.stage,
        percent: r.percent,
        loss: r.loss,
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // UI-only derived values for the Revenue Impact section. `opportunityLow`,
  // `opportunityHigh`, and `recovery` were already derived above (mode-aware)
  // — these helpers drive copy, framing and the outcome CTA.
  // ---------------------------------------------------------------------------
  const hasBaselineRevenue =
    typeof resultsBaseline === "number" && Number.isFinite(resultsBaseline) && resultsBaseline > 0;

  const impactPercentLow = hasBaselineRevenue
    ? Math.max(0, Math.min(100, Math.round((opportunityLow / resultsBaseline) * 100)))
    : 0;
  const impactPercentHigh = hasBaselineRevenue
    ? Math.max(0, Math.min(100, Math.round((opportunityHigh / resultsBaseline) * 100)))
    : 0;
  const showImpactPercent = hasBaselineRevenue && impactPercentHigh > 0;

  const isRowLowImpactForHighlight = (row: StageRow): boolean =>
    row.percent < STAGE_LOW_IMPACT_PERCENT ||
    (row.stage === "Conversion" && (stageMetricWeights?.clsGoodForMessaging ?? false));

  // Highest recoverable among stages we can honestly highlight (skips good-CLS conversion, etc.)
  const highestStageIndex = revenueLossRows.length
    ? (() => {
        const scored = revenueLossRows.map((r, i) => ({ r, i }));
        const eligible = scored.filter(({ r }) => !isRowLowImpactForHighlight(r) && r.loss > 0);
        const pool = eligible.length > 0 ? eligible : scored.filter(({ r }) => r.loss > 0);
        if (pool.length === 0) return -1;
        return pool.reduce((best, x) => (x.r.loss > best.r.loss ? x : best), pool[0]).i;
      })()
    : -1;
  const highestStageRow = highestStageIndex >= 0 ? revenueLossRows[highestStageIndex] : null;

  /** Behavioral, non-technical headline above confidence. */
  const primaryInsightCopy = highestStageRow
    ? highestStageRow.stage === "Landing"
      ? "Most revenue is lost before users see your page."
      : highestStageRow.stage === "Activation"
        ? "Most revenue is lost when users try to interact."
        : "Most revenue is lost when users decide to convert."
    : null;

  /** Plain-English, founder-facing label per stage (no internal terms). */
  function stageHeadingLabel(stage: CanonicalStage): string {
    if (stage === "Landing") return "Before users see your page";
    if (stage === "Activation") return "When users try to interact";
    return "When users decide to convert";
  }

  const confidenceLabel =
    result?.confidenceLevel === "high"
      ? "High"
      : result?.confidenceLevel === "moderate"
        ? "Medium"
        : "Low";

  /** One-line, action-oriented meaning for each confidence level. */
  const confidenceMeaning =
    result?.confidenceLevel === "high"
      ? "Safe to prioritize this for immediate impact."
      : result?.confidenceLevel === "moderate"
        ? "Directional insight — validate if needed."
        : "Use as estimate, not a decision driver. Add your business inputs to improve accuracy.";

  /**
   * Outcome-driven CTA: max recoverable (`opportunityHigh × recovery.max`) with
   * guards so CTA ≥ each stage and ≥ sum(stage recoverable), and ≤ headline total loss.
   */
  const maxRecoverable = reconcileMaxRecoverableCta({
    opportunityHigh,
    recoveryFactorMax: recovery.max,
    stageAmounts,
    totalLossCap: Math.round(validated.totalLoss),
  });
  const ctaLabel =
    maxRecoverable > 0
      ? `Recover up to ${formatRevenueReadableAmount(maxRecoverable)}/month →`
      : "See what to fix to recover this revenue →";

  const riInput =
    "w-full rounded-lg border-0 bg-[#060e20] px-4 py-3 text-sm text-[#dae2fd] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/80";
  const riLabel = "mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400";

  return (
    <div className="relative min-h-full overflow-x-hidden bg-[#060a14] pb-20 text-[#dae2fd]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(1200px 600px at 85% -10%, rgba(57,255,20,0.07), transparent 55%), radial-gradient(900px 500px at 10% 40%, rgba(100,150,255,0.06), transparent 50%), linear-gradient(180deg, #0b1326 0%, #060a14 45%, #0b1326 100%)",
        }}
      />
      <header className="sticky top-0 z-30 border-b border-[#39FF14]/15 bg-[#0b1326]/80 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[min(92rem,calc(100vw-2rem))] flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#dae2fd] sm:text-3xl">Revenue Impact</h1>
            <p className="mt-1 max-w-[65ch] text-sm leading-snug text-slate-400">
              <span className="font-medium text-slate-300">Project:</span>{" "}
              <span className="break-all">{projectName}</span>
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Last updated · {lastUpdated}
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-[1] mx-auto w-full max-w-[min(92rem,calc(100vw-2rem))] px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid grid-cols-12 gap-6 lg:gap-8 xl:gap-10">
          <div className="col-span-12 flex min-w-0 flex-col space-y-6 lg:col-span-5 xl:col-span-4">
            <section className="flex w-full min-w-0 flex-col justify-between space-y-6 rounded-2xl border border-white/[0.08] bg-[#131b2e]/75 p-6 shadow-[0_0_0_1px_rgba(57,255,20,0.04),0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/[0.03] lg:p-8">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-[#dae2fd]">Business context</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            We estimate how performance impacts conversions. Add your real numbers for better accuracy.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={riLabel}>Business model</label>
            <select
              value={businessModelId}
              onChange={(e) => handleBusinessModelChange(e.target.value)}
              className={riInput}
            >
              {MODEL_KEYS.map((id) => (
                <option key={id} value={id}>
                  {BUSINESS_MODELS[id]?.name ?? id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={riLabel}>Monthly visitors</label>
            <input
              type="text"
              inputMode="numeric"
              value={traffic}
              onChange={(e) => setTraffic(e.target.value)}
              placeholder="e.g. 50,000 visitors/month"
              className={riInput}
            />
          </div>
        </div>
        {businessModelId === "ECOMMERCE" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={riLabel}>Conversion rate (%)</label>
              <input type="text" inputMode="decimal" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} placeholder="e.g. 2.5%" className={riInput} />
              {conversionRateExceeded && (
                <p className="mt-1 text-xs text-amber-200">
                  This value is unusually high compared to typical industry benchmarks. Results may be overestimated.
                </p>
              )}
            </div>
            <div>
              <label className={riLabel}>Average order value ($)</label>
              <input type="text" inputMode="numeric" value={averageOrderValue} onChange={(e) => setAverageOrderValue(e.target.value)} placeholder="e.g. $80" className={riInput} />
              {showAovWarning && (
                <p className="mt-1 text-xs text-amber-200">
                  Your AOV seems higher than typical for this category. Results may be inflated.
                </p>
              )}
            </div>
          </div>
        )}
        {businessModelId === "SAAS" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={riLabel}>Signup conversion (%)</label>
              <input type="text" inputMode="decimal" value={trialConversionRate} onChange={(e) => setTrialConversionRate(e.target.value)} placeholder="e.g. 1.5%" className={riInput} />
              {trialConversionRateExceeded && (
                <p className="mt-1 text-xs text-amber-200">
                  This value is unusually high compared to typical industry benchmarks. Results may be overestimated.
                </p>
              )}
            </div>
            <div>
              <label className={riLabel}>Paid conversion (%)</label>
              <input type="text" inputMode="decimal" value={paidConversionRate} onChange={(e) => setPaidConversionRate(e.target.value)} placeholder={`e.g. ${((defaults.paidConversionRate ?? 0.25) * 100).toFixed(0)}%`} className={riInput} />
              {paidConversionRateExceeded && (
                <p className="mt-1 text-xs text-amber-200">
                  This value is unusually high compared to typical industry benchmarks. Results may be overestimated.
                </p>
              )}
            </div>
            <div>
              <label className={riLabel}>Subscription price ($/mo)</label>
              <input type="text" inputMode="numeric" value={subscriptionValue} onChange={(e) => setSubscriptionValue(e.target.value)} placeholder="e.g. $50/month" className={riInput} />
            </div>
          </div>
        )}
        {businessModelId === "CONTENT_ADS" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={riLabel}>Pageviews per session</label>
              <input type="text" inputMode="decimal" value={pageviewsPerSession} onChange={(e) => setPageviewsPerSession(e.target.value)} placeholder={`e.g. ${defaults.pageviewsPerSession ?? 2.5}`} className={riInput} />
            </div>
            <div>
              <label className={riLabel}>RPM ($)</label>
              <input type="text" inputMode="numeric" value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder={`e.g. $${defaults.rpm ?? 2}`} className={riInput} />
            </div>
          </div>
        )}
        {businessModelId === "LEAD_GEN" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={riLabel}>Lead conversion (%)</label>
              <input type="text" inputMode="decimal" value={leadConversionRate} onChange={(e) => setLeadConversionRate(e.target.value)} placeholder={`e.g. ${((defaults.leadConversionRate ?? 0.02) * 100).toFixed(1)}%`} className={riInput} />
            </div>
            <div>
              <label className={riLabel}>Lead value ($)</label>
              <input type="text" inputMode="numeric" value={leadValue} onChange={(e) => setLeadValue(e.target.value)} placeholder={`e.g. $${defaults.leadValue ?? 25}`} className={riInput} />
            </div>
          </div>
        )}
        {businessModelId === "GENERAL" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={riLabel}>Conversion rate (%)</label>
              <input type="text" inputMode="decimal" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} placeholder="e.g. 2.5%" className={riInput} />
              {conversionRateExceeded && (
                <p className="mt-1 text-xs text-amber-200">
                  This value is unusually high compared to typical industry benchmarks. Results may be overestimated.
                </p>
              )}
            </div>
            <div>
              <label className={riLabel}>Average value ($)</label>
              <input type="text" inputMode="numeric" value={averageOrderValue} onChange={(e) => setAverageOrderValue(e.target.value)} placeholder="e.g. $80" className={riInput} />
              {showAovWarning && (
                <p className="mt-1 text-xs text-amber-200">
                  Your AOV seems higher than typical for this category. Results may be inflated.
                </p>
              )}
            </div>
          </div>
        )}
        {inputsLookRealistic && (() => {
          const friendly = BUSINESS_MODEL_FRIENDLY_NAME[businessModelId] ?? "business";
          const article = /^[aeiou]/i.test(friendly) ? "an" : "a";
          return (
            <p className="text-xs text-emerald-300/90">
              Your inputs look realistic for {article} {friendly} business.
            </p>
          );
        })()}
        {businessModelId === "ECOMMERCE" || businessModelId === "GENERAL" || businessModelId === "SAAS" ? (
          <p className="text-xs text-[var(--muted)]">
            Calculations are adjusted based on typical industry ranges to ensure realistic estimates.
          </p>
        ) : null}
        <div className="space-y-3">
          <span id="revenue-estimate-style-label" className={riLabel}>
            Estimate style
          </span>
          <div
            role="radiogroup"
            aria-labelledby="revenue-estimate-style-label"
            aria-disabled={inputsDriftFromLastRun}
            className={`grid min-w-0 grid-cols-1 gap-3 ${inputsDriftFromLastRun ? "pointer-events-none opacity-45" : ""}`}
          >
            {SENSITIVITY_OPTIONS.map((o) => {
              const active = sensitivityMode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={inputsDriftFromLastRun}
                  onClick={() => setSensitivityMode(o.value)}
                  className={`min-w-0 max-w-full overflow-hidden rounded-xl border px-4 py-4 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39FF14]/60 ${
                    active
                      ? "border-[#39FF14]/50 bg-gradient-to-br from-[#39FF14]/18 to-[#0a1528] shadow-[0_0_28px_rgba(57,255,20,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-white/[0.08] bg-[#0a1220]/90 hover:border-white/20 hover:bg-[#0f1829]"
                  }`}
                >
                  <span className="block min-w-0 break-words text-sm font-bold leading-snug tracking-tight text-[#eaefff]">
                    {o.label}
                  </span>
                  <span className="mt-1.5 block min-w-0 break-words text-xs leading-snug text-slate-400">
                    {o.hint}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="min-w-0 break-words rounded-xl border border-white/[0.07] bg-[#0a1220]/80 px-4 py-3.5 text-sm leading-relaxed text-slate-300">
            {SENSITIVITY_EXPLANATION[
              inputsDriftFromLastRun && resultDisplayLock
                ? resultDisplayLock.sensitivityMode
                : sensitivityMode
            ]}
          </div>
          {inputsDriftFromLastRun && result ? (
            <p className="text-xs text-amber-200/95">
              Estimate styles are locked until you recalculate — your business numbers no longer match this run.
            </p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-white/10 hover:border-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <span>Advanced configuration</span>
            <span aria-hidden="true" className={`transition-transform ${advancedOpen ? "rotate-90" : ""}`}>→</span>
          </button>
          {advancedOpen && (
            <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-xs text-[var(--muted)]">
                These are the values currently used to estimate revenue. Edit the fields above to update them.
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {formatAdvancedSummary(businessModelId, advancedInputs(), defaults).map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="font-medium text-[var(--foreground)] tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === "saving" && !simulating && <span className="text-slate-500">Saving…</span>}
          {saveStatus === "saved" && <span className="text-[#39FF14]">Saved ✓</span>}
        </div>
        <div className="space-y-3 border-t border-white/[0.06] pt-6">
          <button
            type="button"
            onClick={runSimulation}
            disabled={simulating}
            className="w-full rounded-lg bg-[#CCFF33] py-4 text-center text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(57,255,20,0.2)] transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {simulating ? "Estimating…" : "Calculate revenue impact"}
          </button>
          <RevenueCalculationProgress active={simulating} />
          <p className="text-xs text-slate-500">
            Start with the highest-impact stage to recover the most revenue.
          </p>
        </div>
      </section>
          </div>

          <div className="col-span-12 min-w-0 space-y-8 lg:col-span-7 xl:col-span-8">
            {!result ? (
              <div className="rounded-2xl border border-dashed border-[#39FF14]/20 bg-gradient-to-br from-[#131b2e]/90 to-[#060e20]/95 p-12 text-center text-sm leading-relaxed text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                Add your business inputs, then tap{" "}
                <span className="font-semibold text-[#CCFF33]">Calculate revenue impact</span> to see live at-risk
                ranges for this project.
              </div>
            ) : (
              <section key={resultsRevealEpoch} className="space-y-6">
          {(profile?.lastRunAt &&
            snapshot?.timestamp &&
            new Date(snapshot.timestamp) > new Date(profile.lastRunAt)) ||
          inputsDriftFromLastRun ? (
            <div
              className="revenue-luxury-stagger space-y-2"
              style={{ "--luxury-d": "140ms" } as CSSProperties}
            >
              {profile?.lastRunAt && snapshot?.timestamp && new Date(snapshot.timestamp) > new Date(profile.lastRunAt) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                  Performance snapshot updated. Re-run the estimate.
                </div>
              )}
              {inputsDriftFromLastRun && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                  Business inputs changed (traffic, conversion, AOV, etc.). Tap Calculate again to refresh these numbers.
                </div>
              )}
            </div>
          ) : null}
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-12 xl:items-stretch">
            {/* Hero — bounded range + decision driver + trust disclaimer */}
            <div
              className="revenue-luxury-stagger relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#1a2438]/95 via-[#131b2e] to-[#0d1524] p-8 shadow-[0_0_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-10 xl:col-span-7"
              style={{ "--luxury-d": "180ms" } as CSSProperties}
            >
              <div
                className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(57,255,20,0.25) 0%, transparent 70%)" }}
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#39FF14]/35 to-transparent"
                aria-hidden="true"
              />
              <div className="relative z-[1]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#ffb4ab]">Revenue at risk</p>
              <p className="mt-3 text-4xl font-black leading-none tracking-tighter text-[#CCFF33] sm:text-5xl lg:text-6xl">
                {formatRevenueReadableAmount(opportunityLow)}
                <span className="text-[#dae2fd]/80"> – </span>
                {formatRevenueReadableAmount(opportunityHigh)}
                <span className="ml-2 text-xl font-normal tracking-normal text-slate-400 sm:text-2xl">/ month</span>
              </p>
              {showImpactPercent && (
                <p className="mt-3 text-lg font-bold text-[#dae2fd]">
                  <span className="text-[#ffb4ab]">~{impactPercentLow}% – {impactPercentHigh}%</span>{" "}
                  <span className="font-semibold text-slate-300">of your revenue at risk</span>
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-[#39FF14]/90">A large portion of this loss is recoverable.</p>
              <div className="mt-5 space-y-2">
                {primaryInsightCopy && <p className="max-w-xl text-lg italic leading-relaxed text-slate-400">&ldquo;{primaryInsightCopy}&rdquo;</p>}
                <p className="text-xs leading-snug text-slate-500">
                  Confidence: <span className="font-semibold text-[#dae2fd]">{confidenceLabel}</span>
                  <br />
                  <span className="text-[#dae2fd]/80">{confidenceMeaning}</span>
                </p>
                <p className="text-[11px] italic text-slate-500/90">
                  Based on performance patterns and user behavior impact.
                </p>
              </div>
              </div>
            </div>

            {/* Performance snapshot — beside hero on xl */}
            <div
              className={`revenue-luxury-stagger flex min-h-0 flex-col gap-4 rounded-2xl border bg-[#0a1220]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md sm:p-6 xl:col-span-5 ${
                snapshot &&
                typeof snapshot.overallHealth === "number" &&
                Number.isFinite(snapshot.overallHealth) &&
                snapshot.overallHealth < 45
                  ? "border-red-500/30 shadow-[0_0_32px_rgba(239,68,68,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]"
                  : "border-white/[0.08]"
              }`}
              style={{ "--luxury-d": "220ms" } as CSSProperties}
            >
              <div className="shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Performance snapshot</p>
                <p className="mt-1 max-w-prose text-xs leading-snug text-slate-500">
                  Latest lab snapshot driving this estimate.
                </p>
              </div>

              {snapshot ? (
                <>
                  {typeof snapshot.overallHealth === "number" && Number.isFinite(snapshot.overallHealth) ? (
                    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-black/30 p-4 ring-1 ring-inset ring-white/[0.04]">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Overall health
                        </span>
                        <span
                          className={`text-2xl font-black tabular-nums leading-none sm:text-3xl ${
                            snapshot.overallHealth < 45 ? "text-red-200" : "text-[#CCFF33]"
                          }`}
                        >
                          {(snapshot.overallHealth / 10).toFixed(1)}
                          <span className="text-base font-bold text-slate-500 sm:text-lg"> / 10</span>
                        </span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/45 ring-1 ring-inset ring-white/[0.06]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            snapshot.overallHealth < 45
                              ? "from-red-600 via-orange-500 to-amber-400"
                              : "from-amber-500 via-lime-400 to-[#39FF14]"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, snapshot.overallHealth))}%` }}
                          role="progressbar"
                          aria-valuenow={Math.round(snapshot.overallHealth)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Overall health score"
                        />
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        {snapshot.overallHealth < 45
                          ? "Weak lab scores — speed and stability are likely costing you conversions."
                          : "Solid baseline — tightening vitals can still unlock incremental revenue."}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    {(
                      [
                        {
                          key: "lcp",
                          label: "LCP",
                          value: snapshot.lcp != null ? `${snapshot.lcp.toFixed(2)}s` : "—",
                          urgent: typeof snapshot.lcp === "number" && Number.isFinite(snapshot.lcp) && snapshot.lcp > 2.5,
                        },
                        {
                          key: "tti",
                          label: "TTI",
                          value: formatTtiSnapshot(snapshot),
                          urgent: typeof snapshot.tti === "number" && Number.isFinite(snapshot.tti) && snapshot.tti > 5,
                        },
                        {
                          key: "inp",
                          label: "INP",
                          value: formatInpSnapshotMs(snapshot),
                          urgent: typeof snapshot.inp === "number" && Number.isFinite(snapshot.inp) && snapshot.inp > 0.2,
                        },
                        {
                          key: "cls",
                          label: "CLS",
                          value: snapshot.cls != null ? snapshot.cls.toFixed(3) : "—",
                          urgent: typeof snapshot.cls === "number" && Number.isFinite(snapshot.cls) && snapshot.cls > 0.1,
                        },
                      ] as const
                    ).map((cell) => (
                      <div
                        key={cell.key}
                        className={`rounded-xl border bg-gradient-to-b px-3 py-3.5 sm:px-4 ${
                          cell.urgent
                            ? "border-red-500/35 from-red-950/30 to-transparent shadow-[inset_0_0_0_1px_rgba(248,113,113,0.06)]"
                            : "border-[#39FF14]/12 from-white/[0.07] to-transparent"
                        }`}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{cell.label}</div>
                        <div
                          className={`mt-2 text-base font-black leading-none tabular-nums sm:text-lg ${
                            cell.urgent ? "text-red-100" : "text-[#CCFF33]"
                          }`}
                        >
                          {cell.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-slate-500">
                  No performance snapshot on file. Run an analysis from the home page to capture metrics.
                </p>
              )}
            </div>
            </div>

            {/* Stage breakdown */}
            <div className="space-y-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-bold tracking-tight text-[#dae2fd] sm:text-2xl">Leakage analysis</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Priority triage
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {revenueLossRows.map((row, rowIndex) => {
                  // A stage is "low impact" when its post-normalization
                  // share is below the threshold (e.g., CLS is good →
                  // Conversion stage drops to a few percent). In that case
                  // the stage card switches to a non-blame line and is
                  // never shown as the "Start here" highlight.
                  const isLowImpactStage = isRowLowImpactForHighlight(row);
                  const isHighest =
                    rowIndex === highestStageIndex && row.loss > 0 && !isLowImpactStage;
                  /** Meaningful loss but not the single “start here” priority — light urgency rail. */
                  const isSecondaryUrgent =
                    row.loss > 0 && !isLowImpactStage && !isHighest;
                  const cardClass = isHighest
                    ? "relative flex h-full min-h-[188px] flex-col justify-between overflow-hidden rounded-2xl border border-red-500/45 bg-gradient-to-b from-red-950/35 via-[#1a1418] to-[#0f0a0c] p-5 shadow-[0_0_40px_rgba(239,68,68,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-red-500/25"
                    : isSecondaryUrgent
                      ? "relative flex h-full min-h-[188px] flex-col justify-between overflow-hidden rounded-2xl border border-y border-r border-white/[0.09] border-l-2 border-l-red-500/50 bg-gradient-to-b from-red-950/12 to-[#0a101c] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 hover:border-red-500/30 hover:shadow-[0_12px_36px_rgba(239,68,68,0.08)]"
                      : "relative flex h-full min-h-[188px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-[#0a101c] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:border-white/15 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)]";
                  // Map canonical stage → message pool key. "Activation" surfaces
                  // as the user-facing "interaction" stage in the pool taxonomy.
                  const poolKey: StagePoolKey =
                    row.stage === "Landing"
                      ? "landing"
                      : row.stage === "Activation"
                        ? "interaction"
                        : "conversion";
                  const stageMessage = isLowImpactStage
                    ? STAGE_LOW_IMPACT_MESSAGE[row.stage]
                    : pickStageMessage(poolKey, expectedLoss);
                  return (
                    <div
                      key={row.stage}
                      className={`revenue-luxury-stagger ${cardClass}`}
                      style={{ "--luxury-d": `${320 + rowIndex * 110}ms` } as CSSProperties}
                    >
                      {isHighest ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-red-400 to-transparent opacity-95 shadow-[0_0_12px_rgba(248,113,113,0.9)]"
                          aria-hidden="true"
                        />
                      ) : isSecondaryUrgent ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex min-h-0 flex-1 flex-col justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                            Stage {rowIndex + 1}
                          </div>
                          <div className="text-base font-bold leading-snug text-[#eaefff]">{stageHeadingLabel(row.stage)}</div>
                          <p className="text-sm leading-relaxed text-slate-400">{stageMessage}</p>
                          {isHighest && (
                            <div className="inline-flex w-full max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-950/40 px-2.5 py-2 text-[10px] font-bold uppercase leading-snug tracking-wide text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.12)] sm:text-[11px]">
                              <span aria-hidden="true" className="text-red-300">
                                →
                              </span>
                              <span>Start here — highest recovery potential</span>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-white/[0.06] pt-3">
                          <div
                            className={`text-2xl font-black tabular-nums tracking-tight sm:text-3xl ${
                              isHighest
                                ? "text-[#fecaca] drop-shadow-[0_0_12px_rgba(248,113,113,0.35)]"
                                : isSecondaryUrgent
                                  ? "text-amber-200/95"
                                  : "text-[#CCFF33]"
                            }`}
                          >
                            {formatRevenueReadable(row.loss)}
                          </div>
                          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Potential recovery
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Primary CTA */}
            {projectId && (
              <div
                className="revenue-luxury-stagger overflow-hidden rounded-2xl border border-[#39FF14]/25 bg-gradient-to-r from-[#39FF14]/12 via-[#131b2e] to-[#060e20] p-1 shadow-[0_0_40px_rgba(57,255,20,0.08)]"
                style={{ "--luxury-d": `${320 + revenueLossRows.length * 110 + 80}ms` } as CSSProperties}
              >
                <Link
                  href={`/dashboard/${projectId}#action-priority-list`}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[#CCFF33] px-6 py-5 text-center text-sm font-black uppercase tracking-widest text-black transition hover:brightness-110 active:brightness-95 sm:px-10"
                >
                  {ctaLabel}
                </Link>
              </div>
            )}

            {/* Collapsible — projected revenue + confidence */}
            <details
              className="group revenue-luxury-stagger overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121a2a]/90 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
              style={{ "--luxury-d": `${320 + revenueLossRows.length * 110 + 200}ms` } as CSSProperties}
            >
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3">
                <span className="text-sm font-bold text-[#dae2fd]">Projected revenue after fixes</span>
                <span className="text-xs text-slate-500 group-open:hidden">Show</span>
                <span className="hidden text-xs text-slate-500 group-open:inline">Hide</span>
              </summary>
              <div className="mt-3 space-y-3">
                {/* Primary statement — current → improved (most prominent) */}
                <div className="space-y-1.5">
                  <p className="text-sm text-[var(--foreground)]">
                    You&rsquo;re currently making{" "}
                    <span className="font-semibold tabular-nums">
                      ~{formatRevenueReadableAmount(validated.currentRevenue)}/month
                    </span>
                  </p>
                  <p className="text-sm text-[var(--foreground)]">
                    Fixing these issues can increase it to{" "}
                    <span className="font-semibold tabular-nums text-[var(--accent)]">
                      {formatRevenueReadableAmount(validated.projectedLow)}–{formatRevenueReadableAmount(validated.projectedHigh)}/month
                    </span>
                  </p>
                </div>

                {/* Secondary — full potential, smaller and subtle */}
                <p className="text-xs text-[var(--muted)]">
                  Your full revenue potential is{" "}
                  <span className="tabular-nums text-[var(--foreground)]/85">
                    ~{formatRevenueReadableAmount(validated.baselineRevenue)}/month
                  </span>
                </p>

                {/* Explanation — lowest emphasis */}
                <p className="text-[11px] text-[var(--muted)]/80 leading-snug">
                  Fixing these issues won&rsquo;t fully close the gap, but it
                  can recover a significant portion of your lost revenue.
                </p>
              </div>
            </details>

            {/* Collapsible — calculation explanation */}
            <details
              className="group revenue-luxury-stagger overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1626]/95 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
              style={{ "--luxury-d": `${320 + revenueLossRows.length * 110 + 280}ms` } as CSSProperties}
            >
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3">
                <span className="text-sm font-bold text-[#dae2fd]">How this is calculated</span>
                <span className="text-[11px] text-slate-500 group-open:hidden">Show</span>
                <span className="hidden text-[11px] text-slate-500 group-open:inline">Hide</span>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-[var(--muted)] leading-relaxed">
                <p className="text-[var(--foreground)]/85">
                  This estimate is derived from a structured analysis of how
                  performance impacts user behavior and conversion outcomes
                  across your funnel:
                </p>
                <ul className="space-y-1 pl-4 list-disc marker:text-[var(--muted)]">
                  <li>Slow pages cause users to leave before seeing your product</li>
                  <li>Delays during interaction reduce engagement and progression</li>
                  <li>Instability during key actions reduces trust at the point of conversion</li>
                </ul>
                <p>
                  These effects are combined with your traffic and conversion
                  inputs to quantify the revenue impact of performance issues.
                </p>
              </div>
            </details>
          </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
