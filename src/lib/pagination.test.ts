import { describe, expect, it } from "vitest";

import { cursorFilter, decodeCursor, encodeCursor } from "./pagination";

describe("cursor encoding", () => {
  it("round-trips", () => {
    const cursor = { updatedAt: new Date("2026-03-01T12:34:56.789Z"), id: "abc123" };
    const decoded = decodeCursor(encodeCursor(cursor));

    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe("abc123");
    // Millisecond precision must survive, or the boundary row shifts.
    expect(decoded!.updatedAt.toISOString()).toBe("2026-03-01T12:34:56.789Z");
  });

  it("survives an id containing the separator", () => {
    // cuids do not contain "|" today, but relying on that is the kind of
    // assumption that breaks quietly later. This test caught a real bug: the
    // first implementation split on the LAST separator and mangled the date.
    const cursor = { updatedAt: new Date("2026-03-01T00:00:00.000Z"), id: "we|ird|id" };
    expect(decodeCursor(encodeCursor(cursor))!.id).toBe("we|ird|id");
  });

  it("is URL-safe", () => {
    const encoded = encodeCursor({ updatedAt: new Date(), id: "x".repeat(30) });
    expect(encoded).toBe(encodeURIComponent(encoded));
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not base64", "!!!not-base64!!!"],
    ["base64 with no separator", Buffer.from("nopipe").toString("base64url")],
    ["an unparseable date", Buffer.from("not-a-date|abc").toString("base64url")],
    ["an empty id", Buffer.from("2026-01-01T00:00:00.000Z|").toString("base64url")],
  ])("returns null for %s rather than throwing", (_label, input) => {
    expect(() => decodeCursor(input)).not.toThrow();
    expect(decodeCursor(input)).toBeNull();
  });
});

describe("cursorFilter", () => {
  it("uses strict comparison so the boundary row is not repeated", () => {
    const at = new Date("2026-03-01T00:00:00.000Z");
    const filter = cursorFilter({ updatedAt: at, id: "abc" });

    expect(filter.OR[0]).toEqual({ updatedAt: { lt: at } });
    expect(filter.OR[1]).toEqual({ updatedAt: at, id: { lt: "abc" } });
    // If either became `lte`, the row on the seam would appear on both pages.
    expect(JSON.stringify(filter)).not.toContain("lte");
  });
});
