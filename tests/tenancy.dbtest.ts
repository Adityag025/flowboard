import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createFixture,
  destroyFixture,
  testDb,
  visibleToUser,
  type Fixture,
} from "./db-helpers";

/**
 * Tenant isolation, against the real database.
 *
 * This is the highest-value test in the suite: every read path in the app relies
 * on putting membership inside the WHERE clause, and a refactor that "simplifies"
 * that away would leak one customer's issues to another with no type error and
 * no visible symptom.
 *
 * Both directions are asserted. A scoping bug can leak data OR lock people out
 * of their own, and only checking one direction misses half the failure modes.
 */
describe("tenant isolation", () => {
  let alice: Fixture;
  let mallory: Fixture;
  let aliceIssueId: string;
  let malloryIssueId: string;

  beforeAll(async () => {
    alice = await createFixture("alice");
    mallory = await createFixture("mallory");

    const aliceIssue = await testDb.issue.create({
      data: {
        number: 1,
        title: "Alice private issue",
        projectId: alice.project.id,
        creatorId: alice.user.id,
      },
      select: { id: true },
    });
    aliceIssueId = aliceIssue.id;

    const malloryIssue = await testDb.issue.create({
      data: {
        number: 1,
        title: "Mallory private issue",
        projectId: mallory.project.id,
        creatorId: mallory.user.id,
      },
      select: { id: true },
    });
    malloryIssueId = malloryIssue.id;
  });

  afterAll(async () => {
    await destroyFixture(alice);
    await destroyFixture(mallory);
    await testDb.$disconnect();
  });

  it("lets a member see their own issue", async () => {
    expect(await visibleToUser(aliceIssueId, alice.user.id)).not.toBeNull();
    expect(await visibleToUser(malloryIssueId, mallory.user.id)).not.toBeNull();
  });

  it("hides an issue from a non-member", async () => {
    expect(await visibleToUser(malloryIssueId, alice.user.id)).toBeNull();
    expect(await visibleToUser(aliceIssueId, mallory.user.id)).toBeNull();
  });

  it("excludes other tenants from a scoped list query", async () => {
    const memberships = await testDb.workspaceMember.findMany({
      where: { userId: alice.user.id },
      select: { workspaceId: true },
    });

    const issues = await testDb.issue.findMany({
      where: { project: { workspaceId: { in: memberships.map((m) => m.workspaceId) } } },
      select: { id: true, title: true },
    });

    expect(issues.map((i) => i.id)).toContain(aliceIssueId);
    expect(issues.map((i) => i.id)).not.toContain(malloryIssueId);
    expect(issues.every((i) => !i.title.includes("Mallory"))).toBe(true);
  });

  it("stops leaking as soon as membership is granted, and resumes when revoked", async () => {
    // Invite Alice into Mallory's workspace...
    const membership = await testDb.workspaceMember.create({
      data: { userId: alice.user.id, workspaceId: mallory.workspace.id },
      select: { id: true },
    });
    expect(await visibleToUser(malloryIssueId, alice.user.id)).not.toBeNull();

    // ...and remove her again. Access must not linger.
    await testDb.workspaceMember.delete({ where: { id: membership.id } });
    expect(await visibleToUser(malloryIssueId, alice.user.id)).toBeNull();
  });

  it("scopes by membership, not by authorship", async () => {
    // An issue Mallory CREATED inside Alice's workspace is visible to Alice,
    // because visibility follows the workspace -- not who typed it.
    const issue = await testDb.issue.create({
      data: {
        number: 2,
        title: "Created by Mallory in Alice's workspace",
        projectId: alice.project.id,
        creatorId: mallory.user.id,
      },
      select: { id: true },
    });

    expect(await visibleToUser(issue.id, alice.user.id)).not.toBeNull();
    expect(await visibleToUser(issue.id, mallory.user.id)).toBeNull();
  });
});
