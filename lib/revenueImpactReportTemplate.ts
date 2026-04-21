/**
 * Revenue Impact Report — template only.
 * No calculations. No invented data. Use only provided values.
 * Caller must supply all values (e.g. impact range, uplift, gap) already computed elsewhere.
 * Language: simple, calm, executive briefing. Max 8 short paragraphs.
 */

export type RevenueImpactReportInput = {
  current_revenue: string;
  impact_low: string;
  impact_high: string;
  uplift_low: string;
  uplift_high: string;
  uplift_percent_low: string;
  uplift_percent_high: string;
  primary_stage: string;
  primary_lever: string;
  metric_name: string;
  current_metric_value: string;
  industry_benchmark: string;
  gap_value: string;
  industry_alignment: string;
  confidence_level: string;
  snapshot_date: string;
};

/**
 * Returns the report as plain text. Pass only real values; no calculations here.
 */
export function renderRevenueImpactReport(data: RevenueImpactReportInput): string {
  const sections: string[] = [];

  // 1. Revenue Snapshot
  sections.push(
    "1. Revenue Snapshot\n\n" +
      "Estimated revenue limitation for the period is " +
      data.impact_low +
      " to " +
      data.impact_high +
      " against current monthly revenue of " +
      data.current_revenue +
      ". Projected revenue uplift after improvements is " +
      data.uplift_low +
      " to " +
      data.uplift_high +
      " (" +
      data.uplift_percent_low +
      "% to " +
      data.uplift_percent_high +
      "% uplift)."
  );

  // 2. Metric Comparison
  sections.push(
    "2. Metric Comparison\n\n" +
      data.metric_name +
      " is currently " +
      data.current_metric_value +
      ". The industry benchmark is " +
      data.industry_benchmark +
      ". The gap is " +
      data.gap_value +
      "."
  );

  // 3. Why This Impacts Revenue
  sections.push(
    "3. Why This Impacts Revenue\n\n" +
      "This performance gap affects how users experience the product and how often they complete key actions. That in turn affects revenue."
  );

  // 4. Primary Focus
  sections.push(
    "4. Primary Focus\n\n" +
      "The main area to improve first is " +
      data.primary_stage +
      ", via " +
      data.primary_lever +
      "."
  );

  // 5. Expected Outcome
  sections.push(
    "5. Expected Outcome\n\n" +
      "Reaching the benchmark level for this metric can reduce friction and support the projected uplift range."
  );

  // 6. Industry Position
  sections.push(
    "6. Industry Position\n\n" +
      "Industry alignment is " +
      data.industry_alignment +
      ". That means your current result sits where it does relative to typical benchmarks."
  );

  // 7. Confidence Statement
  sections.push(
    "7. Confidence Statement\n\n" + "Confidence in this estimate is " + data.confidence_level + "."
  );

  // 8. Snapshot Reference
  sections.push(
    "8. Snapshot Reference\n\n" +
      "This report is based on the performance snapshot from " +
      data.snapshot_date +
      "."
  );

  return sections.join("\n\n");
}

// --- Founder-Friendly Revenue Impact Report ---

export type FounderFriendlyReportInput = {
  website_url: string;
  snapshot_date: string;
  current_revenue: string;
  impact_low: string;
  impact_high: string;
  uplift_low: string;
  uplift_high: string;
  uplift_percent_low: string;
  uplift_percent_high: string;
  primary_stage: string;
  primary_lever: string;
  metric_name: string;
  current_metric_value: string;
  industry_benchmark: string;
  gap_value: string;
  industry_alignment: string;
  confidence_level: string;
};

/**
 * Founder-friendly report. No calculations. Use only provided values.
 * Max 10 short sections, 1–3 sentences each. Simple, direct, practical.
 */
export function renderFounderFriendlyRevenueReport(data: FounderFriendlyReportInput): string {
  const sections: string[] = [];

  // 1. Revenue Snapshot
  sections.push(
    "1. Revenue Snapshot\n\n" +
      "Estimated monthly revenue limitation is " +
      data.impact_low +
      " to " +
      data.impact_high +
      " against current monthly revenue of " +
      data.current_revenue +
      ". Projected revenue uplift is " +
      data.uplift_low +
      " to " +
      data.uplift_high +
      " (" +
      data.uplift_percent_low +
      "% to " +
      data.uplift_percent_high +
      "% uplift)."
  );

  // 2. What This Means
  sections.push(
    "2. What This Means\n\n" +
      "This range is an estimate of how much revenue may be limited by current performance, and how much uplift is realistic if you improve. It is a guide, not a guarantee."
  );

  // 3. Primary Focus
  sections.push(
    "3. Primary Focus\n\n" +
      "Start with improving " +
      data.primary_stage +
      ". That is where the biggest lever sits for your business."
  );

  // 4. Metric Gap
  sections.push(
    "4. Metric Gap\n\n" +
      data.metric_name +
      " is currently " +
      data.current_metric_value +
      ". The industry benchmark is " +
      data.industry_benchmark +
      ". The gap is " +
      data.gap_value +
      "."
  );

  // 5. Why This Affects Revenue
  sections.push(
    "5. Why This Affects Revenue\n\n" +
      "When this metric is behind the benchmark, users can have a slower or less smooth experience. That often leads to fewer completions and lower revenue."
  );

  // 6. Expected Outcome
  sections.push(
    "6. Expected Outcome\n\n" +
      "Reaching the benchmark level can reduce friction and support the projected uplift range. Focus on one lever first, then reassess."
  );

  // 7. Industry Position
  sections.push(
    "7. Industry Position\n\n" +
      "Your industry alignment is " +
      data.industry_alignment +
      ". That means where you sit today compared to typical benchmarks for your space."
  );

  // 8. Confidence
  sections.push(
    "8. Confidence\n\n" + "Confidence in this estimate is " + data.confidence_level + "."
  );

  // 9. Snapshot Reference
  sections.push(
    "9. Snapshot Reference\n\n" +
      "This report is for " +
      data.website_url +
      " and is based on the performance snapshot from " +
      data.snapshot_date +
      "."
  );

  return sections.join("\n\n");
}
