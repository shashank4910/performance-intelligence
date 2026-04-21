import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectForUser, getSnapshotsForRevenueStability } from "@/lib/project";
import {
  buildRevenueStabilityPayload,
  monitoringSnapshotFromDbRow,
  type MonitoringSnapshot,
} from "@/lib/revenueStabilityMonitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type RevenueStabilityApiState =
  | "ready"
  | "needs_second_run"
  | "legacy_snapshots";

/**
 * GET /api/projects/[projectId]/revenue-stability?extended=1
 * extended=1 → Pro: up to 30 days of snapshots for minimal history list.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const extended = searchParams.get("extended") === "1";

  const rows = await getSnapshotsForRevenueStability(project.id, extended);

  if (rows.length === 0) {
    return NextResponse.json({
      state: "needs_second_run" as const,
      tier: extended ? "pro" : "free",
      payload: null,
      message:
        "Run Analyze from the home page to create your first monitoring snapshot.",
    });
  }

  const mapRow = (r: (typeof rows)[0]) => monitoringSnapshotFromDbRow(r);
  let current: MonitoringSnapshot | null = null;
  let previous: MonitoringSnapshot | null = null;

  if (extended) {
    const asc = [...rows].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    if (asc.length < 2) {
      return NextResponse.json({
        state: "needs_second_run" as const,
        tier: "pro",
        payload: null,
        message: "Run Analyze again on the same URL to compare revenue stability.",
      });
    }
    current = mapRow(asc[asc.length - 1]!);
    previous = mapRow(asc[asc.length - 2]!);
  } else {
    const desc = [...rows].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    if (desc.length < 2) {
      return NextResponse.json({
        state: "needs_second_run" as const,
        tier: "free",
        payload: null,
        message: "Run Analyze again on the same URL to compare revenue stability.",
      });
    }
    current = mapRow(desc[0]!);
    previous = mapRow(desc[1]!);
  }

  if (!current || !previous) {
    return NextResponse.json({
      state: "legacy_snapshots" as const,
      tier: extended ? "pro" : "free",
      payload: null,
      message:
        "Older snapshots do not include revenue monitoring fields. Run a fresh analysis to enable Revenue Stability Monitoring.",
    });
  }

  const historySnapshots: MonitoringSnapshot[] | undefined = extended
    ? (() => {
        const asc = [...rows].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );
        return asc
          .map((r) => mapRow(r))
          .filter((x): x is MonitoringSnapshot => x != null);
      })()
    : undefined;

  const payload = buildRevenueStabilityPayload(
    current,
    previous,
    historySnapshots
  );

  return NextResponse.json({
    state: "ready" as const,
    tier: extended ? "pro" : "free",
    payload,
  });
}
