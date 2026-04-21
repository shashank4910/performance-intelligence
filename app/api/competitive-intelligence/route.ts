import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rateLimit } from "@/lib/rateLimit";
import { getEnv } from "@/lib/env";
import { computeAllScores, type LighthouseMetrics } from "@/lib/riskEngine";
import { computeCompetitiveIntelligence, type CompetitiveMetrics } from "@/lib/competitiveIntelligence";
import { industryBenchmarks, type IndustryKey } from "@/lib/industryBenchmarks";
import { getPageSpeedApiKey } from "@/lib/pageSpeedEnv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: getEnv("OPENAI_API_KEY"),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

async function fetchMetrics(url: string): Promise<CompetitiveMetrics> {
  const key = getPageSpeedApiKey();
  if (!key) throw new Error("PAGESPEED_API_KEY is not set");
  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&strategy=mobile&key=${key}`
  );
  if (!res.ok) throw new Error(`PageSpeed failed (${res.status})`);
  const data = await res.json();
  const audits = data?.lighthouseResult?.audits;
  if (!audits) throw new Error("Invalid Lighthouse response");

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
  const scores = computeAllScores(cleanMetrics);
  return {
    overallHealth: scores.overallHealth,
    lcpSec: cleanMetrics.lcp / 1000,
    inpMs: cleanMetrics.inp,
    ttfbMs: audits["server-response-time"]?.numericValue || 0,
    cls: cleanMetrics.cls,
    tbtMs: cleanMetrics.tbt,
  };
}

function averageCompetitorMetrics(items: CompetitiveMetrics[]): CompetitiveMetrics | null {
  if (items.length === 0) return null;
  const sum = items.reduce(
    (acc, m) => ({
      overallHealth: acc.overallHealth + m.overallHealth,
      lcpSec: acc.lcpSec + m.lcpSec,
      inpMs: acc.inpMs + m.inpMs,
      ttfbMs: acc.ttfbMs + m.ttfbMs,
      cls: acc.cls + m.cls,
      tbtMs: acc.tbtMs + m.tbtMs,
    }),
    { overallHealth: 0, lcpSec: 0, inpMs: 0, ttfbMs: 0, cls: 0, tbtMs: 0 }
  );
  const n = items.length;
  return {
    overallHealth: sum.overallHealth / n,
    lcpSec: sum.lcpSec / n,
    inpMs: sum.inpMs / n,
    ttfbMs: sum.ttfbMs / n,
    cls: sum.cls / n,
    tbtMs: sum.tbtMs / n,
  };
}

async function aiIndustrySuggestion(userUrl: string): Promise<IndustryKey> {
  if (!getEnv("OPENAI_API_KEY")) return "generic";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify website into one of: ecommerce, fintech, saas, generic. Return only one token.",
        },
        {
          role: "user",
          content: `Classify this website URL: ${userUrl}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() || "";
    if (raw === "ecommerce" || raw === "fintech" || raw === "saas" || raw === "generic") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "generic";
}

async function aiCompetitiveExplanation(input: {
  userHealth: number;
  avgCompetitorHealth: number | null;
  industryMedian: number;
  metricGaps: Array<{ metric: string; competitorGap: number | null; industryGap: number }>;
  percentileSegment: string;
}): Promise<string> {
  if (!getEnv("OPENAI_API_KEY")) {
    return "Your site can improve competitive positioning by closing the largest performance gaps, especially where loading and responsiveness trail industry targets.";
  }
  const prompt = `
Use only these values. No invented numbers.
{
  "userHealth": ${input.userHealth},
  "avgCompetitorHealth": ${input.avgCompetitorHealth == null ? "null" : input.avgCompetitorHealth},
  "industryMedian": ${input.industryMedian},
  "metricGaps": ${JSON.stringify(input.metricGaps)},
  "percentileSegment": "${input.percentileSegment}"
}

Write max 4 sentences in executive tone:
- Compare user vs competitor average (if available)
- Compare user vs industry median
- Mention 2 biggest weaknesses
- Mention 1 strength if present
Return plain text only.
`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "Your site is closest to industry median in selected metrics, but remains behind in key load and responsiveness dimensions. Addressing the largest two metric gaps should improve your competitive position.";
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await request.json();
  const rawUserUrl = String(body?.userUrl || "").trim();
  const competitorUrls: string[] = Array.isArray(body?.competitorUrls)
    ? body.competitorUrls.map((u: unknown) => String(u || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  const selectedIndustry = String(body?.industry || "").trim().toLowerCase();

  if (!rawUserUrl) {
    return NextResponse.json({ error: "userUrl is required" }, { status: 400 });
  }

  const userUrl = normalizeUrl(rawUserUrl);
  const normalizedCompetitors = competitorUrls.map(normalizeUrl);

  const industry: IndustryKey =
    selectedIndustry === "ecommerce" ||
    selectedIndustry === "fintech" ||
    selectedIndustry === "saas" ||
    selectedIndustry === "generic"
      ? selectedIndustry
      : await aiIndustrySuggestion(userUrl);

  const benchmark = industryBenchmarks[industry];

  try {
    const userMetrics = await fetchMetrics(userUrl);
    const competitorSettled = await Promise.allSettled(
      normalizedCompetitors.map((url) => fetchMetrics(url))
    );
    const competitorSites = competitorSettled
      .map((r, i) => ({ result: r, url: normalizedCompetitors[i] }))
      .filter(
        (x): x is { result: PromiseFulfilledResult<CompetitiveMetrics>; url: string } =>
          x.result.status === "fulfilled"
      )
      .map((x) => ({ url: x.url, metrics: x.result.value }));
    const competitorMetrics = competitorSites.map((c) => c.metrics);
    const competitorAvg = averageCompetitorMetrics(competitorMetrics);

    const deterministic = computeCompetitiveIntelligence(userMetrics, competitorAvg, benchmark);

    const strategicInsight = await aiCompetitiveExplanation({
      userHealth: userMetrics.overallHealth,
      avgCompetitorHealth: deterministic.avgCompetitorHealth,
      industryMedian: deterministic.industryMedian,
      metricGaps: deterministic.metricGaps,
      percentileSegment: deterministic.percentileSegment,
    });

    return NextResponse.json({
      industry,
      benchmark,
      userMetrics,
      competitorCount: competitorMetrics.length,
      competitorSites,
      competitorAvg,
      ...deterministic,
      strategicInsight,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to compute competitive intelligence." },
      { status: 500 }
    );
  }
}

