/**
 * Per-user rate limiting for AI calls.
 *
 * WHY THIS EXISTS BEFORE THE FEATURE DOES
 * Every other endpoint in this app is cheap and fails locally. An LLM call is
 * the first operation that costs real money per request and is slow enough to
 * tie up resources. An unprotected summarize endpoint is a button anyone can
 * hold down to spend the owner's budget. Rate limiting is not a Stage 8 polish
 * item for this endpoint; it is part of shipping it at all.
 *
 * HONEST LIMITATIONS -- this is deliberately the simple version:
 *   - IN-MEMORY, so it is per-process. Two server instances mean two independent
 *     budgets and double the real limit.
 *   - Resets on deploy or restart.
 *   - Not a defence against a distributed attack.
 *
 * It is still worth having: it stops the common cases -- an impatient user
 * clicking repeatedly, a buggy client in a loop, one account running away with
 * the bill. Stage 8 replaces the Map with Redis, at which point the limit
 * becomes global and survives restarts. The INTERFACE below is designed so that
 * swap touches only this file.
 */

type Bucket = {
  /** Timestamps of requests still inside the window. */
  hits: number[];
};

const buckets = new Map<string, Bucket>();

/** Requests allowed per user per window. */
const LIMIT = 10;
/** Window length in milliseconds. */
const WINDOW_MS = 60_000;

/**
 * Stop the Map growing without bound.
 *
 * Every entry is a userId that made a request; without eviction, a long-running
 * process accumulates one entry per user who has ever used the feature. A slow
 * leak is still a leak.
 */
function evictStale(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((at) => now - at >= WINDOW_MS)) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window frees up. Only meaningful when !allowed. */
  retryAfterSeconds: number;
};

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();

  // Cheap opportunistic cleanup rather than a timer, which would keep the
  // process alive and is awkward to reason about in a serverless context.
  if (buckets.size > 500) evictStale(now);

  const bucket = buckets.get(userId) ?? { hits: [] };
  // Sliding window: drop hits that have aged out.
  bucket.hits = bucket.hits.filter((at) => now - at < WINDOW_MS);

  if (bucket.hits.length >= LIMIT) {
    const oldest = bucket.hits[0]!;
    buckets.set(userId, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(userId, bucket);

  return {
    allowed: true,
    remaining: LIMIT - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}
