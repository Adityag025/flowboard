import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/**
 * Per-user rate limiting for AI calls.
 *
 * WHY THIS EXISTS
 * Every other endpoint in this app is cheap and fails locally. An LLM call is
 * the first operation that costs real money per request. An unprotected
 * summarize endpoint is a button anyone can hold down to spend the owner's
 * budget.
 *
 * TWO BACKENDS, ONE INTERFACE
 *   Redis      -- shared across every process and every instance, survives
 *                 restarts. The real limiter.
 *   In-memory  -- the fallback, used when REDIS_URL is unset or Redis is
 *                 unreachable.
 *
 * The fallback FAILS OPEN into per-process limiting rather than failing closed.
 * That is a considered trade: failing closed would mean a Redis blip disables a
 * working feature for everyone, while failing open means the limit becomes
 * per-process -- looser, but still bounded, and still stops the cases that
 * actually occur (impatient clicking, a looping client, one runaway account).
 * "No limit at all" was never an option.
 */

/** Requests allowed per user per window. */
const LIMIT = 10;
/** Window length in milliseconds. */
const WINDOW_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /** Which backend answered. Surfaced so ops can tell a degraded limiter apart. */
  backend: "redis" | "memory";
};

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

function evictStale(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((at) => now - at >= WINDOW_MS)) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimitInMemory(userId: string): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup rather than a timer, which would keep the process
  // alive and is awkward in a serverless context.
  if (buckets.size > 500) evictStale(now);

  const bucket = buckets.get(userId) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((at) => now - at < WINDOW_MS);

  if (bucket.hits.length >= LIMIT) {
    const oldest = bucket.hits[0]!;
    buckets.set(userId, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
      backend: "memory",
    };
  }

  bucket.hits.push(now);
  buckets.set(userId, bucket);

  return {
    allowed: true,
    remaining: LIMIT - bucket.hits.length,
    retryAfterSeconds: 0,
    backend: "memory",
  };
}

// ---------------------------------------------------------------------------
// Redis: sliding window via a sorted set
// ---------------------------------------------------------------------------

/**
 * A sorted set per user, scored by timestamp.
 *
 * Why not the simpler INCR + EXPIRE: that is a FIXED window, which allows a
 * double burst at the boundary -- 10 requests at 0:59 and 10 more at 1:01 is 20
 * in two seconds. A sorted set gives a true sliding window: old entries are
 * trimmed by score, so the count is always "requests in the last 60 seconds".
 *
 * All four commands go in one MULTI so they are atomic. Two concurrent requests
 * interleaving a read and a write is exactly how a limiter gets bypassed.
 */
async function checkRateLimitInRedis(userId: string): Promise<RateLimitResult | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = `ratelimit:ai:${userId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  try {
    const results = await redis
      .multi()
      // Drop everything older than the window.
      .zremrangebyscore(key, 0, windowStart)
      // Record this attempt. The member must be unique or repeated requests in
      // the same millisecond would collapse into one entry and undercount.
      .zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`)
      .zcard(key)
      // TTL so an idle user's key disappears instead of leaking forever.
      .pexpire(key, WINDOW_MS)
      .exec();

    if (!results) return null;

    const countEntry = results[2];
    if (!countEntry || countEntry[0]) return null;
    const count = Number(countEntry[1]);
    if (!Number.isFinite(count)) return null;

    if (count > LIMIT) {
      // We already added our own entry above, so remove it -- a rejected
      // request must not consume budget, or a client in a hot loop would hold
      // the window open indefinitely.
      await redis.zremrangebyrank(key, -1, -1).catch(() => {});

      // String range args: ioredis's WITHSCORES overload is typed for
      // string | Buffer, and passing numbers falls through to a variadic
      // overload that rejects them.
      const oldest = await redis
        .zrange(key, "0", "0", "WITHSCORES")
        .catch(() => [] as string[]);
      const oldestAt = Number(oldest[1] ?? now);
      const retryAfterSeconds = Number.isFinite(oldestAt)
        ? Math.max(1, Math.ceil((WINDOW_MS - (now - oldestAt)) / 1000))
        : Math.ceil(WINDOW_MS / 1000);

      return { allowed: false, remaining: 0, retryAfterSeconds, backend: "redis" };
    }

    return {
      allowed: true,
      remaining: Math.max(0, LIMIT - count),
      retryAfterSeconds: 0,
      backend: "redis",
    };
  } catch (error) {
    // Any Redis failure degrades to the in-memory limiter rather than 500ing a
    // request the user did nothing wrong to make.
    // Logged at warn, not error: the request still succeeds on the fallback.
    // Alerting on this is how you find a Redis outage before users do.
    logger.warn("rate limiter degraded to in-memory", {
      component: "ratelimit",
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The public entry point. Prefers Redis, falls back to memory.
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const fromRedis = await checkRateLimitInRedis(userId);
  return fromRedis ?? checkRateLimitInMemory(userId);
}
