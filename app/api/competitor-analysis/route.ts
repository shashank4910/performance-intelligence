import { NextRequest, NextResponse } from "next/server";
import { computeCompetitorAnalysis, type CompetitorAnalysisOutput } from "@/engine/competitorAnalysis";
import { getDefaultMonthlyRevenue, DEFAULT_BUSINESS_MODEL_KEY } from "@/lib/impactEngine/businessModelRegistry";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function normalizeQueryList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const url = searchParams.get("url") ?? searchParams.get("user_url");
  const competitorUrls = normalizeQueryList(
    searchParams.get("competitorUrls") ?? searchParams.get("competitor_urls")
  );

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (competitorUrls.length === 0) {
    return NextResponse.json({ error: "competitorUrls is required" }, { status: 400 });
  }

  const baselineRevenueRaw = searchParams.get("baselineRevenue");
  const baselineRevenue =
    baselineRevenueRaw != null && Number.isFinite(Number(baselineRevenueRaw))
      ? Number(baselineRevenueRaw)
      : getDefaultMonthlyRevenue(DEFAULT_BUSINESS_MODEL_KEY);

  const healthRaw = searchParams.get("healthScore");
  let healthScore0to10: number | undefined;
  if (healthRaw != null && healthRaw !== "") {
    const n = Number(healthRaw);
    if (Number.isFinite(n)) {
      healthScore0to10 = n > 10 ? Math.min(10, Math.max(0, n / 10)) : Math.min(10, Math.max(0, n));
    }
  }

  try {
    const competitiveAnalysis: CompetitorAnalysisOutput | null = await computeCompetitorAnalysis({
      userUrl: url,
      competitorUrls,
      baselineRevenue,
      ...(healthScore0to10 != null ? { healthScore0to10 } : {}),
    });

    return NextResponse.json({
      competitive_analysis: competitiveAnalysis,
    });
  } catch (e) {
    console.error("[competitor-analysis]", e);
    return NextResponse.json(
      {
        error: "Competitor analysis failed. Check PageSpeed API key and URLs, then try again.",
        competitive_analysis: null,
      },
      { status: 500 }
    );
  }
}
