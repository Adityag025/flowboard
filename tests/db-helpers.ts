import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * A test client, separate from the app's singleton.
 *
 * The app's `db` caches itself on globalThis for Next's hot reload; tests want a
 * plain client they can disconnect deterministically.
 */
export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

/**
 * A self-contained tenant: one user, one workspace they own, one project.
 *
 * Everything is namespaced with a random token so tests never collide with the
 * seeded development data or with each other -- these tests run against the real
 * dev database, and wiping it to run a test would be a hostile thing to do to
 * whoever is using the app.
 */
export async function createFixture(label: string) {
  const token = `${label}-${Math.random().toString(36).slice(2, 10)}`;

  const user = await testDb.user.create({
    data: {
      name: `Test ${token}`,
      email: `${token}@test.invalid`,
      passwordHash: null,
    },
    select: { id: true, email: true },
  });

  const workspace = await testDb.workspace.create({
    data: { name: `WS ${token}`, slug: `ws-${token}` },
    select: { id: true },
  });

  await testDb.workspaceMember.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: WorkspaceRole.OWNER,
    },
  });

  const project = await testDb.project.create({
    data: {
      name: `Project ${token}`,
      key: token.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X"),
      slug: `p-${token}`,
      workspaceId: workspace.id,
    },
    select: { id: true, key: true },
  });

  return { token, user, workspace, project };
}

/**
 * Deleting the workspace relies on the cascade rules being right -- projects,
 * issues, comments, labels, activities and memberships all go with it. The user
 * is deleted separately because a user is not owned by a workspace.
 */
export async function destroyFixture(fixture: Fixture) {
  await testDb.workspace.delete({ where: { id: fixture.workspace.id } }).catch(() => {});
  await testDb.user.delete({ where: { id: fixture.user.id } }).catch(() => {});
}

/** The membership-scoped visibility check used by every read path in the app. */
export function visibleToUser(issueId: string, userId: string) {
  return testDb.issue.findFirst({
    where: {
      id: issueId,
      project: { workspace: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
}
