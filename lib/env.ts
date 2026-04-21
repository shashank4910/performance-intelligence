/**
 * Server-only environment variable access.
 *
 * Rules:
 *   - Do NOT import this module from any client component.
 *   - Reads are lazy: nothing throws at import / build time. A missing
 *     secret only surfaces at request time, when a handler asks for it.
 *     That way a single missing key does not fail the whole `next build`.
 *   - Client-facing config must go through `NEXT_PUBLIC_*` variables, which
 *     Next.js inlines at build time. Those are never read from this module.
 *
 * Usage:
 *   // In a route handler / server action:
 *   const key = requireEnv("OPENAI_API_KEY");
 *   const dbUrl = requireEnv("DATABASE_URL");
 *
 *   // For optional vars with a clear fallback:
 *   const maybeGoogle = getEnv("GOOGLE_API_KEY");
 */

/** Must be set in every deployed environment (dev, preview, prod). */
export type RequiredServerEnvKey = "DATABASE_URL" | "NEXTAUTH_SECRET";

/** Keys the app can run without (with reduced functionality) or only needs in some flows. */
export type OptionalServerEnvKey =
  | "OPENAI_API_KEY"
  | "PAGESPEED_API_KEY"
  | "GOOGLE_API_KEY"
  | "NEXTAUTH_URL"
  | "EXEC_SUMMARY_DEBUG";

export type ServerEnvKey = RequiredServerEnvKey | OptionalServerEnvKey;

/**
 * Hard guard: this module must never be evaluated in the browser.
 * If a client component accidentally imports it, fail loudly in dev.
 */
function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "[lib/env] Server-only module imported from the browser. " +
        "Move the caller to a server component, route handler, or server action."
    );
  }
}

/**
 * Return the trimmed value of an env var, or `undefined` if unset/empty.
 * Empty strings (common when a Vercel env is declared but left blank) are
 * treated as unset so fallbacks kick in.
 */
export function getEnv(name: ServerEnvKey): string | undefined {
  assertServerOnly();
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Return the value of a required env var, or throw a clear error naming the
 * missing variable. Use inside route handlers — never at module scope, to
 * avoid crashing unrelated routes when one key is missing.
 */
export function requireEnv(name: RequiredServerEnvKey): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "Set it in your Vercel project → Settings → Environment Variables, " +
        "or in .env.local for local development."
    );
  }
  return value;
}

/**
 * Best-effort env diagnostic. Safe to call once per cold start from any
 * handler — it logs (not throws) and remembers it already warned.
 * Prefer over throwing because Vercel Preview builds sometimes skip
 * optional keys on purpose.
 */
let didWarnMissingEnv = false;
export function warnIfMissingCoreEnv(): void {
  if (didWarnMissingEnv) return;
  didWarnMissingEnv = true;
  const missingRequired: string[] = [];
  if (!getEnv("DATABASE_URL")) missingRequired.push("DATABASE_URL");
  if (!getEnv("NEXTAUTH_SECRET")) missingRequired.push("NEXTAUTH_SECRET");
  if (missingRequired.length > 0) {
    console.warn(
      `[env] Missing required server env vars: ${missingRequired.join(", ")}. ` +
        "Requests using these will fail until they are set."
    );
  }
  const missingOptional: string[] = [];
  if (!getEnv("OPENAI_API_KEY")) missingOptional.push("OPENAI_API_KEY (AI narrative disabled)");
  if (!getEnv("PAGESPEED_API_KEY") && !getEnv("GOOGLE_API_KEY")) {
    missingOptional.push("PAGESPEED_API_KEY/GOOGLE_API_KEY (analyze + competitor fetch disabled)");
  }
  if (missingOptional.length > 0) {
    console.info(`[env] Optional env vars not set: ${missingOptional.join("; ")}`);
  }
}

/** Typed accessor for the (optional) debug flag on /api/analyze. */
export function isExecSummaryDebugEnabled(): boolean {
  return getEnv("EXEC_SUMMARY_DEBUG") === "1";
}
