import { ensureNextEnvLoaded } from "@/lib/nextEnv";

/** Hostname from a Postgres URL without logging credentials. */
export function safeParseDbHost(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    const normalized = connectionString.replace(/^postgresql:\/\//i, "postgres://");
    const u = new URL(normalized);
    return u.hostname || null;
  } catch {
    return null;
  }
}

const NODE_NET_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNRESET",
  "EPIPE",
  "EAI_AGAIN",
]);

/**
 * Node / pg often nest `ECONNREFUSED` etc. on `error.cause`. Prisma may wrap the driver error.
 */
export function deepNodeErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 12; i++) {
    if (!cur || typeof cur !== "object") break;
    const o = cur as { code?: unknown; cause?: unknown; errors?: unknown[] };
    const c = o.code;
    if (typeof c === "string" && NODE_NET_CODES.has(c)) {
      return c;
    }
    if (Array.isArray(o.errors)) {
      for (const sub of o.errors) {
        const inner = deepNodeErrorCode(sub);
        if (inner) return inner;
      }
    }
    cur = o.cause;
  }
  return undefined;
}

/** Call before reading `process.env.DATABASE_URL` in API routes that do not import `prisma` first. */
export function getDatabaseUrlForDiagnostics(): string | undefined {
  ensureNextEnvLoaded();
  return process.env.DATABASE_URL;
}
