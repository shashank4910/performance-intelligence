/**
 * ⚠️ LOCKED DECISION
 * Revenue Impact Model V2 is defined in /docs/DECISION_LOG.md
 *
 * Do NOT modify core impact logic without explicit approval.
 * This is a foundational product decision.
 */

/**
 * PROJECT CONTEXT
 *
 * Before modifying this file, read:
 * /docs/AI_CONTEXT.md
 * /docs/ARCHITECTURE.md
 *
 * This project is a Performance Intelligence Engine that converts
 * performance metrics into business impact insights.
 */





import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";

// Vercel: force the Node runtime (not Edge) so `pg`, `prisma`, and the full
// `openai` SDK work. `maxDuration` is the ceiling Vercel allows this route to
// run — PageSpeed + OpenAI chains routinely need 30–50s.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { getCache, setCache, deleteCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import {
  computeAllScores,
  estimateBusinessImpact,
  generateFixPriorities,
  getRiskLevel,
  calculateWeightedRisk,
  calculateRevenueRiskScore,
  getRevenueRiskLevel,
  getDataConfidence,
  normalizeWeights,
  type LighthouseMetrics,
} from "@/lib/riskEngine";
import { authOptions } from "@/lib/auth";
import { getOrCreateProject, getLastSnapshots } from "@/lib/project";
import { computePerformanceDelta } from "@/lib/deltaEngine";
import { getDefaultMonthlyRevenue, DEFAULT_BUSINESS_MODEL_KEY, computeBaselineRevenue } from "@/lib/impactEngine/businessModelRegistry";
import { computeCortexV2 } from "@/lib/impactEngine/cortexV2";
import {
  behaviorMetricsMsFromLighthouseAudits,
  computeHeadlineRevenueLeak,
} from "@/lib/headlineRevenueLeak";
import { attributeLeakToResources, type ResourceForAttribution } from "@/lib/impactEngine/revenueLeakCalculator";
import { getBusinessProfile } from "@/impactEngine/projectBusinessProfileService";
import { setLastScannedUrl, runAttributionDiagnostic, logDiagnosticReport } from "@/lib/diagnostics/attributionTester";
import { analyzeMetric } from "@/lib/metricIntelligenceEngine";
import { getPageSpeedApiKey } from "@/lib/pageSpeedEnv";
import { opportunityBoundsFromLoss, type SensitivityMode } from "@/lib/revenueImpactSensitivityMath";
import { dominantStageFromLeakByMetric } from "@/lib/revenueStabilityMonitoring";
import { generateExecutiveSummaryJson, type ExecutiveSummaryJson } from "@/lib/aiExecutiveSummary";
import {
  buildFounderExecutiveInputsFromAnalyzeData,
  generateExecutiveSummaryParagraph,
} from "@/lib/executiveSummaryParagraphOpenAI";
import { getEnv, warnIfMissingCoreEnv } from "@/lib/env";

const openai = new OpenAI({
  apiKey: getEnv("OPENAI_API_KEY"),
});

const IS_PROD = process.env.NODE_ENV === "production";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

/** Trim heavy Lighthouse fields before storing. Keeps audits, categories, timing, environment. */
function trimLighthouseForStorage(lighthouseResult: Record<string, unknown>): Record<string, unknown> {
  const trimmed = JSON.parse(JSON.stringify(lighthouseResult)) as Record<string, unknown>;
  delete trimmed.fullPageScreenshot;
  const audits = trimmed.audits as Record<string, unknown> | undefined;
  if (audits && typeof audits === "object") {
    delete audits["screenshot-thumbnails"];
    delete audits["final-screenshot"];
  }
  return trimmed;
}

/**
 * INP and (sometimes) CLS cannot be measured in a synthetic lab run. They are
 * reported by PageSpeed Insights at the top level via CrUX field data:
 *   pageSpeedData.loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT.percentile
 *   pageSpeedData.originLoadingExperience.metrics.INTERACTION_TO_NEXT_PAINT.percentile
 * CrUX returns INP in ms and CLS as an integer score that is the real CLS × 100.
 */
type FieldMetricKey =
  | "INTERACTION_TO_NEXT_PAINT"
  | "CUMULATIVE_LAYOUT_SHIFT_SCORE"
  | "LARGEST_CONTENTFUL_PAINT_MS"
  | "FIRST_CONTENTFUL_PAINT_MS"
  | "EXPERIMENTAL_TIME_TO_FIRST_BYTE";

function readFieldPercentile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageSpeedData: any,
  key: FieldMetricKey
): number | null {
  const fromUrl =
    pageSpeedData?.loadingExperience?.metrics?.[key]?.percentile;
  const fromOrigin =
    pageSpeedData?.originLoadingExperience?.metrics?.[key]?.percentile;
  const v =
    typeof fromUrl === "number"
      ? fromUrl
      : typeof fromOrigin === "number"
      ? fromOrigin
      : null;
  return v;
}

type RevenueImpactInputs = {
  lcpSeconds: number;
  cls: number;
  inpMs: number | null;
  mobilePerformanceScore: number;
  fieldDataAvailable: boolean;
  poorCWVCount: number;
};

type SeverityLevel = "High" | "Moderate" | "Low" | "None";

const INDUSTRY_MULTIPLIER: Record<string, number> = {
  ecommerce: 1.2,
  finance: 1.3,
  saas: 1.0,
  healthcare: 0.9,
  general: 1.0,
};

function computeRevenueImpact(
  inputs: RevenueImpactInputs,
  monthlyRevenue: number,
  mobileTrafficPercent: number,
  industry: string
): {
  minMonthlyLoss: number;
  maxMonthlyLoss: number;
  minAnnualLoss: number;
  maxAnnualLoss: number;
  recoveryPotentialMin: number;
  recoveryPotentialMax: number;
  confidenceScore: number;
  confidenceLabel: string;
  industryUsed: string;
  riskDrivers: {
    lcpImpact: SeverityLevel;
    clsImpact: SeverityLevel;
    inpImpact: SeverityLevel;
    mobileImpact: SeverityLevel;
  };
} {
  const { lcpSeconds, cls, inpMs, mobilePerformanceScore, fieldDataAvailable, poorCWVCount } = inputs;
  let minDrop = 0;
  let maxDrop = 0;

  if (lcpSeconds > 4) {
    minDrop += 0.25;
    maxDrop += 0.35;
  } else if (lcpSeconds > 3) {
    minDrop += 0.2;
    maxDrop += 0.3;
  } else if (lcpSeconds > 2.5) {
    minDrop += 0.1;
    maxDrop += 0.15;
  }

  if (cls > 0.25) {
    minDrop += 0.1;
    maxDrop += 0.2;
  } else if (cls > 0.1) {
    minDrop += 0.05;
    maxDrop += 0.1;
  }

  if (inpMs != null && inpMs > 500) {
    minDrop += 0.1;
    maxDrop += 0.15;
  }

  if (mobilePerformanceScore < 50) {
    minDrop += 0.15;
    maxDrop += 0.25;
  } else if (mobilePerformanceScore < 70) {
    minDrop += 0.08;
    maxDrop += 0.15;
  }

  if (maxDrop > 0.6) maxDrop = 0.6;
  if (minDrop > 0.5) minDrop = 0.5;

  const multiplier = INDUSTRY_MULTIPLIER[industry] ?? 1.0;
  minDrop *= multiplier;
  maxDrop *= multiplier;

  const mobileWeight = Math.min(100, Math.max(0, mobileTrafficPercent)) / 100;
  let adjustedMinLoss = monthlyRevenue * minDrop * mobileWeight;
  let adjustedMaxLoss = monthlyRevenue * maxDrop * mobileWeight;

  adjustedMinLoss = Math.min(adjustedMinLoss, monthlyRevenue);
  adjustedMaxLoss = Math.min(adjustedMaxLoss, monthlyRevenue);

  const minAnnualLoss = adjustedMinLoss * 12;
  const maxAnnualLoss = adjustedMaxLoss * 12;

  let confidence = 0;
  if (fieldDataAvailable) confidence += 30;
  else confidence += 10;

  if (poorCWVCount >= 2) confidence += 25;
  else if (poorCWVCount === 1) confidence += 15;
  else confidence += 5;

  if (mobileTrafficPercent >= 60) confidence += 20;
  else if (mobileTrafficPercent >= 30) confidence += 10;
  else confidence += 5;

  if (lcpSeconds > 4 || mobilePerformanceScore < 40) confidence += 15;
  else confidence += 10;

  if (confidence > 100) confidence = 100;
  const confidenceLabel =
    confidence >= 75 ? "High" : confidence >= 45 ? "Medium" : "Low";

  const lcpImpact: SeverityLevel =
    lcpSeconds > 4 ? "High" : lcpSeconds > 3 ? "Moderate" : lcpSeconds > 2.5 ? "Low" : "None";
  const clsImpact: SeverityLevel =
    cls > 0.25 ? "High" : cls > 0.1 ? "Moderate" : "Low";
  const inpImpact: SeverityLevel =
    inpMs != null && inpMs > 500 ? "High" : "Low";
  const mobileImpact: SeverityLevel =
    mobilePerformanceScore < 50 ? "High" : mobilePerformanceScore < 70 ? "Moderate" : "Low";

  return {
    minMonthlyLoss: Math.round(adjustedMinLoss),
    maxMonthlyLoss: Math.round(adjustedMaxLoss),
    minAnnualLoss: Math.round(minAnnualLoss),
    maxAnnualLoss: Math.round(maxAnnualLoss),
    recoveryPotentialMin: Math.round(adjustedMinLoss),
    recoveryPotentialMax: Math.round(adjustedMaxLoss),
    confidenceScore: confidence,
    confidenceLabel,
    industryUsed: industry,
    riskDrivers: { lcpImpact, clsImpact, inpImpact, mobileImpact },
  };
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const revenue = Number(searchParams.get("revenue") || 0);
  const mobileShare = Number(searchParams.get("mobileShare") || 100);
  const industry = (searchParams.get("industry") || "general").toLowerCase();
  const cacheKey = url ?? "";
  const weightsParam = searchParams.get("weights");
  const customWeights =
    weightsParam != null
      ? (() => {
          const parsed: Record<string, number> = {};
          for (const part of weightsParam.split(",")) {
            const [k, v] = part.split(":").map((s) => s.trim());
            if (k && v != null) parsed[k] = Number(v);
          }
          return Object.keys(parsed).length > 0 ? parsed : null;
        })()
      : null;
  const weights = normalizeWeights(customWeights);

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;

  warnIfMissingCoreEnv();

  if (!IS_PROD) {
    console.log("Revenue Inputs:", { revenue, mobileShare, industry });
  }

  const cached = getCache(cacheKey) as Record<string, unknown> | null | undefined;
  // Only anonymous sessions reuse PSI cache. Any logged-in user runs a full analyze so snapshots
  // persist and dashboard clients get fresh JSON (see also `run` query on dashboard navigation).
  if (cached != null && !session?.user) {
    const response: Record<string, unknown> & { userAuthenticated: boolean } = {
      ...cached,
      userAuthenticated: false,
    };
    const maybeInputs = response["revenueImpactInputs"];
    const inputs = (maybeInputs as RevenueImpactInputs | undefined) ?? undefined;
    if (revenue > 0 && inputs) {
      response["revenueImpact"] = computeRevenueImpact(inputs, revenue, mobileShare, industry);
    }
    return NextResponse.json(response);
  }

  try {
    const pageSpeedKey = getPageSpeedApiKey();
    if (!pageSpeedKey) {
      console.error("[analyze] PAGESPEED_API_KEY is missing");
      return NextResponse.json(
        {
          error:
            "PAGESPEED_API_KEY is not set. Add it to .env.local (Google Cloud: enable PageSpeed Insights API, create an API key).",
        },
        { status: 503 }
      );
    }

    deleteCache(cacheKey);
    setLastScannedUrl(url);
    // 1️⃣ Call PageSpeed API
    const pageSpeedRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=mobile&key=${pageSpeedKey}`
    );

    const pageSpeedRaw = await pageSpeedRes.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Lighthouse JSON is deeply nested and variable
    let pageSpeedData: any;
    try {
      pageSpeedData = JSON.parse(pageSpeedRaw);
    } catch {
      return NextResponse.json(
        { error: "PageSpeed returned invalid JSON. Try again or check the URL." },
        { status: 502 }
      );
    }

    if (!pageSpeedRes.ok) {
      const apiMsg =
        typeof pageSpeedData?.error?.message === "string" ? pageSpeedData.error.message : null;
      console.error("[analyze] PageSpeed HTTP", pageSpeedRes.status, apiMsg ?? pageSpeedRaw.slice(0, 200));
      return NextResponse.json(
        {
          error: apiMsg
            ? `PageSpeed API: ${apiMsg}`
            : `Failed to fetch PageSpeed data (HTTP ${pageSpeedRes.status}). Check the API key and quota.`,
        },
        { status: 502 }
      );
    }
    const audits = pageSpeedData?.lighthouseResult?.audits;

    if (!audits) {
      return NextResponse.json(
        { error: "Invalid Lighthouse response structure" },
        { status: 500 }
      );
    }

    const ttfbAudit = audits["server-response-time"];
    const ttfbValue =
      typeof ttfbAudit?.numericValue === "number"
        ? ttfbAudit.numericValue
        : null;
    const ttfbResolved =
      ttfbValue != null
        ? ttfbValue
        : audits["largest-contentful-paint"]?.details?.items?.[0]?.responseTime ?? null;
    const ttfbForLoad =
      ttfbResolved != null
        ? { ...ttfbAudit, numericValue: ttfbResolved }
        : { ...ttfbAudit, numericValue: undefined };

    const detailedMetrics = {
      core: {
        lcp: audits["largest-contentful-paint"],
        cls: audits["cumulative-layout-shift"],
        inp: audits["interaction-to-next-paint"],
        fcp: audits["first-contentful-paint"],
      },
      load: {
        speedIndex: audits["speed-index"],
        tti: audits["interactive"],
        ttfb: ttfbForLoad,
      },
      blocking: {
        tbt: audits["total-blocking-time"],
        longTasks: audits["long-tasks"],
        bootupTime: audits["bootup-time"],
        mainThread: audits["mainthread-work-breakdown"],
      },
      backend: {
        serverResponse: audits["server-response-time"],
        totalBytes: audits["total-byte-weight"],
        unusedJs: audits["unused-javascript"],
        unusedCss: audits["unused-css-rules"],
        networkRequests: audits["network-requests"],
      },
    };

    const METRIC_LABELS: Record<string, string> = {
      "largest-contentful-paint": "Largest Contentful Paint (LCP)",
      "cumulative-layout-shift": "Cumulative Layout Shift (CLS)",
      "interaction-to-next-paint": "Interaction to Next Paint (INP)",
      "first-contentful-paint": "First Contentful Paint (FCP)",
      "speed-index": "Speed Index",
      "interactive": "Time to Interactive (TTI)",
      "total-blocking-time": "Total Blocking Time (TBT)",
      "mainthread-work-breakdown": "Main Thread Work",
      "long-tasks": "Long Tasks",
      "bootup-time": "Bootup Time",
      "server-response-time": "Server Response Time (TTFB)",
      "total-byte-weight": "Total Page Size",
      "unused-javascript": "Unused JavaScript",
      "unused-css-rules": "Unused CSS",
      "network-requests": "Network Requests",
    };
    const TIME_IDS = new Set([
      "largest-contentful-paint", "first-contentful-paint", "interactive",
      "total-blocking-time", "bootup-time", "speed-index",
      "mainthread-work-breakdown", "long-tasks", "server-response-time",
    ]);
    function formatMetricValue(id: string, num: number | undefined | null): string | null {
      if (num == null || Number.isNaN(num)) return null;
      if (id === "server-response-time") return (num / 1000).toFixed(2) + " s";
      if (TIME_IDS.has(id)) return (num / 1000).toFixed(1) + " s";
      if (id === "cumulative-layout-shift") return num.toFixed(3);
      if (id === "total-byte-weight" || id === "unused-javascript" || id === "unused-css-rules")
        return (num / 1024).toFixed(1) + " KB";
      if (id === "network-requests") return String(Math.round(num));
      return String(num);
    }
    const SECTION_METRICS: { section: string; key: string; id: string }[] = [
      { section: "core", key: "lcp", id: "largest-contentful-paint" },
      { section: "core", key: "cls", id: "cumulative-layout-shift" },
      { section: "core", key: "inp", id: "interaction-to-next-paint" },
      { section: "core", key: "fcp", id: "first-contentful-paint" },
      { section: "load", key: "speedIndex", id: "speed-index" },
      { section: "load", key: "tti", id: "interactive" },
      { section: "load", key: "ttfb", id: "server-response-time" },
      { section: "blocking", key: "tbt", id: "total-blocking-time" },
      { section: "blocking", key: "mainThread", id: "mainthread-work-breakdown" },
      { section: "blocking", key: "longTasks", id: "long-tasks" },
      { section: "blocking", key: "bootupTime", id: "bootup-time" },
      { section: "backend", key: "totalBytes", id: "total-byte-weight" },
      { section: "backend", key: "unusedJs", id: "unused-javascript" },
      { section: "backend", key: "unusedCss", id: "unused-css-rules" },
      { section: "backend", key: "networkRequests", id: "network-requests" },
    ];

    type OffendingResource = {
      url: string | null;
      totalBytes: number;
      wastedBytes: number;
      element: string | null;
    };
    type AIMetricRow = {
      metricKey: string;
      label: string;
      displayValue: string;
      verdict: "Good" | "Needs Improvement" | "Poor";
      aiAnalysis?: { rootCause: string; fixes: string[]; impact: string; difficulty: string };
      resources?: OffendingResource[];
    };

    function extractOffendingResources(audit: any): OffendingResource[] {
      if (!audit?.details?.items || !Array.isArray(audit.details.items)) return [];
      return audit.details.items
        .map((item: any) => ({
          url: item.url || item.source || item.request?.url || null,
          totalBytes: item.totalBytes ?? item.transferSize ?? 0,
          wastedBytes: item.wastedBytes ?? 0,
          element: item.node?.selector || null,
        }))
        .filter((r: OffendingResource) => r.url || r.element)
        .sort((a: OffendingResource, b: OffendingResource) => b.wastedBytes - a.wastedBytes || b.totalBytes - a.totalBytes)
        .slice(0, 15);
    }

    /** Try multiple audit IDs so LCP/FCP etc. get resources from element or render-blocking audits. */
    function getResourcesForMetric(auditId: string, audits: Record<string, unknown>): OffendingResource[] {
      const idsToTry = [auditId];
      if (auditId === "largest-contentful-paint") {
        idsToTry.push("largest-contentful-paint-element", "render-blocking-resources");
      } else if (auditId === "first-contentful-paint" || auditId === "speed-index") {
        idsToTry.push("render-blocking-resources", "largest-contentful-paint-element");
      } else if (auditId === "total-blocking-time" || auditId === "mainthread-work-breakdown") {
        idsToTry.push("long-tasks", "mainthread-work-breakdown");
      } else if (auditId === "cumulative-layout-shift") {
        idsToTry.push("layout-shift-elements");
      }
      for (const id of idsToTry) {
        const res = extractOffendingResources(audits[id]);
        if (res.length > 0) return res;
      }
      return [];
    }

    const metrics_for_dashboard: AIMetricRow[] = [];

    for (const { section, key, id } of SECTION_METRICS) {
      const sectionData = detailedMetrics[section as keyof typeof detailedMetrics] as Record<string, unknown> | undefined;
      const audit = sectionData?.[key] as { numericValue?: number; score?: number | null; title?: string; description?: string } | undefined;
      if (!audit) continue;
      const numericValue = audit.numericValue;
      if (numericValue == null || numericValue === undefined) continue;
      const displayValue = formatMetricValue(id, numericValue);
      if (displayValue == null) continue;
      const score = audit.score;
      const verdict: AIMetricRow["verdict"] =
        score != null && score >= 0.9 ? "Good" : score != null && score >= 0.5 ? "Needs Improvement" : "Poor";
      const metricKey = `${section}-${key}`;
      const label = METRIC_LABELS[id] ?? id;
      const row: AIMetricRow = { metricKey, label, displayValue, verdict };

      // Extract offending resources from primary or fallback audits (so LCP/FCP get resources)
      const resources = getResourcesForMetric(id, audits);
      if (resources.length > 0) row.resources = resources;

      if (verdict !== "Good") {
        const aiCacheKey = `ai:${url}:${metricKey}`;
        let aiAnalysis = getCache(aiCacheKey) as AIMetricRow["aiAnalysis"] | undefined;
        const auditDesc = audit?.description ?? audit?.title ?? label;
        if (!aiAnalysis) {
          if (getEnv("OPENAI_API_KEY")) {
          try {
            const prompt = `You are a performance expert. For this Lighthouse metric that is failing or needs improvement:

Metric: ${label}
Value: ${displayValue}
Lighthouse context: ${auditDesc}

Return ONLY valid JSON with no markdown or extra text:
{ "rootCause": "one short paragraph", "fixes": ["fix1", "fix2", "fix3"], "impact": "Low|Medium|High", "difficulty": "Low|Medium|High" }`;
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              temperature: 0.2,
              messages: [
                { role: "system", content: "Return only valid JSON." },
                { role: "user", content: prompt },
              ],
            });
            const content = completion.choices[0].message?.content;
            if (content) {
              const parsed = JSON.parse(content);
              aiAnalysis = {
                rootCause: String(parsed.rootCause ?? ""),
                fixes: Array.isArray(parsed.fixes) ? parsed.fixes.map(String) : [],
                impact: String(parsed.impact ?? ""),
                difficulty: String(parsed.difficulty ?? ""),
              };
              setCache(aiCacheKey, aiAnalysis, 60 * 60 * 1000);
            }
          } catch {
            aiAnalysis = {
              rootCause: auditDesc ?? "Analysis unavailable.",
              fixes: [],
              impact: "",
              difficulty: "",
            };
          }
          } else {
            aiAnalysis = {
              rootCause: auditDesc ?? "Lighthouse metric – see description for details.",
              fixes: [],
              impact: "",
              difficulty: "",
            };
          }
        }
        if (aiAnalysis) row.aiAnalysis = aiAnalysis;
      }
      metrics_for_dashboard.push(row);
    }

    // 2️⃣ Extract metrics
    // INP is field-only (CrUX). CLS lab is reliable but we still keep a CrUX
    // fallback for parity. LCP/FCP also benefit from a CrUX fallback if the
    // lab audit is missing.
    const inpFieldMs = readFieldPercentile(pageSpeedData, "INTERACTION_TO_NEXT_PAINT");
    const clsFieldRaw = readFieldPercentile(pageSpeedData, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
    // CrUX returns CLS as integer score = real CLS × 100.
    const clsFieldValue = clsFieldRaw != null ? clsFieldRaw / 100 : null;
    const lcpFieldMs = readFieldPercentile(pageSpeedData, "LARGEST_CONTENTFUL_PAINT_MS");
    const fcpFieldMs = readFieldPercentile(pageSpeedData, "FIRST_CONTENTFUL_PAINT_MS");

    const lcpResolvedMs =
      audits["largest-contentful-paint"]?.numericValue ?? lcpFieldMs ?? null;
    const clsResolved =
      audits["cumulative-layout-shift"]?.numericValue ?? clsFieldValue ?? null;
    const inpResolvedMs =
      audits["interaction-to-next-paint"]?.numericValue ?? inpFieldMs ?? null;
    const fcpResolvedMs =
      audits["first-contentful-paint"]?.numericValue ?? fcpFieldMs ?? null;

    const cleanMetrics: LighthouseMetrics = {
      lcp: lcpResolvedMs ?? 0,
      cls: clsResolved ?? 0,
      inp: inpResolvedMs ?? 0,
      tbt: audits["total-blocking-time"]?.numericValue || 0,
      fcp: fcpResolvedMs ?? 0,
      speedIndex: audits["speed-index"]?.numericValue || 0,
      domSize: audits["dom-size"]?.numericValue || 0,
      mainThreadWork: audits["mainthread-work-breakdown"]?.numericValue || 0,
    };
    if (!IS_PROD) {
      console.log("Metrics:", {
        url,
        cleanMetrics,
        sources: {
          lcp: audits["largest-contentful-paint"]?.numericValue != null ? "lab" : lcpFieldMs != null ? "field" : "missing",
          cls: audits["cumulative-layout-shift"]?.numericValue != null ? "lab" : clsFieldValue != null ? "field" : "missing",
          inp: audits["interaction-to-next-paint"]?.numericValue != null ? "lab" : inpFieldMs != null ? "field" : "missing",
        },
      });
    }

    const lcpSeconds = (lcpResolvedMs ?? 0) / 1000;
    const cls = clsResolved ?? 0;
    const inpMs = inpResolvedMs;
    const mobilePerformanceScore =
      (pageSpeedData?.lighthouseResult?.categories?.performance?.score ?? 0) * 100;
    const fieldDataAvailable = !!(
      pageSpeedData?.loadingExperience ?? pageSpeedData?.originLoadingExperience
    );
    const cwvAudits = [
      audits["largest-contentful-paint"]?.score,
      audits["cumulative-layout-shift"]?.score,
      audits["interaction-to-next-paint"]?.score,
    ];
    const poorCWVCount = cwvAudits.filter(
      (s) => s != null && s < 0.5
    ).length;
    const revenueImpactInputs: RevenueImpactInputs = {
      lcpSeconds,
      cls,
      inpMs: inpMs ?? (typeof cleanMetrics.inp === "number" ? cleanMetrics.inp : null),
      mobilePerformanceScore,
      fieldDataAvailable,
      poorCWVCount,
    };

    // 3️⃣ Risk scores from engine only (no AI scoring)
    const scores = computeAllScores(cleanMetrics);
    const {
      speedRisk,
      uxRisk,
      seoRisk,
      conversionRisk,
      scalingRisk,
      overallHealth,
    } = scores;
    const overallRisk = 100 - overallHealth;
    const overallLevel = getRiskLevel(overallRisk);
    const priorities = generateFixPriorities(scores);
    const businessImpact = estimateBusinessImpact(overallHealth);

    // Weighted overall health (business-centric weights)
    const weightedRisk = calculateWeightedRisk(
      speedRisk,
      uxRisk,
      seoRisk,
      conversionRisk,
      scalingRisk,
      weights
    );
    const weightedOverallHealth = Math.round(Math.max(0, Math.min(100, 100 - weightedRisk)));

    // Revenue risk score (0–100) and level
    const revenueRiskScore = calculateRevenueRiskScore(
      speedRisk,
      uxRisk,
      conversionRisk,
      { lcp: cleanMetrics.lcp, inp: cleanMetrics.inp },
      mobileShare
    );
    const revenueRiskLevel = getRevenueRiskLevel(revenueRiskScore);

    // Data confidence
    const hasKeyMetrics = !!(cleanMetrics.lcp && (cleanMetrics.cls >= 0 || cleanMetrics.inp >= 0));
    const { confidenceLevel, confidenceScore } = getDataConfidence(fieldDataAvailable, hasKeyMetrics);

    // Revenue Intelligence: estimated monthly leak from LCP (uses project profile or GENERAL default)
    const lcpValueMs = typeof audits["largest-contentful-paint"]?.numericValue === "number"
      ? audits["largest-contentful-paint"].numericValue
      : cleanMetrics.lcp;
    let projectForUser: Awaited<ReturnType<typeof getOrCreateProject>> | null = null;
    let monthlyRevenueForLeak: number;
    let monthlyTraffic: number | undefined;
    let profileForResearch: Awaited<ReturnType<typeof getBusinessProfile>> | null = null;
    if (userId) {
      projectForUser = await getOrCreateProject(userId, url, industry);
      try {
        profileForResearch = await getBusinessProfile(projectForUser.id);
        monthlyRevenueForLeak = profileForResearch ? profileForResearch.monthlyRevenue : getDefaultMonthlyRevenue(DEFAULT_BUSINESS_MODEL_KEY);
        monthlyTraffic =
          profileForResearch?.advancedInputs != null && typeof (profileForResearch.advancedInputs as Record<string, unknown>).traffic === "number"
            ? (profileForResearch.advancedInputs as Record<string, unknown>).traffic as number
            : undefined;
      } catch {
        monthlyRevenueForLeak = getDefaultMonthlyRevenue(DEFAULT_BUSINESS_MODEL_KEY);
        monthlyTraffic = undefined;
      }
    } else {
      monthlyRevenueForLeak = getDefaultMonthlyRevenue(DEFAULT_BUSINESS_MODEL_KEY);
      monthlyTraffic = undefined;
    }

    // Used to estimate competitive revenue risk later without recomputing revenue.
    // We reuse the same baseline as the revenue engines above.
    let baselineRevenueForCompetitorAnalysis = monthlyRevenueForLeak;
    const auditsWithScore = audits as Record<string, { numericValue?: number; score?: number | null }>;

    const hasModelInputs =
      profileForResearch?.advancedInputs != null &&
      typeof profileForResearch.advancedInputs === "object" &&
      Object.keys(profileForResearch.advancedInputs).length > 0;

    let baselineRevenue = monthlyRevenueForLeak;
    if (profileForResearch) {
      if (hasModelInputs) {
        baselineRevenue = computeBaselineRevenue(
          profileForResearch.businessModelId,
          profileForResearch.advancedInputs as Record<string, unknown>
        );
      } else if (profileForResearch.monthlyRevenue > 0) {
        baselineRevenue = profileForResearch.monthlyRevenue;
      }
    }
    baselineRevenueForCompetitorAnalysis = baselineRevenue;

    const metricsMs = behaviorMetricsMsFromLighthouseAudits(auditsWithScore);
    const { totalLoss: estimatedMonthlyLeak, leakByMetric: leak_by_metric } = computeHeadlineRevenueLeak(
      baselineRevenue,
      metricsMs
    );

    const cortexResult = computeCortexV2({
      audits: auditsWithScore,
      monthlyRevenue: monthlyRevenueForLeak,
      monthlyTraffic,
    });
    const cortex_diagnostic = {
      totalLeak: cortexResult.totalLeak,
      leakByMetric: cortexResult.leakByMetric,
      diagnostic: cortexResult.diagnostic,
    };
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.log("--- CORTEX V2 DIAGNOSTIC (secondary) ---");
      console.log("TotalLeak:", cortexResult.totalLeak);
      console.log("SumResourceLeaks:", cortexResult.diagnostic.sumResourceLeaks);
      console.log(cortexResult.diagnostic.equalityCheck);
      console.log(
        "StageVisual:",
        cortexResult.diagnostic.stageVisualImpact,
        "StageInteraction:",
        cortexResult.diagnostic.stageInteractionImpact,
        "StageTrust:",
        cortexResult.diagnostic.stageTrustImpact,
        "Amplifier:",
        cortexResult.diagnostic.infrastructureAmplifier
      );
    }

    // Desktop run for device impact (mobile vs desktop)
    let deviceImpact: {
      mobile: { health: number; revenueRiskScore: number };
      desktop: { health: number; revenueRiskScore: number };
    } = {
      mobile: {
        health: overallHealth,
        revenueRiskScore,
      },
      desktop: {
        health: overallHealth,
        revenueRiskScore,
      },
    };
    try {
      const desktopRes = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          url
        )}&strategy=desktop&key=${pageSpeedKey}`
      );
      if (desktopRes.ok) {
        const desktopData = await desktopRes.json();
        const desktopAudits = desktopData?.lighthouseResult?.audits;
        if (desktopAudits) {
          const desktopMetrics: LighthouseMetrics = {
            lcp: desktopAudits["largest-contentful-paint"]?.numericValue || 0,
            cls: desktopAudits["cumulative-layout-shift"]?.numericValue || 0,
            inp: desktopAudits["interaction-to-next-paint"]?.numericValue || 0,
            tbt: desktopAudits["total-blocking-time"]?.numericValue || 0,
            fcp: desktopAudits["first-contentful-paint"]?.numericValue || 0,
            speedIndex: desktopAudits["speed-index"]?.numericValue || 0,
            domSize: desktopAudits["dom-size"]?.numericValue || 0,
            mainThreadWork: desktopAudits["mainthread-work-breakdown"]?.numericValue || 0,
          };
          const desktopScores = computeAllScores(desktopMetrics);
          const desktopRevRisk = calculateRevenueRiskScore(
            desktopScores.speedRisk,
            desktopScores.uxRisk,
            desktopScores.conversionRisk,
            { lcp: desktopMetrics.lcp, inp: desktopMetrics.inp },
            100 - mobileShare
          );
          deviceImpact = {
            mobile: { health: overallHealth, revenueRiskScore },
            desktop: {
              health: desktopScores.overallHealth,
              revenueRiskScore: desktopRevRisk,
            },
          };
        }
      }
    } catch {
      // Keep mobile-only deviceImpact
    }

    if (!IS_PROD) {
      console.log("Scores:", { url, ...scores });
    }
    // 4️⃣ Executive summary — deterministic four-part JSON + OpenAI founder plain-text band (no template body)
    const fallbackSummary = "Performance risks detected. Review breakdown for details.";
    let executiveSummary = fallbackSummary;
    let executiveSummaryJson: ExecutiveSummaryJson | undefined;

    const sensitivityModeForSummary: SensitivityMode =
      profileForResearch?.sensitivityMode === "conservative" ||
      profileForResearch?.sensitivityMode === "balanced" ||
      profileForResearch?.sensitivityMode === "aggressive"
        ? profileForResearch.sensitivityMode
        : "balanced";

    const execResult = generateExecutiveSummaryJson(
      {
        estimatedMonthlyLeak,
        leak_by_metric,
        revenueImpactInputs,
        detailed_metrics: detailedMetrics,
        fix_priorities: priorities,
        baselineRevenueForCompetitorAnalysis: baselineRevenue,
      },
      { baselineRevenue, sensitivityMode: sensitivityModeForSummary }
    );
    if (execResult.ok) {
      executiveSummaryJson = execResult.json;
      executiveSummary = [execResult.json.headline, execResult.json.impact, execResult.json.constraint, execResult.json.action].join(
        "\n\n"
      );
    } else {
      console.error("Executive summary:", execResult.error);
    }

    const founderExecInputs = buildFounderExecutiveInputsFromAnalyzeData(
      {
        estimatedMonthlyLeak,
        revenueImpactInputs,
        detailed_metrics: detailedMetrics,
        fix_priorities: priorities,
      },
      overallLevel
    );
    const deterministicFallback = execResult.ok
      ? [execResult.json.headline, execResult.json.impact, execResult.json.constraint, execResult.json.action].join("\n\n")
      : fallbackSummary;
    // `generateExecutiveSummaryParagraph` already handles its own try/catch and
    // falls back deterministically on OpenAI failures. This outer guard exists
    // so an unexpected throw (e.g. network layer crash) cannot take down the
    // whole /api/analyze response.
    let executiveSummaryParagraphResult: Awaited<ReturnType<typeof generateExecutiveSummaryParagraph>>;
    try {
      executiveSummaryParagraphResult = await generateExecutiveSummaryParagraph(
        openai,
        founderExecInputs,
        deterministicFallback
      );
    } catch (error) {
      console.error("[analyze] executive summary generation failed:", error);
      executiveSummaryParagraphResult = { summary: deterministicFallback };
    }
    const executiveSummaryParagraph = executiveSummaryParagraphResult.summary;

    // 5️⃣ Same JSON structure as frontend expects + business intelligence layer
   const response: Record<string, unknown> = {
      summary: {
        overall_health_score: overallHealth,
        overall_health_display: `${overallHealth}`,
        weighted_overall_health: weightedOverallHealth,
        risk_level: overallLevel,
        executive_summary: executiveSummaryParagraph,
        executive_summary_paragraph: executiveSummaryParagraph,
        ...(executiveSummaryParagraphResult.debug
          ? { executive_summary_debug: executiveSummaryParagraphResult.debug }
          : {}),
        ...(executiveSummaryJson ? { executive_summary_json: executiveSummaryJson } : {}),
        business_impact: businessImpact,
        confidenceLevel,
        confidenceScore,
      },
      overallHealth,
      weightedRisk,
      weightedOverallHealth,
      revenueRiskScore,
      revenueRiskLevel,
      estimatedMonthlyLeak,
      leak_by_metric,
      cortex_diagnostic,
      baselineRevenueForCompetitorAnalysis,
      ...(projectForUser ? { projectId: projectForUser.id } : {}),
      deviceImpact,
      confidenceLevel,
      confidenceScore,
      growthOpportunityScore: null,
      potentialRevenueGain: null,
      risk_breakdown: {
        speed_risk_score: speedRisk,
        speed_risk_level: getRiskLevel(speedRisk),
        ux_risk_score: uxRisk,
        ux_risk_level: getRiskLevel(uxRisk),
        seo_risk_score: seoRisk,
        seo_risk_level: getRiskLevel(seoRisk),
        conversion_risk_score: conversionRisk,
        conversion_risk_level: getRiskLevel(conversionRisk),
        scaling_risk_score: scalingRisk,
        scaling_risk_level: getRiskLevel(scalingRisk),
      },
      fix_priorities: priorities,
      detailed_metrics: detailedMetrics,
      metrics_for_dashboard,
      revenueImpactInputs,
      userAuthenticated: !!session?.user,
    };

    // 6️⃣ rawAudit for DB + for guest flow (included in response so save-pending-result can store it)
    const lighthouseResult = pageSpeedData?.lighthouseResult as Record<string, unknown> | undefined;
    const rawAudit =
      lighthouseResult && typeof lighthouseResult === "object"
        ? trimLighthouseForStorage(lighthouseResult)
        : undefined;
    if (rawAudit) {
      // Preserve CrUX field data for INP / CLS / LCP fallbacks and traceability.
      // Without this, only the lab Lighthouse audits survive, which means INP
      // (a field-only metric) is silently lost.
      if (pageSpeedData?.loadingExperience) {
        (rawAudit as Record<string, unknown>).loadingExperience =
          pageSpeedData.loadingExperience;
      }
      if (pageSpeedData?.originLoadingExperience) {
        (rawAudit as Record<string, unknown>).originLoadingExperience =
          pageSpeedData.originLoadingExperience;
      }
      response.rawAudit = rawAudit;
      if (!IS_PROD) {
        const sizeKB = (JSON.stringify(rawAudit).length / 1024).toFixed(1);
        console.log("rawAudit prepared:", { keys: Object.keys(rawAudit), sizeKB: `${sizeKB} KB` });
      }
    }

    // 7️⃣ Historical tracking: save snapshot for logged-in users, compute delta vs previous
    const ttfbMs =
      ttfbResolved != null
        ? ttfbResolved
        : audits["server-response-time"]?.numericValue ?? null;

    if (userId && projectForUser) {
      try {
        const { prisma } = await import("@/lib/prisma");
        // Persist null when truly missing so the UI can render "—" instead
        // of a misleading "0". Storing 0 silently masks "no data available".
        const clsForSnapshot =
          typeof clsResolved === "number" && !Number.isNaN(clsResolved)
            ? clsResolved
            : null;
        const inpSecondsForSnapshot =
          typeof inpResolvedMs === "number" && !Number.isNaN(inpResolvedMs)
            ? inpResolvedMs / 1000
            : null;
        const lcpSecondsForSnapshot =
          typeof lcpResolvedMs === "number" && !Number.isNaN(lcpResolvedMs)
            ? lcpResolvedMs / 1000
            : null;
        const tbtSeconds = typeof cleanMetrics.tbt === "number" && !Number.isNaN(cleanMetrics.tbt) ? cleanMetrics.tbt / 1000 : 0;
        const ttiMs = audits["interactive"]?.numericValue;
        const ttiSecondsForSnapshot =
          typeof ttiMs === "number" && !Number.isNaN(ttiMs) && ttiMs > 0 ? ttiMs / 1000 : null;
        const sensitivityModeForSnapshot: SensitivityMode =
          profileForResearch?.sensitivityMode === "conservative" ||
          profileForResearch?.sensitivityMode === "balanced" ||
          profileForResearch?.sensitivityMode === "aggressive"
            ? profileForResearch.sensitivityMode
            : "balanced";
        const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(
          typeof estimatedMonthlyLeak === "number" ? estimatedMonthlyLeak : 0,
          baselineRevenue,
          sensitivityModeForSnapshot
        );
        const dominantStageSnapshot = dominantStageFromLeakByMetric(leak_by_metric);
        const monitoringScoresSnapshot = {
          speed: speedRisk,
          ux: uxRisk,
          seo: seoRisk,
          conversion: conversionRisk,
        };

        await prisma.performanceSnapshot.create({
          data: {
            projectId: projectForUser.id,
            overallHealth,
            lcp: lcpSecondsForSnapshot ?? lcpSeconds,
            inp: inpSecondsForSnapshot,
            ttfb: ttfbMs != null && !Number.isNaN(ttfbMs) ? ttfbMs / 1000 : null,
            cls: clsForSnapshot,
            tbt: tbtSeconds,
            tti: ttiSecondsForSnapshot,
            revenueRisk: revenueRiskScore,
            rawAudit: (rawAudit ?? undefined) as unknown as any,
            revenueAtRiskMin: opportunityLow,
            revenueAtRiskMax: opportunityHigh,
            dominantStage: dominantStageSnapshot,
            monitoringScores: monitoringScoresSnapshot as unknown as object,
          },
        });
        const snapshots = await getLastSnapshots(projectForUser.id, 2);
        // Only compute delta when at least 2 snapshots exist; never default previous to current.
        if (snapshots.length >= 2) {
          const [current, previous] = snapshots;
          response.performanceChange = computePerformanceDelta(
            {
              overallHealth: current.overallHealth,
              lcp: current.lcp,
              inp: current.inp,
              ttfb: current.ttfb,
              revenueRisk: current.revenueRisk,
            },
            {
              overallHealth: previous.overallHealth,
              lcp: previous.lcp,
              inp: previous.inp,
              ttfb: previous.ttfb,
              revenueRisk: previous.revenueRisk,
            }
          );
        } else {
          response.performanceChange = { firstAnalysis: true };
        }
      } catch (e) {
        console.error("Snapshot save error:", e);
        response.performanceChange = { firstAnalysis: true };
      }
    }

    if (!IS_PROD) {
      console.log("Analysis Complete:", { url, overallHealth });
    }

    {
      const lcpIntel = analyzeMetric(
        { audits: pageSpeedData?.lighthouseResult?.audits as Record<string, unknown> },
        "lcp"
      );
      const resourcesForAttribution: ResourceForAttribution[] = lcpIntel.contributingResources.map(
        (r) => ({ impactLevel: r.urgencyLevel })
      );
      const attributedAmounts = attributeLeakToResources(
        typeof estimatedMonthlyLeak === "number" ? estimatedMonthlyLeak : 0,
        resourcesForAttribution
      );
      const diag = runAttributionDiagnostic(
        url,
        attributedAmounts,
        typeof estimatedMonthlyLeak === "number" ? estimatedMonthlyLeak : 0
      );
      logDiagnosticReport(diag);
    }

    const toCache = { ...response };
    delete (toCache as Record<string, unknown>).revenueImpact;
    delete (toCache as Record<string, unknown>).rawAudit;
    setCache(cacheKey, toCache);

    if (revenue > 0) {
      response.revenueImpact = computeRevenueImpact(
        revenueImpactInputs,
        revenue,
        mobileShare,
        industry
      );
    }
    return NextResponse.json(response);

  } catch (error: any) {
    console.error("Analysis Error:", { url, error });
    return NextResponse.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
