import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  computeAllScores,
  getRiskLevel,
  type LighthouseMetrics,
} from "@/lib/riskEngine";

let lastRequestTime = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const now = Date.now();

  if (now - lastRequestTime < 10000) {
    return NextResponse.json(
      { error: "Please wait before making another request." },
      { status: 429 }
    );
  }

  lastRequestTime = now;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
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

    // 3️⃣ All numeric scores from risk engine (no AI scoring)
    const scores = computeAllScores(cleanMetrics);
    const overallLevel = getRiskLevel(100 - scores.overallHealth);

    // 4️⃣ AI generates only the executive summary
    const prompt = `
You are a Performance Intelligence Engine for a SaaS product.

Given these Lighthouse metrics (times in ms):
${JSON.stringify(cleanMetrics)}

And these computed risk scores (0–100, higher = worse):
- Speed: ${scores.speedRisk}
- UX: ${scores.uxRisk}
- SEO: ${scores.seoRisk}
- Conversion: ${scores.conversionRisk}
- Scaling: ${scores.scalingRisk}
- Overall health: ${scores.overallHealth}/100

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

    if (!content) {
      return NextResponse.json(
        { error: "Empty OpenAI response" },
        { status: 500 }
      );
    }

    let executiveSummary = "";
    try {
      const parsed = JSON.parse(content);
      executiveSummary = parsed.executive_summary ?? "";
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON returned by OpenAI" },
        { status: 500 }
      );
    }

    // 5️⃣ Response shape unchanged for frontend
    return NextResponse.json({
      summary: {
        overall_health_score: scores.overallHealth,
        overall_health_display: `${scores.overallHealth}`,
        risk_level: overallLevel,
        executive_summary: executiveSummary,
      },
      risk_breakdown: {
        speed_risk_score: scores.speedRisk,
        speed_risk_level: getRiskLevel(scores.speedRisk),
        ux_risk_score: scores.uxRisk,
        ux_risk_level: getRiskLevel(scores.uxRisk),
        seo_risk_score: scores.seoRisk,
        seo_risk_level: getRiskLevel(scores.seoRisk),
        conversion_risk_score: scores.conversionRisk,
        conversion_risk_level: getRiskLevel(scores.conversionRisk),
        scaling_risk_score: scores.scalingRisk,
        scaling_risk_level: getRiskLevel(scores.scalingRisk),
      },
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
