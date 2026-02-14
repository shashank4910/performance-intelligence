import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCache, setCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import {
  computeAllScores,
  estimateBusinessImpact,
  generateFixPriorities,
  getRiskLevel,
  type LighthouseMetrics,
} from "@/lib/riskEngine";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
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

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  console.log("Revenue Inputs:", { revenue, mobileShare, industry });

  const cached = getCache(url) as Record<string, unknown> | null | undefined;
  if (cached != null) {
    const response = { ...cached };
    const inputs = response.revenueImpactInputs as RevenueImpactInputs | undefined;
    if (revenue > 0 && inputs) {
      response.revenueImpact = computeRevenueImpact(
        inputs,
        revenue,
        mobileShare,
        industry
      );
    }
    return NextResponse.json(response);
  }

  try {
    // 1️⃣ Call PageSpeed API
    const pageSpeedRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=mobile&key=${process.env.PAGESPEED_API_KEY}`
    );

    if (!pageSpeedRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch PageSpeed data" },
        { status: 500 }
      );
    }

    const pageSpeedData = await pageSpeedRes.json();
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
          url: item.url || item.source || null,
          totalBytes: item.totalBytes || item.transferSize || 0,
          wastedBytes: item.wastedBytes || 0,
          element: item.node?.selector || null,
        }))
        .filter((r: OffendingResource) => r.url || r.element)
        .sort((a: OffendingResource, b: OffendingResource) => b.wastedBytes - a.wastedBytes || b.totalBytes - a.totalBytes)
        .slice(0, 3);
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

      // Extract offending resources from raw audit details
      const rawAudit = audits[id];
      const resources = extractOffendingResources(rawAudit);
      if (resources.length > 0) row.resources = resources;

      if (verdict !== "Good") {
        const aiCacheKey = `ai:${url}:${metricKey}`;
        let aiAnalysis = getCache(aiCacheKey) as AIMetricRow["aiAnalysis"] | undefined;
        const auditDesc = audit?.description ?? audit?.title ?? label;
        if (!aiAnalysis) {
          if (process.env.OPENAI_API_KEY) {
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
    const cleanMetrics: LighthouseMetrics = {
      lcp: audits["largest-contentful-paint"]?.numericValue || 0,
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      inp: audits["interaction-to-next-paint"]?.numericValue || 0,
      tbt: audits["total-blocking-time"]?.numericValue || 0,
      fcp: audits["first-contentful-paint"]?.numericValue || 0,
      speedIndex: audits["speed-index"]?.numericValue || 0,
      domSize: audits["dom-size"]?.numericValue || 0,
      mainThreadWork: audits["mainthread-work-breakdown"]?.numericValue || 0,
    };
    console.log("Metrics:", { url, cleanMetrics });

    const lcpSeconds = cleanMetrics.lcp / 1000;
    const cls = cleanMetrics.cls;
    const inpMs = audits["interaction-to-next-paint"]?.numericValue ?? null;
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
      inpMs,
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
    console.log("Scores:", { url, ...scores });
    // 4️⃣ OpenAI only for executive_summary; fallback if it fails
    const fallbackSummary =
      "Performance risks detected. Review breakdown for details.";
    let executiveSummary = fallbackSummary;

    try {
      const prompt = `
You are a Performance Intelligence Engine for a SaaS product.

Given these Lighthouse metrics (times in ms):
${JSON.stringify(cleanMetrics)}

And these computed risk scores (0–100, higher = worse):
- Speed: ${speedRisk}
- UX: ${uxRisk}
- SEO: ${seoRisk}
- Conversion: ${conversionRisk}
- Scaling: ${scalingRisk}
- Overall health: ${overallHealth}/100

Write a short executive summary (2–4 sentences) for a non-technical stakeholder. Focus on what matters most for the business: user experience, conversions, and scalability. Be direct and actionable.

STRICT: Return only valid JSON. No markdown, no explanation outside JSON.

Return EXACTLY:
{ "executive_summary": "Your summary text here." }
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      });

      const content = completion.choices[0].message.content;
      if (content) {
        const parsed = JSON.parse(content);
        const summary = parsed.executive_summary ?? "";
        if (summary) executiveSummary = summary;
      }
    } catch {
      // Keep fallback; return full response anyway
    }

    // 5️⃣ Same JSON structure as frontend expects
    const response: Record<string, unknown> = {
      summary: {
        overall_health_score: overallHealth,
        overall_health_display: `${overallHealth}`,
        risk_level: overallLevel,
        executive_summary: executiveSummary,
        business_impact: businessImpact,
      },
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
    };
    console.log("Analysis Complete:", { url, overallHealth });

    const toCache = { ...response };
    delete (toCache as Record<string, unknown>).revenueImpact;
    setCache(url, toCache);

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
