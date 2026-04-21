/**
 * Project-level business profile for Revenue Impact simulation.
 * Persists business inputs and last calculation; does not run the impact engine.
 */

import { prisma } from "@/lib/prisma";
import type { OpportunityRange } from "./impactTypes";

export type SensitivityMode = "conservative" | "balanced" | "aggressive";

export type ProjectBusinessProfileData = {
  businessModelId: string;
  monthlyRevenue: number;
  advancedInputs?: Record<string, unknown>;
  sensitivityMode: SensitivityMode;
};

export type ProjectBusinessProfileRow = {
  id: string;
  projectId: string;
  businessModelId: string;
  monthlyRevenue: number;
  advancedInputs: Record<string, unknown> | null;
  sensitivityMode: string;
  lastCalculatedOpportunity: OpportunityRange | null;
  lastConfidence: string | null;
  modelVersion: string | null;
  lastRunAt: Date | null;
  lastSnapshotTimestamp: Date | null;
  updatedAt: Date;
};

function rowToProfile(row: {
  id: string;
  projectId: string;
  businessModelId: string;
  monthlyRevenue: unknown;
  advancedInputs: unknown;
  sensitivityMode: string;
  lastCalculatedOpportunity: unknown;
  lastConfidence: string | null;
  modelVersion?: string | null;
  lastRunAt?: Date | null;
  lastSnapshotTimestamp?: Date | null;
  updatedAt: Date;
}): ProjectBusinessProfileRow {
  const monthlyRevenue = Number(row.monthlyRevenue) || 0;
  return {
    id: row.id,
    projectId: row.projectId,
    businessModelId: row.businessModelId,
    monthlyRevenue,
    advancedInputs: row.advancedInputs != null && typeof row.advancedInputs === "object" && !Array.isArray(row.advancedInputs)
      ? (row.advancedInputs as Record<string, unknown>)
      : null,
    sensitivityMode: row.sensitivityMode,
    lastCalculatedOpportunity: row.lastCalculatedOpportunity != null && typeof row.lastCalculatedOpportunity === "object" && "low" in (row.lastCalculatedOpportunity as object) && "expected" in (row.lastCalculatedOpportunity as object) && "high" in (row.lastCalculatedOpportunity as object)
      ? (row.lastCalculatedOpportunity as OpportunityRange)
      : null,
    lastConfidence: row.lastConfidence,
    modelVersion: row.modelVersion ?? null,
    lastRunAt: row.lastRunAt ?? null,
    lastSnapshotTimestamp: row.lastSnapshotTimestamp ?? null,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get business profile for a project, if it exists.
 */
export async function getBusinessProfile(projectId: string): Promise<ProjectBusinessProfileRow | null> {
  if (!projectId) return null;
  const row = await prisma.projectBusinessProfile.findUnique({
    where: { projectId },
  });
  return row ? rowToProfile(row) : null;
}

/**
 * Save or update business profile for a project.
 * Upserts by projectId.
 */
export async function saveBusinessProfile(
  projectId: string,
  data: ProjectBusinessProfileData
): Promise<ProjectBusinessProfileRow> {
  const { businessModelId, monthlyRevenue, advancedInputs, sensitivityMode } = data;
  const row = await prisma.projectBusinessProfile.upsert({
    where: { projectId },
    create: {
      projectId,
      businessModelId,
      monthlyRevenue,
      advancedInputs: (advancedInputs ?? undefined) as unknown as any,
      sensitivityMode,
    },
    update: {
      businessModelId,
      monthlyRevenue,
      advancedInputs: (advancedInputs ?? undefined) as unknown as any,
      sensitivityMode,
    },
  });
  return rowToProfile(row);
}

/**
 * Update last calculation result and run metadata.
 * Call after running the impact engine.
 */
export async function updateLastCalculation(
  projectId: string,
  data: {
    opportunityRange: OpportunityRange;
    confidenceLevel: string;
    modelVersion?: string | null;
    lastRunAt?: Date | null;
    lastSnapshotTimestamp?: Date | null;
  }
): Promise<ProjectBusinessProfileRow | null> {
  if (!projectId) return null;
  const updateData: {
    lastCalculatedOpportunity: object;
    lastConfidence: string;
    modelVersion?: string | null;
    lastRunAt?: Date | null;
    lastSnapshotTimestamp?: Date | null;
  } = {
    lastCalculatedOpportunity: data.opportunityRange as unknown as object,
    lastConfidence: data.confidenceLevel,
  };
  if (data.modelVersion != null) updateData.modelVersion = data.modelVersion;
  if (data.lastRunAt != null) updateData.lastRunAt = data.lastRunAt;
  if (data.lastSnapshotTimestamp != null) updateData.lastSnapshotTimestamp = data.lastSnapshotTimestamp;
  const row = await prisma.projectBusinessProfile.updateMany({
    where: { projectId },
    data: updateData,
  });
  if (row.count === 0) return null;
  const updated = await prisma.projectBusinessProfile.findUnique({
    where: { projectId },
  });
  return updated ? rowToProfile(updated) : null;
}
