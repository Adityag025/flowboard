import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodeCursor } from "@/lib/pagination";
import { listIssues } from "@/lib/queries/issues";

import { createFixture, destroyFixture, testDb, type Fixture } from "./db-helpers";

const TOTAL = 60;
const PAGE = 25;

/**
 * Pagination against the real query path -- listIssues, not a reimplementation.
 */
describe("keyset pagination", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createFixture("paging");

    // Distinct updatedAt values, plus a deliberate TIE in the middle to exercise
    // the id tiebreaker at a page boundary.
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    for (let i = 0; i < TOTAL; i += 1) {
      const tie = i >= 24 && i <= 26; // straddles the first page boundary
      await testDb.issue.create({
        data: {
          number: i + 1,
          title: `Paged issue ${i + 1}`,
          projectId: fixture.project.id,
          updatedAt: new Date(base + (tie ? 24 : i) * 60_000),
        },
      });
    }
  });

  afterAll(async () => {
    await destroyFixture(fixture);
    await testDb.$disconnect();
  });

  /** Walk every page, collecting ids in order. */
  async function walkAllPages() {
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof decodeCursor>;
    let pages = 0;

    for (;;) {
      const page = await listIssues(fixture.user.id, {}, { cursor });
      seen.push(...page.issues.map((issue) => issue.id));
      pages += 1;

      if (!page.nextCursor) break;
      cursor = decodeCursor(page.nextCursor);
      // Guard against an infinite loop if the cursor logic regresses -- an
      // endless test is worse than a failing one.
      expect(pages).toBeLessThan(20);
    }

    return { seen, pages };
  }

  it("reports the full filtered total, not the page size", async () => {
    const page = await listIssues(fixture.user.id, {});
    expect(page.total).toBe(TOTAL);
    expect(page.issues).toHaveLength(PAGE);
    expect(page.nextCursor).not.toBeNull();
  });

  it("visits every issue exactly once across all pages", async () => {
    const { seen, pages } = await walkAllPages();

    expect(seen).toHaveLength(TOTAL);
    // The property that matters: no duplicates and no gaps.
    expect(new Set(seen).size).toBe(TOTAL);
    expect(pages).toBe(Math.ceil(TOTAL / PAGE));
  });

  it("returns a null cursor on the last page", async () => {
    let cursor = null as ReturnType<typeof decodeCursor>;
    let last = await listIssues(fixture.user.id, {}, { cursor });

    while (last.nextCursor) {
      cursor = decodeCursor(last.nextCursor);
      last = await listIssues(fixture.user.id, {}, { cursor });
    }

    expect(last.nextCursor).toBeNull();
    expect(last.issues.length).toBeGreaterThan(0);
  });

  it("does not repeat the boundary row when timestamps tie", async () => {
    // Three issues share an updatedAt across the first page boundary. With a
    // cursor on updatedAt alone, the seam row would appear on both pages.
    const { seen } = await walkAllPages();
    const duplicates = seen.filter((id, i) => seen.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  it("stays stable when a row is edited mid-walk -- the reason for keyset", async () => {
    // Page 1.
    const first = await listIssues(fixture.user.id, {});
    const firstIds = first.issues.map((i) => i.id);
    expect(first.nextCursor).not.toBeNull();

    /**
     * Now simulate what happens constantly on a real tracker: someone comments
     * on an issue from page 2, bumping its updatedAt to now and moving it to the
     * TOP of the ordering.
     *
     * With OFFSET pagination, everything below it shifts down by one and page 2
     * would repeat a row that page 1 already showed. With keyset, page 2 is
     * defined relative to a fixed row, so the moved issue simply is not in it.
     */
    const cursor = decodeCursor(first.nextCursor!);
    const movedId = (
      await listIssues(fixture.user.id, {}, { cursor })
    ).issues[5]!.id;

    await testDb.issue.update({
      where: { id: movedId },
      data: { updatedAt: new Date() },
    });

    const second = await listIssues(fixture.user.id, {}, { cursor });
    const secondIds = second.issues.map((i) => i.id);

    // No row appears on both pages.
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    // The edited row jumped ahead of the cursor, so it is correctly absent.
    expect(secondIds).not.toContain(movedId);
  });

  it("applies the cursor on top of filters rather than replacing them", async () => {
    await testDb.issue.updateMany({
      where: { projectId: fixture.project.id, number: { lte: 30 } },
      data: { status: "DONE" },
    });

    const page = await listIssues(fixture.user.id, { status: "DONE" });
    expect(page.total).toBe(30);

    const all: string[] = [];
    let cursor = decodeCursor(page.nextCursor ?? undefined);
    all.push(...page.issues.map((i) => i.id));

    while (cursor) {
      const next = await listIssues(fixture.user.id, { status: "DONE" }, { cursor });
      all.push(...next.issues.map((i) => i.id));
      cursor = decodeCursor(next.nextCursor ?? undefined);
    }

    // Every row across every page must still satisfy the filter.
    expect(all).toHaveLength(30);
    const statuses = await testDb.issue.findMany({
      where: { id: { in: all } },
      select: { status: true },
    });
    expect(statuses.every((s) => s.status === "DONE")).toBe(true);
  });

  it("ignores a malformed cursor instead of erroring", async () => {
    const page = await listIssues(
      fixture.user.id,
      {},
      { cursor: decodeCursor("total-garbage") },
    );
    // A bad cursor decodes to null, which means "first page".
    expect(page.issues.length).toBeGreaterThan(0);
  });
});
