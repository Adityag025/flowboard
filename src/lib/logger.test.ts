import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

/**
 * The logger writes to stdout/stderr directly rather than via console, so tests
 * capture the streams. Each line is parsed as JSON -- if that ever fails, the
 * log platform would fail the same way.
 */
describe("logger", () => {
  let out: string[] = [];
  let err: string[] = [];

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const parse = (lines: string[]) => lines.map((line) => JSON.parse(line));

  it("emits one parseable JSON object per line", () => {
    logger.info("hello", { userId: "u1" });

    expect(out).toHaveLength(1);
    expect(out[0]!.endsWith("\n")).toBe(true);
    // Exactly one newline -- a multi-line record gets split by log collectors.
    expect(out[0]!.trimEnd()).not.toContain("\n");

    const [line] = parse(out);
    expect(line.level).toBe("info");
    expect(line.msg).toBe("hello");
    expect(line.userId).toBe("u1");
    expect(typeof line.time).toBe("string");
  });

  it("sends warn and error to stderr, info and debug to stdout", () => {
    logger.info("i");
    logger.debug("d");
    logger.warn("w");
    logger.error("e");

    expect(parse(out).map((l) => l.level)).toEqual(["info", "debug"]);
    expect(parse(err).map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("serialises an Error, which JSON.stringify alone drops", () => {
    // JSON.stringify(new Error("boom")) is "{}" -- this is how stack traces
    // silently vanish from logs.
    expect(JSON.stringify(new Error("boom"))).toBe("{}");

    logger.error("failed", new Error("boom"));
    const [line] = parse(err);

    expect(line.err.name).toBe("Error");
    expect(line.err.message).toBe("boom");
  });

  it("captures status and code from SDK error subclasses", () => {
    const apiError = Object.assign(new Error("rate limited"), { status: 429 });
    const prismaError = Object.assign(new Error("unique violation"), { code: "P2002" });

    logger.error("api", apiError);
    logger.error("db", prismaError);

    const [first, second] = parse(err);
    expect(first.err.status).toBe("429");
    expect(second.err.code).toBe("P2002");
  });

  it("handles a thrown non-Error", () => {
    logger.error("weird", "just a string");
    expect(parse(err)[0]!.err.message).toBe("just a string");
  });

  it.each([
    "password",
    "passwordHash",
    "token",
    "authorization",
    "cookie",
    "ANTHROPIC_API_KEY",
    "DATABASE_URL",
    "auth_secret",
  ])("redacts %s", (key) => {
    logger.info("sensitive", { [key]: "super-secret-value" });

    const serialised = out.join("");
    expect(serialised).not.toContain("super-secret-value");
    expect(serialised).toContain("[redacted]");
  });

  it("redacts nested sensitive keys", () => {
    logger.info("nested", { request: { headers: { cookie: "abc123" } } });
    expect(out.join("")).not.toContain("abc123");
  });

  it("does not hang on deeply nested input", () => {
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 30; i += 1) deep = { nested: deep };

    expect(() => logger.info("deep", deep as never)).not.toThrow();
    expect(out.join("")).toContain("[truncated]");
  });

  it("child() pre-binds fields onto every line", () => {
    const scoped = logger.child({ requestId: "req-1", route: "/api/ai/summarize" });
    scoped.info("start");
    scoped.warn("slow", { ms: 1200 });

    expect(parse(out)[0]!.requestId).toBe("req-1");
    const warned = parse(err)[0]!;
    expect(warned.requestId).toBe("req-1");
    expect(warned.route).toBe("/api/ai/summarize");
    expect(warned.ms).toBe(1200);
  });
});
