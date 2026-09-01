import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBoard } from "@/lib/queries/board";
import { getFormOptions, getIssueByKey, listIssues } from "@/lib/queries/issues";

import { createFixture, destroyFixture, testDb, type Fixture } from "./db-helpers";

/**
 * Guards against reintroducing the node-postgres overlap warning.
 *
 * Why this deserves a test rather than a code comment: pg@9 REMOVES the
 * deprecated behaviour, so what is a warning today becomes a thrown error on a
 * future dependency bump. A comment saying "do not wrap these in a transaction"
 * is one well-meaning refactor away from being ignored; this fails instead.
 *
 * The trigger, isolated by experiment: a findMany WITH RELATIONS followed by
 * another query inside the SAME transaction. Prisma's interpreter issues several
 * queries to load relations, and the following query overlaps them on that
 * transaction's single connection.
 *
 * pg emits the deprecation only ONCE per process, so a single leak anywhere in
 * this file is enough to fail it -- and enough to hide a second one. Fix the
 * first and re-run.
 */
describe("query paths do not overlap queries on one connection", () => {
  let fixture: Fixture;
  let warnings: string[] = [];

  const onWarning = (warning: Error) => {
    if (warning.message.includes("already executing a query")) {
      warnings.push(warning.message);
    }
  };

  beforeAll(async () => {
    fixture = await createFixture("pgwarn");

    // Relations are the whole point -- a scalar-only row would not exercise the
    // multi-query relation loading that causes the overlap.
    const label = await testDb.label.create({
      data: { name: `warn-${fixture.token}`, color: "#fff", workspaceId: fixture.workspace.id },
      select: { id: true },
    });

    for (let i = 1; i <= 3; i += 1) {
      await testDb.issue.create({
        data: {
          number: i,
          title: `Issue ${i}`,
          projectId: fixture.project.id,
          creatorId: fixture.user.id,
          assigneeId: fixture.user.id,
          labels: { create: { labelId: label.id } },
          comments: { create: { body: "a comment", authorId: fixture.user.id } },
        },
      });
    }

    process.on("warning", onWarning);
  });

  afterAll(async () => {
    process.off("warning", onWarning);
    await destroyFixture(fixture);
    await testDb.$disconnect();
  });

  /** Warnings are emitted asynchronously, so give the loop a tick to deliver. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

  it("listIssues (page + count) does not overlap", async () => {
    warnings = [];
    const page = await listIssues(fixture.user.id, {});
    await settle();

    expect(page.issues.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThan(0);
    expect(warnings, "listIssues overlapped queries on one connection").toEqual([]);
  });

  it("getFormOptions does not overlap", async () => {
    warnings = [];
    await getFormOptions(fixture.user.id);
    await settle();
    expect(warnings).toEqual([]);
  });

  it("getIssueByKey does not overlap", async () => {
    warnings = [];
    const issue = await getIssueByKey(fixture.user.id, fixture.project.key, 1);
    await settle();

    expect(issue).not.toBeNull();
    expect(warnings).toEqual([]);
  });

  it("getBoard does not overlap", async () => {
    warnings = [];
    const board = await getBoard(fixture.user.id, fixture.project.key);
    await settle();

    expect(board).not.toBeNull();
    expect(warnings).toEqual([]);
  });

  it("all four in sequence stay clean", async () => {
    // Together, because the deprecation fires once per process: a leak in a
    // later path could be masked if an earlier test had already tripped it.
    warnings = [];
    await listIssues(fixture.user.id, {});
    await getFormOptions(fixture.user.id);
    await getIssueByKey(fixture.user.id, fixture.project.key, 1);
    await getBoard(fixture.user.id, fixture.project.key);
    await settle();
    expect(warnings).toEqual([]);
  });
});
