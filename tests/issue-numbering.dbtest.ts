import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claimIssueNumber } from "@/lib/issue-numbering";

import { createFixture, destroyFixture, testDb, type Fixture } from "./db-helpers";

/**
 * The atomic counter, under genuine concurrency.
 *
 * This is the claim that has been asserted in comments since Stage 4 and never
 * actually exercised. A unit test with a mocked Prisma could not test it at all:
 * the guarantee belongs to Postgres, not to our code.
 */
describe("claimIssueNumber", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createFixture("numbering");
  });

  afterAll(async () => {
    await destroyFixture(fixture);
    await testDb.$disconnect();
  });

  it("issues sequential numbers when called serially", async () => {
    const first = await testDb.$transaction((tx) =>
      claimIssueNumber(tx, fixture.project.id),
    );
    const second = await testDb.$transaction((tx) =>
      claimIssueNumber(tx, fixture.project.id),
    );

    expect(second).toBe(first + 1);
  });

  it("never hands the same number to two concurrent callers", async () => {
    const CONCURRENCY = 25;

    const numbers = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        testDb.$transaction((tx) => claimIssueNumber(tx, fixture.project.id)),
      ),
    );

    // The property that matters: every caller got its own number.
    expect(new Set(numbers).size).toBe(CONCURRENCY);

    // And they form a contiguous run -- no gaps, so no number was burned.
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBe(sorted[i - 1]! + 1);
    }
  });

  it("survives concurrent creates without violating the unique index", async () => {
    const CONCURRENCY = 20;

    // The full path: claim a number and insert the row in one transaction, the
    // way createIssueAction does.
    const created = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        testDb.$transaction(async (tx) => {
          const number = await claimIssueNumber(tx, fixture.project.id);
          return tx.issue.create({
            data: {
              number,
              title: `Concurrent issue ${i}`,
              projectId: fixture.project.id,
            },
            select: { number: true },
          });
        }),
      ),
    );

    expect(new Set(created.map((c) => c.number)).size).toBe(CONCURRENCY);
  });

  it("keeps the counter ahead of every issue that exists", async () => {
    const [project, highest] = await Promise.all([
      testDb.project.findUniqueOrThrow({
        where: { id: fixture.project.id },
        select: { issueCounter: true },
      }),
      testDb.issue.findFirst({
        where: { projectId: fixture.project.id },
        orderBy: { number: "desc" },
        select: { number: true },
      }),
    ]);

    // If this ever inverts, the next create collides with an existing key.
    expect(project.issueCounter).toBeGreaterThanOrEqual(highest?.number ?? 0);
  });

  it("numbers are per-project, so two projects both start at 1", async () => {
    const other = await createFixture("numbering-other");
    try {
      const number = await testDb.$transaction((tx) =>
        claimIssueNumber(tx, other.project.id),
      );
      expect(number).toBe(1);
    } finally {
      await destroyFixture(other);
    }
  });

  it("rejects an explicit duplicate number via the composite unique index", async () => {
    const number = await testDb.$transaction((tx) =>
      claimIssueNumber(tx, fixture.project.id),
    );

    await testDb.issue.create({
      data: { number, title: "First", projectId: fixture.project.id },
    });

    // The database is the authority. This is why createIssueAction handles
    // P2002 rather than pre-checking.
    await expect(
      testDb.issue.create({
        data: { number, title: "Duplicate", projectId: fixture.project.id },
      }),
    ).rejects.toThrow();
  });
});
