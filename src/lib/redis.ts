import Redis from "ioredis";

import { logger } from "@/lib/logger";

/**
 * Redis client, or null when REDIS_URL is unset.
 *
 * Returning null rather than throwing is deliberate: Redis is OPTIONAL. A fresh
 * clone with no REDIS_URL must still run, and every caller degrades rather than
 * failing. Making Redis mandatory would mean the app cannot boot because a
 * rate-limit counter has nowhere to live.
 */
let client: Redis | null = null;
let initialised = false;

export function getRedis(): Redis | null {
  if (initialised) return client;
  initialised = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  client = new Redis(url, {
    /**
     * Bounded failure, not indefinite retry. The default retries forever, which
     * turns a Redis outage into slow requests across the whole app.
     */
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,

    /**
     * THE OFFLINE QUEUE STAYS ON, and this was a bug worth recording.
     *
     * The first version disabled it and gated every call on a `healthy` flag
     * that only became true on the 'ready' event. But a client connects
     * asynchronously, so the flag is false for the first few milliseconds of
     * process life -- and every request in that window silently skipped Redis
     * and used the in-memory fallback instead. In a short-lived or
     * serverless process, Redis might never be used AT ALL, and nothing would
     * look wrong: the limiter still "worked", just per-process. A test asserting
     * `backend === "redis"` caught it.
     *
     * With the queue on, a command issued before the socket is ready waits for
     * the connection instead of failing. The wait is bounded by connectTimeout
     * plus one retry, so a genuinely dead Redis still fails in ~1-2s and the
     * caller falls back -- rather than hanging indefinitely, which is the thing
     * disabling the queue was meant to prevent.
     */
    enableOfflineQueue: true,

    retryStrategy: (attempts) => Math.min(attempts * 200, 2_000),
  });

  client.on("error", (error) => {
    // ioredis emits this on every retry, so this is intentionally terse -- an
    // unavailable Redis must not drown out the rest of the logs.
    logger.warn("redis unavailable", { component: "redis", reason: error.message });
  });

  return client;
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** For tests and graceful shutdown. */
export async function closeRedis(): Promise<void> {
  await client?.quit().catch(() => {});
  client = null;
  initialised = false;
}
