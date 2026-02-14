const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Get cached value by key. Returns undefined if missing or expired.
 */
export function getCache(key: string): unknown {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Store value in cache. Optional TTL in ms; default 10 minutes.
 */
export function setCache(key: string, data: unknown, ttlMs?: number): void {
  const ttl = ttlMs ?? DEFAULT_TTL_MS;
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });
}
