import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCache, setCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rateLimit";
import {
  computeAllScores,
  getRiskLevel,
  type LighthouseMetrics,
} from "@/lib/riskEngine";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  const cached = getCache(url);
  if (cached != null) {
    return NextResponse.json(cached);
  }

  try {
    // 1️⃣ Call PageSpeed API
    const pageSpeedRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=mobile&key=${process.env.PAGESPEED_API_KEY}`
    );

    if (!pageSpeedRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch PageSpeed data" },
        { status: 500 }
      );
    }

    const pageSpeedData = await pageSpeedRes.json();
    const audits = pageSpeedData?.lighthouseResult?.audits;

    if (!audits) {
      return NextResponse.json(
        { error: "Invalid Lighthouse response structure" },
        { status: 500 }
      );
    }

    // 2️⃣ Extract metrics
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
    console.log("Metrics:", { url, cleanMetrics });

    // 3️⃣ Risk scores from engine only (no AI scoring)
    const scores = computeAllScores(cleanMetrics);
    const {
      speedRisk,
      uxRisk,
      seoRisk,
      conversionRisk,
      scalingRisk,
      overallHealth,
    } = scores;
    const overallRisk = 100 - overallHealth;
    const overallLevel = getRiskLevel(overallRisk);
    console.log("Scores:", { url, ...scores });
    // 4️⃣ OpenAI only for executive_summary; fallback if it fails
    const fallbackSummary =
      "Performance risks detected. Review breakdown for details.";
    let executiveSummary = fallbackSummary;

    try {
      const prompt = `
You are a Performance Intelligence Engine for a SaaS product.

Given these Lighthouse metrics (times in ms):
${JSON.stringify(cleanMetrics)}

And these computed risk scores (0–100, higher = worse):
- Speed: ${speedRisk}
- UX: ${uxRisk}
- SEO: ${seoRisk}
- Conversion: ${conversionRisk}
- Scaling: ${scalingRisk}
- Overall health: ${overallHealth}/100

Write a short executive summary (2–4 sentences) for a non-technical stakeholder. Focus on what matters most for the business: user experience, conversions, and scalability. Be direct and actionable.

STRICT: Return only valid JSON. No markdown, no explanation outside JSON.

Return EXACTLY:
{ "executive_summary": "Your summary text here." }
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      });

      const content = completion.choices[0].message.content;
      if (content) {
        const parsed = JSON.parse(content);
        const summary = parsed.executive_summary ?? "";
        if (summary) executiveSummary = summary;
      }
    } catch {
      // Keep fallback; return full response anyway
    }

    // 5️⃣ Same JSON structure as frontend expects
    const response = {
      summary: {
        overall_health_score: overallHealth,
        overall_health_display: `${overallHealth}`,
        risk_level: overallLevel,
        executive_summary: executiveSummary,
      },
      risk_breakdown: {
        speed_risk_score: speedRisk,
        speed_risk_level: getRiskLevel(speedRisk),
        ux_risk_score: uxRisk,
        ux_risk_level: getRiskLevel(uxRisk),
        seo_risk_score: seoRisk,
        seo_risk_level: getRiskLevel(seoRisk),
        conversion_risk_score: conversionRisk,
        conversion_risk_level: getRiskLevel(conversionRisk),
        scaling_risk_score: scalingRisk,
        scaling_risk_level: getRiskLevel(scalingRisk),
      },
    };
    console.log("Analysis Complete:", { url, overallHealth });

    setCache(url, response);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error("Analysis Error:", { url, error });
    return NextResponse.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
