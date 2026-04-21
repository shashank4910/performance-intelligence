/**
 * Compute performance deltas between current and previous snapshot.
 * Handles nulls and avoids divide-by-zero.
 */

export type SnapshotMetrics = {
  overallHealth: number | null;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
  revenueRisk: number | null;
};

export type PerformanceDelta = {
  firstAnalysis: false;
  deltaHealth: number;
  deltaMetrics: {
    lcp: number;
    inp: number;
    ttfb: number;
    revenueRisk: number;
  };
};

export type PerformanceChangeResult =
  | { firstAnalysis: true }
  | PerformanceDelta;

export function computePerformanceDelta(
  current: SnapshotMetrics,
  previous: SnapshotMetrics
): PerformanceChangeResult {
  const safe = (a: number | null, b: number | null): number => {
    if (a == null && b == null) return 0;
    if (a == null) return -(b ?? 0);
    if (b == null) return a ?? 0;
    return a - b;
  };

  return {
    firstAnalysis: false,
    deltaHealth: safe(current.overallHealth, previous.overallHealth),
    deltaMetrics: {
      lcp: safe(current.lcp, previous.lcp),
      inp: safe(current.inp, previous.inp),
      ttfb: safe(current.ttfb, previous.ttfb),
      revenueRisk: safe(current.revenueRisk, previous.revenueRisk),
    },
  };
}
