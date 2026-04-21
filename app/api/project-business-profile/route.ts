import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import {
  getBusinessProfile,
  saveBusinessProfile,
  updateLastCalculation,
  type ProjectBusinessProfileData,
} from "@/impactEngine/projectBusinessProfileService";
import type { OpportunityRange } from "@/impactEngine/impactTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const profile = await getBusinessProfile(projectId);
  if (!profile) {
    return NextResponse.json({ profile: null });
  }
  return NextResponse.json({
    profile: {
      id: profile.id,
      projectId: profile.projectId,
      businessModelId: profile.businessModelId,
      monthlyRevenue: profile.monthlyRevenue,
      advancedInputs: profile.advancedInputs,
      sensitivityMode: profile.sensitivityMode,
      lastCalculatedOpportunity: profile.lastCalculatedOpportunity,
      lastConfidence: profile.lastConfidence,
      modelVersion: profile.modelVersion,
      lastRunAt: profile.lastRunAt?.toISOString() ?? null,
      lastSnapshotTimestamp: profile.lastSnapshotTimestamp?.toISOString() ?? null,
      updatedAt: profile.updatedAt.toISOString(),
    },
  });
}

type PostBody = {
  projectId: string;
} & ProjectBusinessProfileData;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, businessModelId, monthlyRevenue, advancedInputs, sensitivityMode } = body;
  if (!projectId || !businessModelId || typeof monthlyRevenue !== "number") {
    return NextResponse.json(
      { error: "projectId, businessModelId, and monthlyRevenue required" },
      { status: 400 }
    );
  }

  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const mode = sensitivityMode === "conservative" || sensitivityMode === "balanced" || sensitivityMode === "aggressive"
    ? sensitivityMode
    : "balanced";

  try {
    const profile = await saveBusinessProfile(projectId, {
      businessModelId,
      monthlyRevenue,
      advancedInputs,
      sensitivityMode: mode,
    });
    return NextResponse.json({
      profile: {
        id: profile.id,
        projectId: profile.projectId,
        businessModelId: profile.businessModelId,
        monthlyRevenue: profile.monthlyRevenue,
        advancedInputs: profile.advancedInputs,
        sensitivityMode: profile.sensitivityMode,
        lastCalculatedOpportunity: profile.lastCalculatedOpportunity,
        lastConfidence: profile.lastConfidence,
        modelVersion: profile.modelVersion,
        lastRunAt: profile.lastRunAt?.toISOString() ?? null,
        lastSnapshotTimestamp: profile.lastSnapshotTimestamp?.toISOString() ?? null,
        updatedAt: profile.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("project-business-profile POST:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save profile" },
      { status: 500 }
    );
  }
}

type PatchBodyCalculation = {
  projectId: string;
  lastCalculatedOpportunity: OpportunityRange;
  lastConfidence: string;
  modelVersion?: string | null;
  lastRunAt?: string | null;
  lastSnapshotTimestamp?: string | null;
};

/** Refine modal: update profile (saved to ProjectBusinessProfile table). */
type PatchBodyProfile = {
  projectId: string;
  businessModelId: string;
  monthlyRevenue: number;
  traffic?: number;
  advancedInputs?: Record<string, unknown>;
  sensitivityMode?: "conservative" | "balanced" | "aggressive";
};

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBodyProfile & PatchBodyCalculation;
  try {
    body = (await request.json()) as PatchBodyProfile & PatchBodyCalculation;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Refine profile: businessModelId + monthlyRevenue → save to ProjectBusinessProfile
  const isProfileUpdate =
    typeof body.businessModelId === "string" && typeof body.monthlyRevenue === "number";
  if (isProfileUpdate) {
    const { businessModelId, monthlyRevenue, traffic, advancedInputs, sensitivityMode } = body;
    const mode =
      sensitivityMode === "conservative" || sensitivityMode === "balanced" || sensitivityMode === "aggressive"
        ? sensitivityMode
        : "balanced";
    const inputs = advancedInputs ?? (typeof traffic === "number" ? { traffic } : undefined);
    try {
      const profile = await saveBusinessProfile(projectId, {
        businessModelId,
        monthlyRevenue,
        advancedInputs: inputs,
        sensitivityMode: mode,
      });
      return NextResponse.json({
        profile: {
          id: profile.id,
          projectId: profile.projectId,
          businessModelId: profile.businessModelId,
          monthlyRevenue: profile.monthlyRevenue,
          advancedInputs: profile.advancedInputs,
          sensitivityMode: profile.sensitivityMode,
          lastCalculatedOpportunity: profile.lastCalculatedOpportunity,
          lastConfidence: profile.lastConfidence,
          modelVersion: profile.modelVersion,
          lastRunAt: profile.lastRunAt?.toISOString() ?? null,
          lastSnapshotTimestamp: profile.lastSnapshotTimestamp?.toISOString() ?? null,
          updatedAt: profile.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      console.error("project-business-profile PATCH (profile):", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to save profile" },
        { status: 500 }
      );
    }
  }

  // Calculation metadata update: lastCalculatedOpportunity + lastConfidence
  const { lastCalculatedOpportunity, lastConfidence, modelVersion, lastRunAt, lastSnapshotTimestamp } = body;
  if (!lastCalculatedOpportunity || typeof lastConfidence !== "string") {
    return NextResponse.json(
      { error: "For calculation update: lastCalculatedOpportunity and lastConfidence required. For profile update: businessModelId and monthlyRevenue required." },
      { status: 400 }
    );
  }

  const opp = lastCalculatedOpportunity as OpportunityRange;
  if (typeof opp.low !== "number" || typeof opp.expected !== "number" || typeof opp.high !== "number") {
    return NextResponse.json({ error: "lastCalculatedOpportunity must have low, expected, high" }, { status: 400 });
  }

  const lastRunAtDate = lastRunAt ? new Date(lastRunAt) : undefined;
  const lastSnapshotTimestampDate = lastSnapshotTimestamp ? new Date(lastSnapshotTimestamp) : undefined;

  try {
    const profile = await updateLastCalculation(projectId, {
      opportunityRange: opp,
      confidenceLevel: lastConfidence,
      modelVersion: modelVersion ?? undefined,
      lastRunAt: lastRunAtDate,
      lastSnapshotTimestamp: lastSnapshotTimestampDate,
    });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({
      profile: {
        id: profile.id,
        projectId: profile.projectId,
        lastCalculatedOpportunity: profile.lastCalculatedOpportunity,
        lastConfidence: profile.lastConfidence,
        modelVersion: profile.modelVersion,
        lastRunAt: profile.lastRunAt?.toISOString() ?? null,
        lastSnapshotTimestamp: profile.lastSnapshotTimestamp?.toISOString() ?? null,
        updatedAt: profile.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("project-business-profile PATCH:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update calculation" },
      { status: 500 }
    );
  }
}
