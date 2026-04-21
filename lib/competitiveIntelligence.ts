import { IndustryBenchmark } from "@/lib/industryBenchmarks";

export type CompetitiveMetrics = {
  overallHealth: number;
  lcpSec: number;
  inpMs: number;
  ttfbMs: number;
  cls: number;
  tbtMs: number;
};

export type MetricRow = {
  metric: "Overall Health" | "LCP" | "INP" | "TTFB" | "CLS" | "TBT";
  unit: "" | "s" | "ms";
  yourValue: number;
  competitorValue: number | null;
  industryValue: number;
  competitorGap: number | null;
  industryGap: number;
  competitorStatus: "better" | "worse" | "neutral" | "na";
  industryStatus: "better" | "worse" | "neutral";
};

type PositionSegment = "Top 25%" | "Above Median" | "Below Median";

export type CompetitiveOutput = {
  rows: MetricRow[];
  avgCompetitorHealth: number | null;
  industryMedian: number;
  competitorHealthGap: number | null;
  industryHealthGap: number;
  percentileSegment: PositionSegment;
  metricGaps: Array<{ metric: string; competitorGap: number | null; industryGap: number }>;
};

function percentDelta(reference: number, gap: number): number {
  const denom = Math.max(Math.abs(reference), 1e-6);
  return Math.abs(gap) / denom;
}

function statusForGap(
  metric: MetricRow["metric"],
  gap: number | null,
  reference: number | null
): "better" | "worse" | "neutral" | "na" {
  if (gap == null || reference == null) return "na";
  if (percentDelta(reference, gap) <= 0.05) return "neutral";
  if (metric === "Overall Health") {
    return gap > 0 ? "better" : "worse";
  }
  // Timing/CLS/TBT: lower is better, so positive gap means slower/worse
  return gap > 0 ? "worse" : "better";
}

export function computeCompetitiveIntelligence(
  your: CompetitiveMetrics,
  competitorAvg: CompetitiveMetrics | null,
  benchmark: IndustryBenchmark
): CompetitiveOutput {
  const rows: MetricRow[] = [
    {
      metric: "Overall Health",
      unit: "",
      yourValue: your.overallHealth,
      competitorValue: competitorAvg?.overallHealth ?? null,
      industryValue: benchmark.healthMedian,
      competitorGap:
        competitorAvg != null ? your.overallHealth - competitorAvg.overallHealth : null,
      industryGap: your.overallHealth - benchmark.healthMedian,
      competitorStatus: statusForGap(
        "Overall Health",
        competitorAvg != null ? your.overallHealth - competitorAvg.overallHealth : null,
        competitorAvg?.overallHealth ?? null
      ),
      industryStatus: statusForGap(
        "Overall Health",
        your.overallHealth - benchmark.healthMedian,
        benchmark.healthMedian
      ) as "better" | "worse" | "neutral",
    },
    {
      metric: "LCP",
      unit: "s",
      yourValue: your.lcpSec,
      competitorValue: competitorAvg?.lcpSec ?? null,
      industryValue: benchmark.LCP,
      competitorGap: competitorAvg != null ? your.lcpSec - competitorAvg.lcpSec : null,
      industryGap: your.lcpSec - benchmark.LCP,
      competitorStatus: statusForGap(
        "LCP",
        competitorAvg != null ? your.lcpSec - competitorAvg.lcpSec : null,
        competitorAvg?.lcpSec ?? null
      ),
      industryStatus: statusForGap("LCP", your.lcpSec - benchmark.LCP, benchmark.LCP) as
        | "better"
        | "worse"
        | "neutral",
    },
    {
      metric: "INP",
      unit: "ms",
      yourValue: your.inpMs,
      competitorValue: competitorAvg?.inpMs ?? null,
      industryValue: benchmark.INP,
      competitorGap: competitorAvg != null ? your.inpMs - competitorAvg.inpMs : null,
      industryGap: your.inpMs - benchmark.INP,
      competitorStatus: statusForGap(
        "INP",
        competitorAvg != null ? your.inpMs - competitorAvg.inpMs : null,
        competitorAvg?.inpMs ?? null
      ),
      industryStatus: statusForGap("INP", your.inpMs - benchmark.INP, benchmark.INP) as
        | "better"
        | "worse"
        | "neutral",
    },
    {
      metric: "TTFB",
      unit: "ms",
      yourValue: your.ttfbMs,
      competitorValue: competitorAvg?.ttfbMs ?? null,
      industryValue: benchmark.TTFB,
      competitorGap: competitorAvg != null ? your.ttfbMs - competitorAvg.ttfbMs : null,
      industryGap: your.ttfbMs - benchmark.TTFB,
      competitorStatus: statusForGap(
        "TTFB",
        competitorAvg != null ? your.ttfbMs - competitorAvg.ttfbMs : null,
        competitorAvg?.ttfbMs ?? null
      ),
      industryStatus: statusForGap("TTFB", your.ttfbMs - benchmark.TTFB, benchmark.TTFB) as
        | "better"
        | "worse"
        | "neutral",
    },
    {
      metric: "CLS",
      unit: "",
      yourValue: your.cls,
      competitorValue: competitorAvg?.cls ?? null,
      industryValue: benchmark.CLS,
      competitorGap: competitorAvg != null ? your.cls - competitorAvg.cls : null,
      industryGap: your.cls - benchmark.CLS,
      competitorStatus: statusForGap(
        "CLS",
        competitorAvg != null ? your.cls - competitorAvg.cls : null,
        competitorAvg?.cls ?? null
      ),
      industryStatus: statusForGap("CLS", your.cls - benchmark.CLS, benchmark.CLS) as
        | "better"
        | "worse"
        | "neutral",
    },
    {
      metric: "TBT",
      unit: "ms",
      yourValue: your.tbtMs,
      competitorValue: competitorAvg?.tbtMs ?? null,
      industryValue: benchmark.TBT,
      competitorGap: competitorAvg != null ? your.tbtMs - competitorAvg.tbtMs : null,
      industryGap: your.tbtMs - benchmark.TBT,
      competitorStatus: statusForGap(
        "TBT",
        competitorAvg != null ? your.tbtMs - competitorAvg.tbtMs : null,
        competitorAvg?.tbtMs ?? null
      ),
      industryStatus: statusForGap("TBT", your.tbtMs - benchmark.TBT, benchmark.TBT) as
        | "better"
        | "worse"
        | "neutral",
    },
  ];

  const industryMedian = benchmark.healthMedian;
  const topQuartile = industryMedian + 10;
  const avgCompetitorHealth = competitorAvg?.overallHealth ?? null;
  const competitorHealthGap =
    avgCompetitorHealth != null ? your.overallHealth - avgCompetitorHealth : null;
  const industryHealthGap = your.overallHealth - industryMedian;

  let percentileSegment: PositionSegment = "Below Median";
  if (your.overallHealth >= topQuartile) percentileSegment = "Top 25%";
  else if (your.overallHealth >= industryMedian) percentileSegment = "Above Median";

  return {
    rows,
    avgCompetitorHealth,
    industryMedian,
    competitorHealthGap,
    industryHealthGap,
    percentileSegment,
    metricGaps: rows.map((r) => ({
      metric: r.metric,
      competitorGap: r.competitorGap,
      industryGap: r.industryGap,
    })),
  };
}

