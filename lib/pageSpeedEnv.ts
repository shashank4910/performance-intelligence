import { ensureNextEnvLoaded } from "@/lib/nextEnv";
import { getEnv } from "@/lib/env";

/**
 * Google PageSpeed Insights API key. Checks `PAGESPEED_API_KEY`, then `GOOGLE_API_KEY`.
 */
export function getPageSpeedApiKey(): string | undefined {
  ensureNextEnvLoaded();
  return getEnv("PAGESPEED_API_KEY") ?? getEnv("GOOGLE_API_KEY");
}
