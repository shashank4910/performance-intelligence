/**
 * Defensive NextAuth session helper.
 *
 * `getServerSession(authOptions)` throws `MissingSecretError` in production
 * when `NEXTAUTH_SECRET` is not set, which takes down *every* route that
 * peeks at auth state — including routes that work fine anonymously
 * (e.g. `/api/analyze`). Wrap the call so misconfiguration degrades
 * gracefully: logged-in users still get their session; anonymous users
 * (and misconfigured deployments) just get `null`.
 *
 * Server-only. Never import from a client component.
 */
import { getServerSession, type NextAuthOptions, type Session } from "next-auth";

let didWarnSessionFailure = false;

export async function safeGetServerSession(
  authOptions: NextAuthOptions
): Promise<Session | null> {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    if (!didWarnSessionFailure) {
      didWarnSessionFailure = true;
      console.error(
        "[auth] getServerSession failed — treating request as anonymous. " +
          "Most common cause: NEXTAUTH_SECRET not set in this environment.",
        error
      );
    }
    return null;
  }
}
