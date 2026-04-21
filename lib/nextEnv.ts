import { loadEnvConfig } from "@next/env";

let ensured = false;
let loadedEnvFileCount = -1;

/** Merge `.env` / `.env.local` into `process.env` (Next dev can omit vars in some server bundles). */
export function ensureNextEnvLoaded(): void {
  if (ensured) return;
  ensured = true;
  try {
    const { loadedEnvFiles } = loadEnvConfig(process.cwd());
    loadedEnvFileCount = loadedEnvFiles.length;
  } catch {
    loadedEnvFileCount = -2;
  }
}

export function getLoadedEnvFileCountForDebug(): number {
  return loadedEnvFileCount;
}
