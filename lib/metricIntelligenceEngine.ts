/**
 * Metric Intelligence Engine — deterministic resource mapping and impact levels.
 * No numeric impact in UI; use urgencyLevel (High | Medium | Low) only.
 */
export type MetricKey = "lcp" | "tti" | "cls" | "ttfb" | "tbt" | "speedIndex" | "mainThread" | "bootupTime" | "unusedJs" | "unusedCss";

export type ContributingResource = {
  url: string;
  type: string;
  urgencyLevel: "High" | "Medium" | "Low";
  transferSize: number;
  reason: string;
  executionTimeMs?: number;
  shiftAmount?: number;
  causeType?: "image" | "font" | "script-injection" | "other";
  isRenderBlocking?: boolean;
  isBeforeMetricTime?: boolean;
  /** For display: which metric(s) this affects */
  affects?: string;
  /** Initiator URL or type (when available from audit). */
  initiator?: string;
  /** Number of requests merged when deduplicating by URL (optional). */
  requestCount?: number;
};

export type MetricIntelligenceResult = {
  metricValue: number | null;
  metricScore: number | null;
  contributingResources: ContributingResource[];
  keyIssueType: string;
  /** Overall impact for drawer header */
  overallImpactLevel: "High" | "Medium" | "Low";
};

type AuditLike = {
  numericValue?: number;
  score?: number | null;
  details?: { items?: unknown[] };
};

type RawAudit = { audits?: Record<string, unknown> };

type NetworkItem = {
  url?: string;
  resourceType?: string;
  transferSize?: number;
  startTime?: number;
  endTime?: number;
};

const BUFFER_MS = 50;

function typeFromUrl(url: string): string {
  const l = url.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico)(\?|$)/.test(l)) return "image";
  if (/\.js(\?|$)/.test(l)) return "js";
  if (/\.css(\?|$)/.test(l)) return "css";
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(l)) return "font";
  if (/\.(html?|php)(\?|$)/.test(l) || l.includes("?")) return "document";
  return "other";
}

/** Main-thread: aggregate execution time per script from long-tasks + main-thread-tasks (time overlap). */
function getScriptExecutionTimeMap(audits: Record<string, AuditLike>, networkItems: NetworkItem[]): Map<string, number> {
  const urlToMs = new Map<string, number>();
  const longTasks = audits["long-tasks"]?.details?.items as Array<{ url?: string; scriptUrl?: string; duration?: number; startTime?: number }> | undefined;
  const mtt = audits["main-thread-tasks"]?.details?.items as Array<{ startTime?: number; duration?: number; group?: string }> | undefined;

  if (Array.isArray(longTasks)) {
    for (const t of longTasks) {
      const u = t?.url ?? t?.scriptUrl ?? "";
      if (!u) continue;
      let dur = t?.duration ?? 0;
      if (dur > 0 && dur < 1) dur *= 1000; // seconds → ms
      if (dur <= 0) continue;
      urlToMs.set(u, (urlToMs.get(u) ?? 0) + dur);
    }
  }

  if (Array.isArray(mtt) && networkItems.length > 0) {
    for (const task of mtt) {
      const group = (task?.group ?? "") as string;
      if (!group.includes("scriptEvaluation") && !group.includes("scriptParseCompile")) continue;
      const taskStart = (task?.startTime ?? 0) * 1000;
      const taskEnd = taskStart + ((task?.duration ?? 0) * 1000);
      for (const req of networkItems) {
        const u = req.url ?? "";
        if (typeFromUrl(u) !== "js") continue;
        const reqStart = (req.startTime ?? 0) * 1000;
        const reqEnd = (req.endTime ?? req.startTime ?? 0) * 1000 + BUFFER_MS * 2;
        if (taskStart >= reqStart && taskStart <= reqEnd) {
          const overlap = Math.min(taskEnd, reqEnd) - taskStart;
          if (overlap > 0) urlToMs.set(u, (urlToMs.get(u) ?? 0) + overlap);
        }
      }
    }
  }

  return urlToMs;
}

function executionToImpactMainThread(executionTimeMs: number): "High" | "Medium" | "Low" {
  if (executionTimeMs > 200) return "High";
  if (executionTimeMs >= 80) return "Medium";
  return "Low";
}

function executionToImpactTBT(executionTimeMs: number): "High" | "Medium" | "Low" {
  if (executionTimeMs > 300) return "High";
  if (executionTimeMs >= 100) return "Medium";
  return "Low";
}

function overlapToImpactTTI(overlapMs: number): "High" | "Medium" | "Low" {
  if (overlapMs > 400) return "High";
  if (overlapMs >= 150) return "Medium";
  return "Low";
}

function ensureNonEmptyResources(
  result: MetricIntelligenceResult,
  networkItems: NetworkItem[],
  fallbackReason: string,
  metricKey: MetricKey,
  isPoor: boolean
): void {
  if (!isPoor || result.contributingResources.length > 0) return;
  const js = networkItems
    .filter((i) => typeFromUrl(i.url ?? "") === "js")
    .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
    .slice(0, 5);
  for (const it of js) {
    const url = it.url ?? "";
    if (!url) continue;
    result.contributingResources.push({
      url,
      type: "js",
      urgencyLevel: "Medium",
      transferSize: it.transferSize ?? 0,
      reason: fallbackReason,
      affects: metricKey === "mainThread" ? "Main Thread Work" : metricKey === "tbt" ? "TBT" : metricKey === "tti" ? "TTI" : undefined,
    });
  }
}

export function analyzeMetric(rawAudit: RawAudit | null | undefined, metricKey: MetricKey): MetricIntelligenceResult {
  const audits = (rawAudit?.audits ?? {}) as Record<string, AuditLike>;
  const result: MetricIntelligenceResult = {
    metricValue: null,
    metricScore: null,
    contributingResources: [],
    keyIssueType: "unknown",
    overallImpactLevel: "Medium",
  };

  const nr = audits["network-requests"]?.details?.items;
  const networkItems = (Array.isArray(nr) ? nr : []) as NetworkItem[];
  const rbr = audits["render-blocking-resources"]?.details?.items as Array<{ url?: string }> | undefined;
  const renderBlockingUrls = new Set<string>();
  if (Array.isArray(rbr)) for (const x of rbr) { if (x?.url) renderBlockingUrls.add(x.url); }

  // ---- Main Thread Work ----
  if (metricKey === "mainThread") {
    const mtw = audits["mainthread-work-breakdown"];
    result.metricValue = mtw?.numericValue ?? null;
    result.metricScore = mtw?.score != null ? mtw.score * 100 : null;
    result.keyIssueType = "main_thread_work";
    const scriptExecution = getScriptExecutionTimeMap(audits, networkItems);
    const sorted = [...scriptExecution.entries()].sort((a, b) => b[1] - a[1]);
    for (const [url, executionTimeMs] of sorted) {
      result.contributingResources.push({
        url,
        type: "js",
        urgencyLevel: executionToImpactMainThread(executionTimeMs),
        transferSize: networkItems.find((n) => n.url === url)?.transferSize ?? 0,
        reason: "Script execution on main thread",
        executionTimeMs,
        affects: "Main Thread Work",
      });
    }
    const isPoor = result.metricScore != null && result.metricScore < 50;
    ensureNonEmptyResources(result, networkItems, "Largest JavaScript by size may be contributing.", metricKey, isPoor);
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- TBT (execution time only) ----
  if (metricKey === "tbt") {
    const tbt = audits["total-blocking-time"];
    result.metricValue = tbt?.numericValue ?? null;
    result.metricScore = tbt?.score != null ? tbt.score * 100 : null;
    result.keyIssueType = "tbt_blocking";
    const scriptExecution = getScriptExecutionTimeMap(audits, networkItems);
    const sorted = [...scriptExecution.entries()].sort((a, b) => b[1] - a[1]);
    for (const [url, executionTimeMs] of sorted) {
      result.contributingResources.push({
        url,
        type: "js",
        urgencyLevel: executionToImpactTBT(executionTimeMs),
        transferSize: networkItems.find((n) => n.url === url)?.transferSize ?? 0,
        reason: "Blocking time from script execution",
        executionTimeMs,
        affects: "TBT",
      });
    }
    const isPoor = result.metricScore != null && result.metricScore < 50;
    ensureNonEmptyResources(result, networkItems, "Script may be contributing to blocking time.", metricKey, isPoor);
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- TTI (interactive overlap) ----
  if (metricKey === "tti") {
    const tti = audits["interactive"];
    result.metricValue = tti?.numericValue ?? null;
    result.metricScore = tti?.score != null ? tti.score * 100 : null;
    result.keyIssueType = "tti_blocking";
    const interactiveMs = result.metricValue ?? 0;
    const scriptExecution = getScriptExecutionTimeMap(audits, networkItems);
    const quietWindowStart = Math.max(0, interactiveMs - 500);
    for (const [url, executionTimeMs] of scriptExecution) {
      const req = networkItems.find((n) => n.url === url);
      const reqEnd = ((req?.endTime ?? req?.startTime ?? 0) * 1000) + executionTimeMs;
      const overlap = reqEnd > quietWindowStart ? Math.min(reqEnd, interactiveMs) - quietWindowStart : 0;
      const level = overlapToImpactTTI(overlap);
      result.contributingResources.push({
        url,
        type: "js",
        urgencyLevel: level,
        transferSize: req?.transferSize ?? 0,
        reason: "Script execution overlaps with time to interactive",
        executionTimeMs,
        affects: "TTI",
      });
    }
    result.contributingResources.sort((a, b) => (urgencyOrder(b.urgencyLevel) - urgencyOrder(a.urgencyLevel)));
    const isPoor = result.metricScore != null && result.metricScore < 50;
    ensureNonEmptyResources(result, networkItems, "Script may be delaying interactivity.", metricKey, isPoor);
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- Speed Index ----
  if (metricKey === "speedIndex") {
    const si = audits["speed-index"];
    result.metricValue = si?.numericValue ?? null;
    result.metricScore = si?.score != null ? si.score * 100 : null;
    result.keyIssueType = "speed_index_paint";
    const lcpEl = audits["largest-contentful-paint-element"]?.details as { items?: Array<{ node?: { selector?: string }; url?: string }> } | undefined;
    const lcpMs = (audits["largest-contentful-paint"]?.numericValue ?? 0) as number;
    const fcpMs = (audits["first-contentful-paint"]?.numericValue ?? 0) as number;

    const lcpItem = lcpEl?.items?.[0];
    const lcpUrl = lcpItem?.url ?? "";
    if (lcpUrl && typeFromUrl(lcpUrl) === "image") {
      result.contributingResources.push({
        url: lcpUrl,
        type: "image",
        urgencyLevel: "High",
        transferSize: networkItems.find((n) => n.url === lcpUrl)?.transferSize ?? 0,
        reason: "LCP image",
        affects: "Speed Index",
      });
    }
    for (const it of networkItems) {
      const url = it.url ?? "";
      if (!url) continue;
      const t = typeFromUrl(url);
      const startMs = (it.startTime ?? 0) * 1000;
      if (renderBlockingUrls.has(url) && t === "css") {
        result.contributingResources.push({
          url,
          type: "css",
          urgencyLevel: "High",
          transferSize: it.transferSize ?? 0,
          reason: "Render-blocking CSS",
          isRenderBlocking: true,
          affects: "Speed Index",
        });
      } else if (t === "font" && startMs < fcpMs) {
        result.contributingResources.push({
          url,
          type: "font",
          urgencyLevel: "Medium",
          transferSize: it.transferSize ?? 0,
          reason: "Font loaded before first paint",
          isBeforeMetricTime: true,
          affects: "Speed Index",
        });
      } else if (t === "js" && startMs < lcpMs) {
        result.contributingResources.push({
          url,
          type: "js",
          urgencyLevel: "Medium",
          transferSize: it.transferSize ?? 0,
          reason: "Script loaded before LCP",
          isBeforeMetricTime: true,
          affects: "Speed Index",
        });
      }
    }
    const isPoor = result.metricScore != null && result.metricScore < 50;
    if (isPoor && result.contributingResources.length === 0) {
      const beforeLcp = networkItems.filter((i) => ((i.startTime ?? 0) * 1000) < lcpMs).sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      for (const it of beforeLcp.slice(0, 5)) {
        const url = it.url ?? "";
        if (!url) continue;
        result.contributingResources.push({
          url,
          type: typeFromUrl(url),
          urgencyLevel: "Medium",
          transferSize: it.transferSize ?? 0,
          reason: "Early network request",
          affects: "Speed Index",
        });
      }
    }
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- CLS (layout-shift-elements only) ----
  if (metricKey === "cls") {
    const cls = audits["cumulative-layout-shift"];
    result.metricValue = cls?.numericValue ?? null;
    result.metricScore = cls?.score != null ? cls.score * 100 : null;
    result.keyIssueType = "cls_shift";
    const lsItems = audits["layout-shift-elements"]?.details?.items as Array<{
      node?: { selector?: string; nodeLabel?: string };
      score?: number;
      scoreDelta?: number;
    }> | undefined;
    if (Array.isArray(lsItems)) {
      for (const it of lsItems) {
        const shiftAmount = it?.scoreDelta ?? it?.score ?? 0;
        const selector = (it?.node as { selector?: string })?.selector ?? "";
        const label = (it?.node as { nodeLabel?: string })?.nodeLabel ?? "";
        let causeType: "image" | "font" | "script-injection" | "other" = "other";
        if (/img/i.test(selector) || /img/i.test(label)) causeType = "image";
        else if (/font|text/i.test(label) || /woff|ttf|font/i.test(selector)) causeType = "font";
        else if (/script|inject|ad/i.test(selector) || /script|inject|ad/i.test(label)) causeType = "script-injection";
        let urgency: "High" | "Medium" | "Low" = "Medium";
        if (shiftAmount > 0.1) urgency = "High";
        else if (shiftAmount >= 0.05) urgency = "Medium";
        else urgency = "Low";
        result.contributingResources.push({
          url: selector || label || "Layout shift element",
          type: causeType === "image" ? "image" : causeType === "font" ? "font" : "other",
          urgencyLevel: urgency,
          transferSize: 0,
          reason: causeType === "image" ? "Image without dimensions" : causeType === "font" ? "Font swap" : "Injected or dynamic content",
          shiftAmount,
          causeType,
          affects: "CLS",
        });
      }
    }
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- LCP (true element mapping) ----
  if (metricKey === "lcp") {
    const lcp = audits["largest-contentful-paint"];
    result.metricValue = lcp?.numericValue ?? null;
    result.metricScore = lcp?.score != null ? lcp.score * 100 : null;
    result.keyIssueType = "lcp_timing";
    const lcpMs = result.metricValue ?? 0;
    const lcpEl = audits["largest-contentful-paint-element"]?.details as { items?: Array<{ node?: { selector?: string }; url?: string; type?: string }> } | undefined;
    const lcpItem = lcpEl?.items?.[0];
    const lcpElementUrl = lcpItem?.url ?? "";
    const lcpElementType = (lcpItem?.type ?? typeFromUrl(lcpElementUrl)) as string;

    if (lcpElementUrl) {
      const isImage = typeFromUrl(lcpElementUrl) === "image";
      result.contributingResources.push({
        url: lcpElementUrl,
        type: lcpElementType || "other",
        urgencyLevel: isImage ? "High" : "Medium",
        transferSize: networkItems.find((n) => n.url === lcpElementUrl)?.transferSize ?? 0,
        reason: isImage ? "LCP image resource" : "LCP element resource",
        isBeforeMetricTime: true,
        affects: "LCP",
      });
    }
    for (const it of networkItems) {
      const url = it.url ?? "";
      if (!url) continue;
      const startMs = (it.startTime ?? 0) * 1000;
      if (startMs >= lcpMs) continue;
      const t = typeFromUrl(url);
      const isBlocking = renderBlockingUrls.has(url);
      if (isBlocking && t === "css") {
        result.contributingResources.push({
          url,
          type: "css",
          urgencyLevel: "High",
          transferSize: it.transferSize ?? 0,
          reason: "Render-blocking CSS",
          isRenderBlocking: true,
          isBeforeMetricTime: true,
          affects: "LCP",
        });
      } else if (t === "js" || t === "font" || t === "css") {
        const already = result.contributingResources.some((r) => r.url === url);
        if (!already) {
          result.contributingResources.push({
            url,
            type: t,
            urgencyLevel: isBlocking ? "High" : "Medium",
            transferSize: it.transferSize ?? 0,
            reason: isBlocking ? "Render-blocking" : `Loaded before LCP`,
            isRenderBlocking: isBlocking,
            isBeforeMetricTime: true,
            affects: "LCP",
          });
        }
      }
    }
    const isPoor = result.metricScore != null && result.metricScore < 50;
    if (isPoor && result.contributingResources.length === 0) {
      const beforeLcp = networkItems.filter((i) => ((i.startTime ?? 0) * 1000) < lcpMs).sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0));
      for (const it of beforeLcp.slice(0, 5)) {
        const url = it.url ?? "";
        if (!url) continue;
        result.contributingResources.push({
          url,
          type: typeFromUrl(url),
          urgencyLevel: "Medium",
          transferSize: it.transferSize ?? 0,
          reason: "Early request before LCP",
          isBeforeMetricTime: true,
          affects: "LCP",
        });
      }
    }
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    dedupeAndSortByUrgency(result);
    return result;
  }

  // ---- TTFB ----
  if (metricKey === "ttfb") {
    const ttfb = audits["server-response-time"];
    result.metricValue = ttfb?.numericValue ?? null;
    result.metricScore = ttfb?.score != null ? ttfb.score * 100 : null;
    result.keyIssueType = "ttfb_server";
    const mainDoc = networkItems.find(
      (i) => i.resourceType === "Document" || i.resourceType === "document" || (!String(i.url ?? "").includes(".js") && !String(i.url ?? "").includes(".css"))
    );
    const url = mainDoc?.url ?? "";
    if (url) {
      result.contributingResources.push({
        url,
        type: "document",
        urgencyLevel: "High",
        transferSize: mainDoc?.transferSize ?? 0,
        reason: "Main document request",
        affects: "TTFB",
      });
    }
    result.overallImpactLevel = "High";
    return result;
  }

  // ---- Bootup Time / Unused JS / Unused CSS (simple mapping, no empty when poor) ----
  if (metricKey === "bootupTime" || metricKey === "unusedJs" || metricKey === "unusedCss") {
    const audit = metricKey === "bootupTime" ? audits["bootup-time"] : metricKey === "unusedJs" ? audits["unused-javascript"] : audits["unused-css-rules"];
    result.metricValue = audit?.numericValue ?? null;
    result.metricScore = audit?.score != null ? audit.score * 100 : null;
    result.keyIssueType = metricKey === "bootupTime" ? "bootup_time" : metricKey === "unusedJs" ? "unused_js" : "unused_css";
    const detailItems = (audit?.details?.items ?? []) as Array<{ url?: string; totalBytes?: number; wastedBytes?: number }>;
    const resourceType = metricKey === "unusedCss" ? "css" : "js";
    for (const it of detailItems.slice(0, 15)) {
      const url = it?.url ?? "";
      if (!url) continue;
      const wasted = (it?.wastedBytes ?? it?.totalBytes ?? 0) / 1024;
      let urgency: "High" | "Medium" | "Low" = "Medium";
      if (wasted > 100) urgency = "High";
      else if (wasted >= 30) urgency = "Medium";
      else urgency = "Low";
      result.contributingResources.push({
        url,
        type: resourceType,
        urgencyLevel: urgency,
        transferSize: it?.totalBytes ?? 0,
        reason: metricKey === "unusedJs" ? "Unused JavaScript" : metricKey === "unusedCss" ? "Unused CSS" : "Bootup time",
        affects: metricKey === "bootupTime" ? "Bootup Time" : metricKey === "unusedJs" ? "Unused JS" : "Unused CSS",
      });
    }
    result.overallImpactLevel = result.contributingResources[0]?.urgencyLevel ?? "Medium";
    result.contributingResources.sort((a, b) => urgencyOrder(b.urgencyLevel) - urgencyOrder(a.urgencyLevel));
    return result;
  }

  dedupeAndSortByUrgency(result);
  return result;
}

function urgencyOrder(l: "High" | "Medium" | "Low"): number {
  return l === "High" ? 3 : l === "Medium" ? 2 : 1;
}

function dedupeAndSortByUrgency(result: MetricIntelligenceResult): void {
  const seen = new Set<string>();
  result.contributingResources = result.contributingResources.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  result.contributingResources.sort((a, b) => urgencyOrder(b.urgencyLevel) - urgencyOrder(a.urgencyLevel));
}
