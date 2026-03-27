/**
 * In-memory per-user sliding window for POST /api/fact.
 * Resets on process restart; good enough for take-home / single-instance deploys.
 * For multi-instance production, use Redis or similar.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.FACT_RATE_LIMIT_PER_MIN ?? "30");

const buckets = new Map<string, number[]>();

export function consumeFactRateLimit(userId: string):
  | { ok: true }
  | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let stamps = buckets.get(userId) ?? [];
  stamps = stamps.filter((t) => t > cutoff);

  if (stamps.length >= MAX_REQUESTS) {
    const oldest = stamps[0]!;
    const retryAfterMs = Math.max(0, WINDOW_MS - (now - oldest));
    buckets.set(userId, stamps);
    return { ok: false, retryAfterMs };
  }

  stamps.push(now);
  buckets.set(userId, stamps);
  return { ok: true };
}
