/**
 * In-flight request de-duplication.
 *
 * Merges concurrent identical async calls into a single shared promise. The
 * entry is cleared as soon as the promise settles, so callers never receive
 * stale, already-resolved data — only truly simultaneous requests are merged.
 *
 * This is used to collapse the duplicate reads the dashboard fires on first
 * load (e.g. project/quote/member lists requested by several widgets at once).
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupeInflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
