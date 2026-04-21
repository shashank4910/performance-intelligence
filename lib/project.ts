import { prisma } from "./prisma";

/**
 * Get existing project for user+url or create one.
 * Always filters by userId for multi-tenant safety.
 */
export async function getOrCreateProject(
  userId: string,
  url: string,
  industry?: string | null
) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) throw new Error("URL is required");

  const existing = await prisma.project.findFirst({
    where: { userId, url: normalizedUrl },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: {
      userId,
      url: normalizedUrl,
      industry: industry ?? undefined,
    },
  });
}

/**
 * List projects for a user only.
 */
export async function getProjectsByUserId(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      snapshots: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * Get a single project by id only if it belongs to the user.
 */
export async function getProjectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { snapshots: { orderBy: { timestamp: "desc" } } },
  });
}

/**
 * Get last N snapshots for a project (by projectId). Only use with a projectId
 * obtained from getOrCreateProject(userId, ...) for multi-tenant safety.
 */
export async function getLastSnapshots(projectId: string, limit = 2) {
  return prisma.performanceSnapshot.findMany({
    where: { projectId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

/**
 * Snapshots for Revenue Stability Monitoring. Extended = up to 30 days (Pro).
 */
export async function getSnapshotsForRevenueStability(
  projectId: string,
  extendedHistory: boolean
) {
  if (extendedHistory) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return prisma.performanceSnapshot.findMany({
      where: { projectId, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    });
  }
  return prisma.performanceSnapshot.findMany({
    where: { projectId },
    orderBy: { timestamp: "desc" },
    take: 2,
  });
}
