/**
 * Auto-diagnostic for revenue attribution data integrity.
 * Run at the end of every analysis to verify uniqueness, variance, and summation.
 */

let lastScannedUrl: string | null = null;

export function setLastScannedUrl(url: string): void {
  lastScannedUrl = url;
}

export function getLastScannedUrl(): string | null {
  return lastScannedUrl;
}

export type AttributionDiagnosticResult = {
  url: string;
  resourceCount: number;
  uniquenessCheck: "PASS" | "FAIL";
  varianceCheck: "PASS" | "FAIL";
  summationCheck: "PASS" | "FAIL";
  distinctDollarValues: number;
  attributedSum: number;
  expectedTotal: number;
};

const TOLERANCE = 0.01;

/**
 * Run attribution diagnostic.
 * a) UNIQUENESS: Does the resource list match the current URL? (currentUrl === lastScannedUrl)
 * b) VARIANCE: Count distinct dollar values; if count === 1 and resourceCount > 1, FAIL.
 * c) SUMMATION: Do attributed amounts sum exactly to estimatedMonthlyLeak (within 0.01)?
 */
export function runAttributionDiagnostic(
  currentUrl: string,
  attributedAmounts: number[],
  estimatedMonthlyLeak: number
): AttributionDiagnosticResult {
  const resourceCount = attributedAmounts.length;
  const uniquenessCheck = currentUrl === lastScannedUrl ? "PASS" : "FAIL";
  const distinctValues = new Set(attributedAmounts.map((v) => Math.round(v * 100)));
  const distinctDollarValues = distinctValues.size;
  const varianceCheck =
    resourceCount <= 1 || distinctDollarValues > 1 ? "PASS" : "FAIL";
  const attributedSum = attributedAmounts.reduce((s, v) => s + v, 0);
  const sumMatch = Math.abs(attributedSum - estimatedMonthlyLeak) <= TOLERANCE;
  const summationCheck = sumMatch ? "PASS" : "FAIL";

  const result: AttributionDiagnosticResult = {
    url: currentUrl,
    resourceCount,
    uniquenessCheck,
    varianceCheck,
    summationCheck,
    distinctDollarValues,
    attributedSum,
    expectedTotal: estimatedMonthlyLeak,
  };

  return result;
}

export function logDiagnosticReport(result: AttributionDiagnosticResult): void {
  console.log(
    [
      "--- DIAGNOSTIC REPORT ---",
      `URL: ${result.url}`,
      `Resource Count: ${result.resourceCount}`,
      `Math Variance Check: ${result.varianceCheck}`,
      `Total Revenue Sum: ${result.summationCheck}`,
      `Distinct dollar values: ${result.distinctDollarValues}`,
      `Attributed sum: ${result.attributedSum.toFixed(2)} (expected: ${result.expectedTotal.toFixed(2)})`,
    ].join("\n")
  );
}
