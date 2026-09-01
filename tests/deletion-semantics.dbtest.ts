import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceRole } from "@/generated/prisma/enums";

import { createFixture, destroyFixture, testDb, type Fixture } from "./db-helpers";

/**
 * Deletion behaviour, which is a PRODUCT decision the schema encodes:
 *
 *   Deleting a user must remove their ACCESS but preserve their WORK.
 *
 * So memberships cascade while issues and comments SET NULL. Get this wrong and
 * offboarding one employee silently deletes months of project history -- a bug
 * you discover long after the data is gone. Worth a test that fails loudly.
 */
describe("deletion semantics", () => {
  let owner: Fixture;

  beforeAll(async () => {
    owner = await createFixture("deletion");
  });

  afterAll(async () => {
    await destroyFixture(owner);
    await testDb.$disconnect();
  });

  it("deleting a user removes their membership but keeps their issues and comments", async () => {
    // A second person in the owner's workspace, who does some work and leaves.
    const leaver = await testDb.user.create({
      data: {
        name: "Leaver",
        email: `leaver-${owner.token}@test.invalid`,
        passwordHash: null,
      },
      select: { id: true },
    });

    await testDb.workspaceMember.create({
      data: {
        userId: leaver.id,
        workspaceId: owner.workspace.id,
        role: WorkspaceRole.MEMBER,
      },
    });

    const issue = await testDb.issue.create({
      data: {
        number: 900,
        title: "Work done by someone who later left",
        projectId: owner.project.id,
        creatorId: leaver.id,
        assigneeId: leaver.id,
      },
      select: { id: true },
    });

    const comment = await testDb.comment.create({
      data: { issueId: issue.id, authorId: leaver.id, body: "My analysis." },
      select: { id: true },
    });

    await testDb.user.delete({ where: { id: leaver.id } });

    // Access is gone.
    const memberships = await testDb.workspaceMember.count({
      where: { userId: leaver.id },
    });
    expect(memberships).toBe(0);

    // The work is not.
    const survivingIssue = await testDb.issue.findUnique({
      where: { id: issue.id },
      select: { id: true, title: true, creatorId: true, assigneeId: true },
    });
    expect(survivingIssue).not.toBeNull();
    expect(survivingIssue!.title).toBe("Work done by someone who later left");
    // Attribution is lost, which is the intended trade.
    expect(survivingIssue!.creatorId).toBeNull();
    expect(survivingIssue!.assigneeId).toBeNull();

    const survivingComment = await testDb.comment.findUnique({
      where: { id: comment.id },
      select: { body: true, authorId: true },
    });
    expect(survivingComment).not.toBeNull();
    expect(survivingComment!.body).toBe("My analysis.");
    expect(survivingComment!.authorId).toBeNull();
  });

  it("deleting an issue cascades its comments, labels and activities", async () => {
    const label = await testDb.label.create({
      data: { name: `lbl-${owner.token}`, color: "#fff", workspaceId: owner.workspace.id },
      select: { id: true },
    });

    const issue = await testDb.issue.create({
      data: {
        number: 901,
        title: "Doomed",
        projectId: owner.project.id,
        comments: { create: { body: "attached", authorId: owner.user.id } },
        labels: { create: { labelId: label.id } },
      },
      select: { id: true },
    });

    await testDb.activity.create({
      data: {
        type: "ISSUE_CREATED",
        workspaceId: owner.workspace.id,
        actorId: owner.user.id,
        issueId: issue.id,
      },
    });

    await testDb.issue.delete({ where: { id: issue.id } });

    expect(await testDb.comment.count({ where: { issueId: issue.id } })).toBe(0);
    expect(await testDb.issueLabel.count({ where: { issueId: issue.id } })).toBe(0);
    expect(await testDb.activity.count({ where: { issueId: issue.id } })).toBe(0);

    // The label itself is workspace-level and must survive.
    expect(
      await testDb.label.findUnique({ where: { id: label.id }, select: { id: true } }),
    ).not.toBeNull();
  });

  it("deleting a project cascades its issues but leaves the workspace intact", async () => {
    const project = await testDb.project.create({
      data: {
        name: "Temp",
        key: `T${owner.token.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`,
        slug: `temp-${owner.token}`,
        workspaceId: owner.workspace.id,
      },
      select: { id: true },
    });

    const issue = await testDb.issue.create({
      data: { number: 1, title: "Inside temp project", projectId: project.id },
      select: { id: true },
    });

    await testDb.project.delete({ where: { id: project.id } });

    expect(
      await testDb.issue.findUnique({ where: { id: issue.id }, select: { id: true } }),
    ).toBeNull();
    expect(
      await testDb.workspace.findUnique({
        where: { id: owner.workspace.id },
        select: { id: true },
      }),
    ).not.toBeNull();
  });

  it("rejects a duplicate membership for the same user and workspace", async () => {
    await expect(
      testDb.workspaceMember.create({
        data: { userId: owner.user.id, workspaceId: owner.workspace.id },
      }),
    ).rejects.toThrow();
  });

  it("allows the same project key in two different workspaces", async () => {
    const other = await createFixture("deletion-other");
    try {
      const sharedKey = "SHARED";
      await testDb.project.update({
        where: { id: owner.project.id },
        data: { key: sharedKey },
      });

      // Same key, different workspace -- must be allowed, because keys are
      // unique per workspace rather than globally.
      await expect(
        testDb.project.update({
          where: { id: other.project.id },
          data: { key: sharedKey },
        }),
      ).resolves.toBeTruthy();
    } finally {
      await destroyFixture(other);
    }
  });
});
