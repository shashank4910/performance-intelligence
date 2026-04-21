import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { generateMetricAIExplanationAsync, type MetricExplanationContext } from "@/lib/metricAIExplanation";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: MetricExplanationContext;
  try {
    body = (await request.json()) as MetricExplanationContext;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body?.metricKey || body.keyIssueType == null) {
    return NextResponse.json({ error: "Missing metricKey or keyIssueType." }, { status: 400 });
  }

  const result = await generateMetricAIExplanationAsync({
    metricKey: body.metricKey,
    metricValue: body.metricValue ?? 0,
    keyIssueType: body.keyIssueType,
    topPatternsDetected: body.topPatternsDetected,
    totalResourceCount: body.totalResourceCount,
  });

  return NextResponse.json(result);
}
