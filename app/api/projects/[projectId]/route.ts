import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import { ttiLabSecondsFromRawAudit } from "@/lib/labTtiFromAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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

  const lastSnapshot = project.snapshots[0] ?? null;
  const resolvedTtiSeconds = lastSnapshot
    ? (() => {
        const col = lastSnapshot.tti;
        if (typeof col === "number" && Number.isFinite(col) && col > 0) return col;
        return ttiLabSecondsFromRawAudit(lastSnapshot.rawAudit);
      })()
    : null;

  return NextResponse.json({
    project: { id: project.id, url: project.url },
    lastSnapshot: lastSnapshot
      ? {
          id: lastSnapshot.id,
          overallHealth: lastSnapshot.overallHealth,
          lcp: lastSnapshot.lcp,
          inp: lastSnapshot.inp,
          ttfb: lastSnapshot.ttfb,
          cls: lastSnapshot.cls,
          tbt: lastSnapshot.tbt,
          tti: resolvedTtiSeconds,
          timestamp: lastSnapshot.timestamp.toISOString(),
        }
      : null,
  });
}
