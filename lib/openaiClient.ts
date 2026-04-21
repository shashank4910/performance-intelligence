/**
 * Lazy OpenAI client factory.
 *
 * Why this exists:
 *   `new OpenAI({ apiKey: undefined })` throws synchronously when
 *   `OPENAI_API_KEY` is also missing from `process.env`. Constructing the
 *   client at module scope would therefore crash the ENTIRE route on cold
 *   start (observed as a blank 500 on Vercel) whenever the key is not set.
 *
 *   Constructing lazily — and returning `null` when no key is present — lets
 *   every caller decide whether to fall back, while keeping the SDK import
 *   cheap and non-throwing at module load.
 *
 *   Server-only. Never import from a client component.
 */
import OpenAI from "openai";
import { getEnv } from "./env";

let cached: OpenAI | null | undefined;

/**
 * Returns a shared OpenAI client, or `null` if `OPENAI_API_KEY` is not set.
 * Safe to call many times per cold start; the result is memoized.
 */
export function getOpenAIClient(): OpenAI | null {
  if (cached !== undefined) return cached;
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    cached = null;
    return null;
  }
  try {
    cached = new OpenAI({ apiKey });
  } catch (err) {
    console.error("[openaiClient] Failed to construct OpenAI SDK:", err);
    cached = null;
  }
  return cached;
}
