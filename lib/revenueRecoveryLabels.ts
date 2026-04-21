/**
 * Business impact labels and action titles for Revenue Recovery Opportunities.
 * Maps performance issues to business outcomes and technical filenames to readable actions.
 */

/** Metric (engine key, normalized lowercase) -> business impact labels for "Improves" badges */
const METRIC_TO_IMPROVES: Record<string, string[]> = {
  lcp: ["Conversion"],
  tti: ["Conversion"],
  tbt: ["UX"],
  cls: ["Conversion"],
  speedindex: ["Speed"],
  ttfb: ["SEO", "Speed"],
  unusedjs: ["Speed"],
  unusedcss: ["Speed"],
  fcp: ["Speed"],
  mainthread: ["UX"],
  bootuptime: ["Speed"],
  inp: ["UX"],
};

/**
 * Returns "Improves" badge labels for a metric (engine key).
 * e.g. ["Speed", "UX", "Conversion"]
 */
export function getImprovesLabelsForMetric(engineKey: string): string[] {
  const k = engineKey.toLowerCase().replace(/-/g, "");
  const labels = METRIC_TO_IMPROVES[k];
  if (labels?.length) return [...labels];
  return ["Performance"];
}

/**
 * Converts technical resource URL/filename + metric into a readable action title.
 * Filename is shown separately as secondary text.
 */
export function getActionTitleForResource(
  url: string | null,
  engineKey: string,
  resourceType: string
): string {
  const t = resourceType.toLowerCase();
  const k = engineKey.toLowerCase().replace(/-/g, "");
  const lower = (url ?? "").toLowerCase();
  const filename = url ? lower.split("/").pop()?.split("?")[0] ?? "" : "";

  // Third-party / analytics
  if (
    /gtm|googletagmanager|gtag|google-analytics|facebook|hotjar|segment|mixpanel/i.test(
      filename || lower
    )
  ) {
    return "Defer analytics scripts";
  }

  // Unused CSS
  if (k === "unusedcss" && (t === "css" || /\.css(\?|$)/.test(filename))) {
    return "Remove unused CSS";
  }

  // Unused JS
  if (k === "unusedjs" && (t === "javascript" || /\.js(\?|$)/.test(filename))) {
    return "Reduce unused JavaScript";
  }

  // Blocking JS (LCP, FCP, Speed Index, TTI, TBT, etc.)
  if (t === "javascript" && /\.js(\?|$)/.test(filename)) {
    if (k === "tti" || k === "tbt" || k === "mainthread" || k === "bootuptime") {
      return "Reduce blocking JavaScript";
    }
    return "Defer or reduce blocking JavaScript";
  }

  // Blocking CSS
  if (t === "css" && /\.css(\?|$)/.test(filename)) {
    return "Defer blocking CSS";
  }

  // Fonts
  if (t === "font") {
    return "Optimize font loading";
  }

  // Images (LCP / CLS)
  if (t === "image") {
    return k === "cls" ? "Reserve space for images" : "Optimize LCP image";
  }

  // TTFB
  if (k === "ttfb") {
    return "Improve server response time";
  }

  return "Optimize resource";
}

export function resourceTypeFromUrl(url: string | null): string {
  if (!url) return "other";
  const lower = url.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico)/.test(lower)) return "image";
  if (/\.js(\?|$)/.test(lower)) return "javascript";
  if (/\.css(\?|$)/.test(lower)) return "css";
  if (/\.(woff2?|ttf|otf|eot)/.test(lower)) return "font";
  if (/(google-analytics|googletagmanager|gtag|facebook|hotjar|segment|mixpanel)/.test(lower)) return "third-party";
  return "other";
}

export function getFilenameFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").pop() || u.pathname;
    return path.length > 48 ? path.slice(0, 45) + "..." : path;
  } catch {
    return url.length > 48 ? url.slice(0, 45) + "..." : url;
  }
}
