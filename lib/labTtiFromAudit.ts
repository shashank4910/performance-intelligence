/**
 * Lab Time to Interactive (seconds) from a stored Lighthouse `rawAudit` blob.
 * Used when `performance_snapshot.tti` was not persisted (older rows) so UI
 * matches the dashboard / metrics_for_dashboard (interactive audit).
 */
export function ttiLabSecondsFromRawAudit(rawAudit: unknown): number | null {
  if (rawAudit == null || typeof rawAudit !== "object") return null;
  const audits = (rawAudit as { audits?: Record<string, { numericValue?: unknown }> }).audits;
  const raw = audits?.interactive?.numericValue;
  const ms = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  if (ms == null || ms <= 0) return null;
  return ms / 1000;
}
