import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureNextEnvLoaded } from "@/lib/nextEnv";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

ensureNextEnvLoaded();
const connectionString = process.env.DATABASE_URL;

// During `next build` on Vercel, this module may be evaluated for type
// collection while env vars are still being loaded. Don't crash the build —
// throw only when an actual query is issued (the Proxy below), so missing
// DATABASE_URL surfaces as a clear runtime error on the failing request
// instead of a mysterious build failure.
function buildPrismaClient(): PrismaClient {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in your Vercel project " +
        "→ Settings → Environment Variables, or in .env.local for local dev."
    );
  }

  // Supabase (and some hosts) use certs that Node rejects. In dev, allow them so connection works.
  if (
    process.env.NODE_ENV === "development" &&
    connectionString.includes("supabase")
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  // Strip sslmode from URL so pg uses our ssl config (rejectUnauthorized: false), not URL-driven strict TLS.
  const urlForPool =
    connectionString
      .replace(/\?sslmode=[^&]+&?|&?sslmode=[^&]+/gi, "")
      .replace(/\?$/, "") || connectionString;

  const pool = new Pool({
    connectionString: urlForPool,
    ssl: urlForPool.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = buildPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazy proxy: the actual Prisma client is constructed on first method access.
// This keeps `next build` from requiring DATABASE_URL to be present, while
// still failing loudly with a clear message the first time a route touches the DB.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as unknown as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
