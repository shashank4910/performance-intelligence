import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import { computeAllScores, type LighthouseMetrics } from "@/lib/riskEngine";
import { getPageSpeedApiKey } from "@/lib/pageSpeedEnv";

// Vercel: Node runtime for full-fat fetch + JSON parsing of large PageSpeed
// responses. Compare fans out to N sites so give it headroom.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const COMPARE_TIMEOUT_MS = 35000;
const METRICS_CONFIG: { key: string; auditId: string; label: string; unit: "ms" | "s" | "" }[] = [
  { key: "lcp", auditId: "largest-contentful-paint", label: "LCP", unit: "ms" },
  { key: "inp", auditId: "interaction-to-next-paint", label: "INP", unit: "ms" },
  { key: "cls", auditId: "cumulative-layout-shift", label: "CLS", unit: "" },
  { key: "ttfb", auditId: "server-response-time", label: "TTFB", unit: "ms" },
  { key: "fcp", auditId: "first-contentful-paint", label: "FCP", unit: "ms" },
  { key: "tbt", auditId: "total-blocking-time", label: "TBT", unit: "ms" },
  { key: "speedIndex", auditId: "speed-index", label: "Speed Index", unit: "ms" },
  { key: "tti", auditId: "interactive", label: "TTI", unit: "ms" },
];

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

async function fetchLighthouseForUrl(url: string): Promise<{
  overallHealth: number;
  lcp: number;
  metrics: Record<string, number>;
}> {
  const cached = getCache(`compare:${url}`) as typeof result | undefined;
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPARE_TIMEOUT_MS);

  const key = getPageSpeedApiKey();
  if (!key) throw new Error("PAGESPEED_API_KEY is not set");
  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${key}`,
    { signal: controller.signal }
  );
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`PageSpeed failed: ${res.status}`);
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
  const overallHealth = scores.overallHealth;
  const lcp = cleanMetrics.lcp;

  const metrics: Record<string, number> = {
    lcp: cleanMetrics.lcp,
    inp: cleanMetrics.inp,
    cls: cleanMetrics.cls,
    ttfb: audits["server-response-time"]?.numericValue ?? 0,
    fcp: cleanMetrics.fcp,
    tbt: cleanMetrics.tbt,
    speedIndex: cleanMetrics.speedIndex,
    tti: audits["interactive"]?.numericValue ?? 0,
  };

  const result = { overallHealth, lcp, metrics };
  setCache(`compare:${url}`, result);
  return result;
}

function formatMetricValue(value: number, unit: "ms" | "s" | ""): string {
  if (unit === "ms") {
    if (value >= 1000) return (value / 1000).toFixed(1) + " s";
    return Math.round(value) + " ms";
  }
  if (unit === "s") return (value / 1000).toFixed(2) + " s";
  return value.toFixed(3);
}

function formatGap(gapValue: number, unit: "ms" | "s" | "", userWorse: boolean): string {
  const abs = Math.abs(gapValue);
  if (unit === "") {
    return userWorse ? `+${gapValue.toFixed(3)} worse` : `${abs.toFixed(3)} better`;
  }
  const asSec = abs >= 1000;
  const str = asSec ? (abs / 1000).toFixed(1) + "s" : Math.round(abs) + "ms";
  return userWorse ? `+${str} slower` : `${str} faster`;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const userUrl = searchParams.get("userUrl")?.trim();
  const competitorUrlsRaw = searchParams.get("competitorUrls");
  const competitorUrls = competitorUrlsRaw
    ? competitorUrlsRaw.split(",").map((u) => u.trim()).filter(Boolean).slice(0, 3)
    : [];
  const estimatedMonthlyRevenue = Number(searchParams.get("estimatedMonthlyRevenue") || 0);

  if (!userUrl) {
    return NextResponse.json({ error: "userUrl is required" }, { status: 400 });
  }
  if (competitorUrls.length === 0) {
    return NextResponse.json({ error: "At least one competitor URL is required" }, { status: 400 });
  }

  const allUrls = [userUrl, ...competitorUrls];
  const results = await Promise.allSettled(
    allUrls.map((url) => fetchLighthouseForUrl(url))
  );

  const succeeded: { url: string; data: Awaited<ReturnType<typeof fetchLighthouseForUrl>> }[] = [];
  let failedCount = 0;
  results.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      succeeded.push({ url: allUrls[i], data: outcome.value });
    } else {
      failedCount++;
    }
  });

  if (succeeded.length === 0) {
    return NextResponse.json(
      { error: "All analyses failed. Please check URLs and try again." },
      { status: 502 }
    );
  }

  const userResult = succeeded.find((s) => s.url === userUrl);
  if (!userResult) {
    return NextResponse.json(
      { error: "Your site analysis failed. Please check the URL and try again." },
      { status: 502 }
    );
  }

  const sorted = [...succeeded].sort((a, b) => {
    if (b.data.overallHealth !== a.data.overallHealth) return b.data.overallHealth - a.data.overallHealth;
    return a.data.lcp - b.data.lcp;
  });
  const leader = sorted[0];
  const leaderIsUser = leader.url === userUrl;
  const runnerUp = sorted[1];
  const userIndex = sorted.findIndex((s) => s.url === userUrl);
  const rank = userIndex + 1;
  const totalSites = sorted.length;
  const gapToLeader = leader.data.overallHealth - userResult.data.overallHealth;

  type Row = {
    metric: string;
    label: string;
    userValue: number;
    leaderValue: number;
    userDisplay: string;
    leaderDisplay: string;
    gapText: string;
    gapValue: number;
    userWorse: boolean;
    unit: "ms" | "s" | "";
  };

  const comparisonTable: Row[] = [];

  for (const cfg of METRICS_CONFIG) {
    const userVal = userResult.data.metrics[cfg.key] ?? 0;
    const leaderVal = leader.data.metrics[cfg.key] ?? 0;
    const unit = (cfg.key === "cls" ? "" : "ms") as "ms" | "s" | "";
    const gapValue = userVal - leaderVal;
    const userWorse = cfg.key === "cls" ? userVal > leaderVal : userVal > leaderVal;
    const gapText = formatGap(gapValue, unit, userWorse);
    comparisonTable.push({
      metric: cfg.key,
      label: cfg.label,
      userValue: userVal,
      leaderValue: leaderVal,
      userDisplay: formatMetricValue(userVal, unit),
      leaderDisplay: formatMetricValue(leaderVal, unit),
      gapText,
      gapValue,
      userWorse,
      unit,
    });
  }

  let topRows: Row[] = [];
  if (leaderIsUser && runnerUp) {
    const strengths = METRICS_CONFIG.map((cfg) => {
      const userVal = userResult.data.metrics[cfg.key] ?? 0;
      const otherVal = runnerUp.data.metrics[cfg.key] ?? 0;
      const unit = (cfg.key === "cls" ? "" : "ms") as "ms" | "s" | "";
      const gapValue = cfg.key === "cls" ? otherVal - userVal : otherVal - userVal;
      return {
        metric: cfg.key,
        label: cfg.label,
        userValue: userVal,
        leaderValue: userVal,
        userDisplay: formatMetricValue(userVal, unit),
        leaderDisplay: formatMetricValue(otherVal, unit),
        gapText: formatGap(Math.abs(gapValue), unit, false),
        gapValue,
        userWorse: false,
        unit,
      };
    })
      .filter((r) => r.gapValue > 0)
      .sort((a, b) => b.gapValue - a.gapValue)
      .slice(0, 3);
    topRows = strengths;
  } else {
    topRows = comparisonTable
      .filter((r) => r.userWorse)
      .sort((a, b) => b.gapValue - a.gapValue)
      .slice(0, 3);
  }

  const userHealth10 = userResult.data.overallHealth / 10;
  const leaderHealth10 = leader.data.overallHealth / 10;

  const healthGap = leaderIsUser ? 0 : gapToLeader;
  const growthOpportunityScoreRaw = (leader.data.overallHealth - userResult.data.overallHealth) * 10;
  const growthOpportunityScore = leaderIsUser
    ? 0
    : Math.min(100, Math.max(0, growthOpportunityScoreRaw));
  const potentialRevenueGain =
    estimatedMonthlyRevenue > 0 && healthGap > 0
      ? Math.round(estimatedMonthlyRevenue * (healthGap / 100))
      : 0;

  let explanation: string;
  if (leaderIsUser) {
    explanation =
      "Your site currently leads in mobile performance among the compared competitors. Your LCP and responsiveness metrics are stronger, giving you a speed advantage.";
  } else {
    const topGap = topRows[0];
    const second = topRows[1];
    const lcpGap = topRows.find((r) => r.metric === "lcp");
    const ttfbGap = topRows.find((r) => r.metric === "ttfb");
    explanation =
      `Your site is currently behind the market leader in mobile performance. The biggest gap is in ${topGap?.label ?? "key metrics"} — ${topGap?.gapText ?? ""}.` +
      (second ? ` The leader also has better ${second.label}. ` : " ") +
      (lcpGap && lcpGap.metric !== topGap?.metric ? `Your content appears ${lcpGap.gapText} than the leader. ` : "") +
      (ttfbGap && ttfbGap.metric !== topGap?.metric ? "Faster server response time on the leader. " : "") +
      "Improving these areas would narrow the performance gap.";
  }

  return NextResponse.json({
    userHealth: userResult.data.overallHealth,
    userHealth10: Math.round(userHealth10 * 10) / 10,
    leaderHealth: leader.data.overallHealth,
    leaderHealth10: Math.round(leaderHealth10 * 10) / 10,
    leaderIsUser,
    rank,
    totalSites,
    gapToLeader: leaderIsUser ? 0 : gapToLeader,
    growthOpportunityScore: Math.round(growthOpportunityScore * 10) / 10,
    potentialRevenueGain,
    comparisonTable: topRows,
    failedCount,
    explanation,
  });
}
