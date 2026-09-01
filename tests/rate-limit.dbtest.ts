import Redis from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/ai/rate-limit";
import { closeRedis } from "@/lib/redis";

/**
 * The Redis rate limiter against a real server.
 *
 * The in-memory unit tests cover the algorithm with fake timers. What they
 * cannot cover is what actually matters in production: that the limit is SHARED,
 * that the MULTI is atomic under concurrency, and that keys expire instead of
 * leaking. None of that is observable from a single process holding a Map.
 */
const url = process.env.REDIS_URL;

/**
 * An inspection client, separate from the app's.
 *
 * It KEEPS the offline queue (ioredis's default) so commands issued before the
 * socket is ready simply wait. The app's client disables it on purpose -- a
 * queued command there is a request that appears to hang -- but for a test
 * helper, queueing is exactly what we want.
 */
const raw = new Redis(url!, { maxRetriesPerRequest: 2 });

function user() {
  return `test-${Math.random().toString(36).slice(2, 10)}`;
}

describe("rate limiting via Redis", () => {
  beforeAll(async () => {
    // Fail loudly rather than skipping: a silently skipped integration test is
    // indistinguishable from a passing one.
    expect(url, "REDIS_URL must be set to run these tests").toBeTruthy();
    await expect(raw.ping()).resolves.toBe("PONG");
  });

  beforeEach(async () => {
    // Never FLUSHALL: this Redis is per-project, but a habit of flushing in
    // tests is how someone eventually flushes something that mattered.
    const keys = await raw.keys("ratelimit:ai:test-*");
    if (keys.length > 0) await raw.del(...keys);
  });

  afterAll(async () => {
    const keys = await raw.keys("ratelimit:ai:test-*");
    if (keys.length > 0) await raw.del(...keys);
    await raw.quit();
    await closeRedis();
  });

  it("uses the redis backend when REDIS_URL is set", async () => {
    const result = await checkRateLimit(user());
    expect(result.backend).toBe("redis");
    expect(result.allowed).toBe(true);
  });

  it("allows exactly 10 then blocks", async () => {
    const id = user();
    for (let i = 0; i < 10; i += 1) {
      const result = await checkRateLimit(id);
      expect(result.allowed, `request ${i + 1}`).toBe(true);
    }

    const blocked = await checkRateLimit(id);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("is per-user", async () => {
    const a = user();
    const b = user();
    for (let i = 0; i < 10; i += 1) await checkRateLimit(a);

    expect((await checkRateLimit(a)).allowed).toBe(false);
    expect((await checkRateLimit(b)).allowed).toBe(true);
  });

  it("holds under concurrent requests -- never lets more than 10 through", async () => {
    const id = user();

    // 30 at once. A non-atomic read-then-write limiter leaks here: several
    // requests read the same count before any of them writes.
    const results = await Promise.all(
      Array.from({ length: 30 }, () => checkRateLimit(id)),
    );

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(10);
    expect(results.filter((r) => !r.allowed)).toHaveLength(20);
  });

  it("does not let a rejected request consume budget", async () => {
    const id = user();
    for (let i = 0; i < 10; i += 1) await checkRateLimit(id);

    // Hammer it while blocked.
    for (let i = 0; i < 15; i += 1) await checkRateLimit(id);

    // The window must still hold exactly the 10 that succeeded -- if rejected
    // attempts were recorded, a client in a hot loop would keep the window
    // permanently full and never recover.
    const count = await raw.zcard(`ratelimit:ai:${id}`);
    expect(count).toBe(10);
  });

  it("sets a TTL so idle keys expire instead of leaking", async () => {
    const id = user();
    await checkRateLimit(id);

    const ttl = await raw.pttl(`ratelimit:ai:${id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("counts distinct entries for requests in the same millisecond", async () => {
    const id = user();
    // Sorted-set members must be unique, or two requests in one millisecond
    // collapse into a single entry and the limiter undercounts.
    await Promise.all([checkRateLimit(id), checkRateLimit(id), checkRateLimit(id)]);

    expect(await raw.zcard(`ratelimit:ai:${id}`)).toBe(3);
  });

  it("shares the limit across independent callers, unlike the in-memory one", async () => {
    const id = user();
    // Two separate limiter invocations are the stand-in for two server
    // processes: with the Map backend each would have its own budget.
    for (let i = 0; i < 6; i += 1) await checkRateLimit(id);
    for (let i = 0; i < 4; i += 1) await checkRateLimit(id);

    expect((await checkRateLimit(id)).allowed).toBe(false);
  });
});
