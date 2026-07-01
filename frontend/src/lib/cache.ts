// Tiny stale-while-revalidate cache backed by localStorage.
//
// Pages seed their initial state from here so returning users see their real,
// last-known data instantly (before the network round-trip lands), then the
// existing fetch revalidates and overwrites it. Keys are namespaced so we can
// wipe everything on login/logout/session-expiry without touching auth tokens.

const PREFIX = "geolead.cache.";

// Read a cached value. Returns null on the server, on a miss, or if the stored
// JSON is unparseable — callers fall back to their demo/empty default.
export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Persist a value. Failures (quota exceeded, serialization, private mode) are
// swallowed — caching is best-effort and must never break a render or fetch.
export function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

// Drop every cached entry. Called on login/logout/401 so one account can never
// flash another account's cached data on a shared browser.
export function clearAllCache(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* best-effort */
  }
}
