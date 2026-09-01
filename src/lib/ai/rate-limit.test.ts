import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "./rate-limit";

/**
 * The limiter keys off Date.now(), so time is faked rather than slept through --
 * a real 60-second wait in a unit test is a test nobody runs.
 *
 * Each test uses a distinct userId because the bucket Map is module-level state
 * that persists across tests in the same file.
 */
describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly 10 requests then blocks", () => {
    const user = "user-basic";

    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimit(user).allowed, `request ${i + 1}`).toBe(true);
    }

    const blocked = checkRateLimit(user);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down remaining", () => {
    const user = "user-remaining";
    expect(checkRateLimit(user).remaining).toBe(9);
    expect(checkRateLimit(user).remaining).toBe(8);
  });

  it("is per-user, not global", () => {
    for (let i = 0; i < 10; i += 1) checkRateLimit("user-a");

    expect(checkRateLimit("user-a").allowed).toBe(false);
    // Exhausting one user must not affect another.
    expect(checkRateLimit("user-b").allowed).toBe(true);
  });

  it("slides: frees up capacity as old hits age out", () => {
    const user = "user-slide";
    for (let i = 0; i < 10; i += 1) checkRateLimit(user);
    expect(checkRateLimit(user).allowed).toBe(false);

    // Just before the window closes, still blocked.
    vi.advanceTimersByTime(59_000);
    expect(checkRateLimit(user).allowed).toBe(false);

    // Past the window, the original hits have aged out.
    vi.advanceTimersByTime(2_000);
    expect(checkRateLimit(user).allowed).toBe(true);
  });

  it("is a sliding window, not a fixed one", () => {
    const user = "user-sliding";
    // 5 now, 5 thirty seconds later.
    for (let i = 0; i < 5; i += 1) checkRateLimit(user);
    vi.advanceTimersByTime(30_000);
    for (let i = 0; i < 5; i += 1) checkRateLimit(user);

    expect(checkRateLimit(user).allowed).toBe(false);

    // At t=61s the FIRST five have expired but the second five have not, so
    // capacity should be 5 -- not a full reset, which is what a fixed window
    // would wrongly give.
    vi.advanceTimersByTime(31_000);
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(user).allowed, `slide request ${i + 1}`).toBe(true);
    }
    expect(checkRateLimit(user).allowed).toBe(false);
  });

  it("reports a retryAfter within the window length", () => {
    const user = "user-retry";
    for (let i = 0; i < 10; i += 1) checkRateLimit(user);

    const blocked = checkRateLimit(user);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
