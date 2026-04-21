export type MetricAIContext = {
  metricKey: string;
  metricValue: number | null;
  keyIssueType: string;
  topPatternsDetected?: string[];
  totalResourceCount?: number;
};

/** Context for AI explanation (metricValue can be display string). */
export type MetricExplanationContext = {
  metricKey: string;
  metricValue: number | string;
  keyIssueType: string;
  topPatternsDetected?: string[];
  totalResourceCount?: number;
};

export type MetricAIExplanationResult = {
  shortExplanation: string;
  detailedExplanation: string;
};

const METRIC_NAMES: Record<string, string> = {
  lcp: "Largest Contentful Paint",
  tti: "Time to Interactive",
  cls: "Cumulative Layout Shift",
  ttfb: "Server Response Time",
  tbt: "Total Blocking Time",
  speedIndex: "Speed Index",
  mainThread: "Main Thread Work",
  bootupTime: "Bootup Time",
  unusedJs: "Unused JavaScript",
};

function formatValue(metricKey: string, value: number | null): string {
  if (value == null) return "slower than recommended";
  if (metricKey === "cls") return `${value.toFixed(3)}`;
  if (metricKey === "ttfb" || metricKey === "tti" || metricKey === "tbt" || metricKey === "lcp" || metricKey === "speedIndex" || metricKey === "mainThread" || metricKey === "bootupTime") {
    const s = value / 1000;
    return `${s.toFixed(1)}s`;
  }
  if (metricKey === "unusedJs") return `${(value / 1024).toFixed(1)} KB`;
  return String(value);
}

export function buildMetricExplanationPrompt(ctx: MetricExplanationContext): string {
  const name = METRIC_NAMES[ctx.metricKey] ?? ctx.metricKey;
  return `You are explaining ${name} impact to a non-technical founder.

Explain:
- What is happening
- How it affects users
- Why it matters for engagement or conversion
- Why fixing it improves experience

Avoid:
- Numeric references
- Technical jargon
- Lighthouse mentions
- Score discussion

Keep 4–6 sentences max. Clear. Strategic. Insightful.

Context: Issue type ${ctx.keyIssueType}. Contributing resources: ${ctx.totalResourceCount ?? 0}.

Return ONLY valid JSON with no markdown or extra text:
{ "shortExplanation": "2-3 sentences, plain English, no numbers", "detailedExplanation": "4-6 sentences as above" }`;
}

export function parseMetricExplanationResponse(content: string | null | undefined): MetricAIExplanationResult | null {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim().replace(/^```\w*\n?|\n?```$/g, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as { shortExplanation?: string; detailedExplanation?: string };
    const short = typeof parsed.shortExplanation === "string" ? parsed.shortExplanation.trim() : "";
    const detailed = typeof parsed.detailedExplanation === "string" ? parsed.detailedExplanation.trim() : "";
    if (short || detailed) return { shortExplanation: short || "Analysis unavailable.", detailedExplanation: detailed || short };
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate AI short and detailed explanation via OpenAI. Call from server only.
 * Falls back to deterministic explanation if no API key or on error.
 */
export async function generateMetricAIExplanationAsync(ctx: MetricExplanationContext): Promise<MetricAIExplanationResult> {
  const syncCtx: MetricAIContext = {
    metricKey: ctx.metricKey,
    metricValue: typeof ctx.metricValue === "number" ? ctx.metricValue : null,
    keyIssueType: ctx.keyIssueType,
    topPatternsDetected: ctx.topPatternsDetected,
    totalResourceCount: ctx.totalResourceCount,
  };
  const fallback = generateMetricAIExplanation(syncCtx);
  const key = typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined;
  if (!key) return fallback;
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: buildMetricExplanationPrompt(ctx) },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    const parsed = parseMetricExplanationResponse(content);
    if (parsed) return parsed;
  } catch {
    // use fallback
  }
  return fallback;
}

export function generateMetricAIExplanation(context: MetricAIContext): MetricAIExplanationResult {
  const { metricKey, keyIssueType, totalResourceCount = 0 } = context;
  const name = METRIC_NAMES[metricKey] ?? metricKey;

  let shortExplanation = "";
  let detailedExplanation = "";

  if (keyIssueType === "lcp_timing") {
    shortExplanation = "The main content is taking too long to appear. Slow or blocking images, fonts, or styles often cause this. Users wait longer before they see what matters.";
    detailedExplanation = "The largest visible part of your page is appearing later than it should. That delay hurts first impressions and can make visitors leave before they engage. Fixing the resources that block or delay that content will make the page feel faster and more reliable.";
  } else if (keyIssueType === "tti_blocking") {
    shortExplanation = "The page becomes ready for interaction too late. Heavy scripts keep the main thread busy, so users cannot click or scroll smoothly when they expect to.";
    detailedExplanation = "When the page is slow to become interactive, users may try to use it before it is ready and experience lag or unresponsiveness. That hurts trust and engagement. Reducing script work during load and deferring non-critical code helps the page feel responsive sooner.";
  } else if (keyIssueType === "cls_shift") {
    shortExplanation = "Content is moving around as the page loads. Images or fonts without reserved space, or content injected late, cause layout jumps and hurt readability.";
    detailedExplanation = "Layout shifts make the page feel unstable and can cause misclicks or frustration. Reserving space for images and fonts and avoiding inserting content above existing content keeps the layout stable and improves readability and trust.";
  } else if (keyIssueType === "ttfb_server") {
    shortExplanation = "The server is responding slowly. The first response from your server arrives late, which delays everything that follows.";
    detailedExplanation = "A slow server response pushes back when the page can start loading and when users see content. Improving server performance, using a CDN, and caching where possible will help the page start loading sooner and feel faster.";
  } else if (keyIssueType === "tbt_blocking") {
    shortExplanation = "The page is blocked by JavaScript for too long. Long-running scripts prevent the browser from responding to user input quickly.";
    detailedExplanation = "When the main thread is busy with scripts, clicks and taps feel delayed. Breaking up long tasks and deferring non-critical JavaScript helps the page respond to users sooner and improves perceived responsiveness.";
  } else if (keyIssueType === "main_thread_work") {
    shortExplanation = "The main thread is doing too much work during load. Script evaluation and parsing keep the browser busy and delay when the page becomes responsive.";
    detailedExplanation = "Heavy main thread work delays interactivity and makes the page feel slow. Reducing script size, code-splitting, and moving work off the main thread where possible will help the page become usable sooner.";
  } else if (keyIssueType === "speed_index_paint") {
    shortExplanation = "The page is filling with content too slowly. Blocking resources or large images and fonts delay how quickly the screen looks populated.";
    detailedExplanation = "Speed Index reflects how quickly the visible area looks complete. Blocking CSS, large images, or scripts that run before paint delay that moment. Prioritizing critical resources and deferring the rest helps the page look ready sooner.";
  } else if (keyIssueType === "bootup_time") {
    shortExplanation = "Too much JavaScript is running at load. Bootup time delays when the page becomes responsive.";
    detailedExplanation = "Heavy bootup time keeps the main thread busy and delays interactivity. Code-splitting, lazy-loading, and removing unused code reduce bootup and help the page respond sooner.";
  } else if (keyIssueType === "unused_js") {
    shortExplanation = "A significant amount of JavaScript is unused. That code still loads and runs, slowing the page without benefit.";
    detailedExplanation = "Unused JavaScript increases load time and main thread work. Removing or code-splitting it so only needed code runs will make the page faster and more responsive.";
  } else {
    shortExplanation = totalResourceCount > 0
      ? `Several resources are contributing to this issue. Addressing them will improve experience.`
      : `This metric is underperforming. The contributing resources below show where to focus.`;
    detailedExplanation = `Improving the resources that affect ${name} will improve how users experience your page. Focus on the items listed and the recommended actions.`;
  }

  return { shortExplanation, detailedExplanation };
}
