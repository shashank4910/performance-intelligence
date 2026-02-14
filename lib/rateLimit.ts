const LIMIT = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

const store = new Map<string, { count: number; resetTime: number }>();

/**
 * Check rate limit for the given key (e.g. IP).
 * Limit: 10 requests per minute per key.
 * @returns true if allowed, false if exceeded (caller should return 429).
 */
export function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (now >= entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  entry.count += 1;
  if (entry.count > LIMIT) {
    return false;
  }
  return true;
}
