import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateProject } from "@/lib/project";
import { prisma } from "@/lib/prisma";
import { getDefaultMonthlyRevenue, DEFAULT_BUSINESS_MODEL_KEY } from "@/lib/impactEngine/businessModelRegistry";
import { opportunityBoundsFromLoss, type SensitivityMode } from "@/lib/revenueImpactSensitivityMath";
import { dominantStageFromLeakByMetric } from "@/lib/revenueStabilityMonitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { url: string; data: Record<string, unknown> };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, data } = body;
  if (!url || typeof url !== "string" || !data || typeof data !== "object") {
    return NextResponse.json({ error: "url and data required" }, { status: 400 });
  }

  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const overallHealth = typeof data.overallHealth === "number" ? data.overallHealth : undefined;
  const revenueRiskScore = typeof data.revenueRiskScore === "number" ? data.revenueRiskScore : undefined;
  const revenueImpactInputs = data.revenueImpactInputs as { lcpSeconds?: number; inpMs?: number | null } | undefined;
  const lcpSeconds = typeof revenueImpactInputs?.lcpSeconds === "number" ? revenueImpactInputs.lcpSeconds : 0;
  const inpMs = revenueImpactInputs?.inpMs ?? undefined;
  const detailedMetrics = data.detailed_metrics as {
    core?: { cls?: { numericValue?: number }; inp?: { numericValue?: number } };
    load?: { ttfb?: { numericValue?: number }; tti?: { numericValue?: number } };
    blocking?: { tbt?: { numericValue?: number } };
  } | undefined;
  const clsRaw = detailedMetrics?.core?.cls?.numericValue;
  const ttfbMsRaw = detailedMetrics?.load?.ttfb?.numericValue;
  const tbtMsRaw = detailedMetrics?.blocking?.tbt?.numericValue;
  const ttiMsRaw = detailedMetrics?.load?.tti?.numericValue;
  const inpMsFromCore = detailedMetrics?.core?.inp?.numericValue;
  const cls = typeof clsRaw === "number" && !Number.isNaN(clsRaw) ? clsRaw : null;
  const ttfb = typeof ttfbMsRaw === "number" && !Number.isNaN(ttfbMsRaw) ? ttfbMsRaw / 1000 : null;
  const tbt = typeof tbtMsRaw === "number" && !Number.isNaN(tbtMsRaw) ? tbtMsRaw / 1000 : null;
  const ttiSeconds =
    typeof ttiMsRaw === "number" && !Number.isNaN(ttiMsRaw) && ttiMsRaw > 0 ? ttiMsRaw / 1000 : null;
  const inpMsResolved = inpMs != null && !Number.isNaN(inpMs) ? inpMs : (typeof inpMsFromCore === "number" && !Number.isNaN(inpMsFromCore) ? inpMsFromCore : null);
  const inpSeconds = inpMsResolved != null ? inpMsResolved / 1000 : null;

  const rawAudit = data.rawAudit;
  const rawAuditForDb =
    rawAudit && typeof rawAudit === "object" && !Array.isArray(rawAudit) && "audits" in rawAudit
      ? rawAudit
      : undefined;
  if (rawAuditForDb && process.env.NODE_ENV !== "production") {
    console.log("save-pending-result: storing rawAudit");
  }

  try {
    const project = await getOrCreateProject(userId, normalizedUrl);
    const leakByMetric = (data as Record<string, unknown>).leak_by_metric as
      | Record<string, number>
      | undefined;
    const estimatedLeak =
      typeof (data as Record<string, unknown>).estimatedMonthlyLeak === "number"
        ? ((data as Record<string, unknown>).estimatedMonthlyLeak as number)
        : 0;
    const baselineForRange =
      typeof (data as Record<string, unknown>).baselineRevenueForCompetitorAnalysis === "number"
        ? ((data as Record<string, unknown>).baselineRevenueForCompetitorAnalysis as number)
        : getDefaultMonthlyRevenue(DEFAULT_BUSINESS_MODEL_KEY);
    const rb = data.risk_breakdown as
      | {
          speed_risk_score?: number;
          ux_risk_score?: number;
          seo_risk_score?: number;
          conversion_risk_score?: number;
        }
      | undefined;
    const mode: SensitivityMode = "balanced";
    const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(
      estimatedLeak,
      baselineForRange,
      mode
    );
    const dominantStageSnapshot = dominantStageFromLeakByMetric(leakByMetric ?? {});
    const monitoringScoresSnapshot = {
      speed: rb?.speed_risk_score ?? 0,
      ux: rb?.ux_risk_score ?? 0,
      seo: rb?.seo_risk_score ?? 0,
      conversion: rb?.conversion_risk_score ?? 0,
    };

    await prisma.performanceSnapshot.create({
      data: {
        projectId: project.id,
        overallHealth: overallHealth ?? 0,
        lcp: lcpSeconds,
        inp: inpSeconds != null ? inpSeconds : undefined,
        ttfb: ttfb ?? undefined,
        cls: cls ?? undefined,
        tbt: tbt ?? undefined,
        tti: ttiSeconds,
        revenueRisk: revenueRiskScore ?? undefined,
        rawAudit: rawAuditForDb ?? undefined,
        revenueAtRiskMin: opportunityLow,
        revenueAtRiskMax: opportunityHigh,
        dominantStage: dominantStageSnapshot,
        monitoringScores: monitoringScoresSnapshot as unknown as object,
      },
    });
    return NextResponse.json({ projectId: project.id });
  } catch (e) {
    console.error("save-pending-result error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save report" },
      { status: 500 }
    );
  }
}
