import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rateLimit } from "@/lib/rateLimit";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: getEnv("OPENAI_API_KEY"),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

type DiagnosisPayload = {
  primaryBottleneck: string;
  severityLevel: string;
  domainImpactPercentages: {
    infrastructure: number;
    frontend: number;
    javascript: number;
    thirdParty: number;
  };
  topContributingMetrics: Array<{ metric: string; contribution: number }>;
};

function fallbackSummary(payload: DiagnosisPayload): {
  strategicSummary: string;
  strategicRecommendation: string;
} {
  const top2 = payload.topContributingMetrics
    .map((m) => m.metric)
    .slice(0, 2)
    .join(" and ");
  return {
    strategicSummary:
      `Primary bottleneck is ${payload.primaryBottleneck} (${payload.severityLevel}). ` +
      `Impact concentration is Infrastructure ${payload.domainImpactPercentages.infrastructure}%, ` +
      `JavaScript ${payload.domainImpactPercentages.javascript}%, Frontend ${payload.domainImpactPercentages.frontend}%, ` +
      `Third-Party ${payload.domainImpactPercentages.thirdParty}%. ` +
      (top2 ? `Top contributing signals are ${top2}.` : "Top contributing signals are spread across multiple metrics."),
    strategicRecommendation:
      `Prioritize remediation in ${payload.primaryBottleneck} first, then validate impact reduction on the top two contributing metrics in the next release cycle.`,
  };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let payload: DiagnosisPayload;
  try {
    payload = (await request.json()) as DiagnosisPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!payload?.primaryBottleneck || !payload?.severityLevel || !payload?.domainImpactPercentages) {
    return NextResponse.json({ error: "Missing diagnosis fields." }, { status: 400 });
  }

  if (!getEnv("OPENAI_API_KEY")) {
    return NextResponse.json(fallbackSummary(payload));
  }

  try {
    const prompt = `
You are an executive performance strategy assistant.
You MUST use only the provided numbers and labels. No recalculation. No invented causes.

Input diagnosis:
- primaryBottleneck: ${payload.primaryBottleneck}
- severityLevel: ${payload.severityLevel}
- domainImpactPercentages:
  - Infrastructure: ${payload.domainImpactPercentages.infrastructure}%
  - Frontend: ${payload.domainImpactPercentages.frontend}%
  - JavaScript: ${payload.domainImpactPercentages.javascript}%
  - Third-Party: ${payload.domainImpactPercentages.thirdParty}%
- topContributingMetrics: ${JSON.stringify(payload.topContributingMetrics)}

Output JSON only:
{
  "strategicSummary": "Max 4 sentences. Executive tone. Clear and concise. No jargon overload.",
  "strategicRecommendation": "One-line directive on where leadership should focus next."
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json(fallbackSummary(payload));

    const parsed = JSON.parse(content) as {
      strategicSummary?: string;
      strategicRecommendation?: string;
    };

    return NextResponse.json({
      strategicSummary:
        parsed.strategicSummary?.trim() || fallbackSummary(payload).strategicSummary,
      strategicRecommendation:
        parsed.strategicRecommendation?.trim() || fallbackSummary(payload).strategicRecommendation,
    });
  } catch (error) {
    console.error("[diagnosis-summary] OpenAI error:", error);
    return NextResponse.json(fallbackSummary(payload));
  }
}

