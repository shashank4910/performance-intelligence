/**
 * Persists full analysis payload for /dashboard/[projectId].
 * sessionStorage is per tab (new tab = empty); we mirror to localStorage so
 * the same report opens when the user reuses the URL in another tab (same origin).
 */

const PREFIX = "pi:project";

export function projectReportStorageKey(projectId: string): string {
  return `${PREFIX}:${projectId}`;
}

/** Read report JSON: prefer this tab's session, then cross-tab local copy */
export function getProjectReportJson(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  const key = projectReportStorageKey(projectId);
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) return fromSession;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write to both storages so dashboard links work in new tabs */
export function setProjectReportJson(projectId: string, json: string): void {
  if (typeof window === "undefined") return;
  const key = projectReportStorageKey(projectId);
  try {
    sessionStorage.setItem(key, json);
  } catch {
    /* quota or private mode */
  }
  try {
    localStorage.setItem(key, json);
  } catch {
    /* ignore */
  }
}
