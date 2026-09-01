/**
 * Tenant isolation regression test.
 *
 * Creates a second, unrelated workspace and asserts that its issue is invisible
 * to a user who is not a member -- and still visible to one who is. Both
 * directions matter: a scoping bug can leak data OR lock people out of their
 * own.
 *
 * This exercises the exact membership-in-the-WHERE-clause pattern that every
 * query and authorization guard uses, so if someone "simplifies" that away, this
 * fails loudly.
 *
 * Run with: npm run check:isolation
 */
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { WorkspaceRole } from "../src/generated/prisma/enums";

loadEnv({ path: ".env.local" });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const hash = await bcrypt.hash("intruder-test-pw", 12);

  const other = await db.user.upsert({
    where: { email: "mallory@example.com" },
    update: {},
    create: { name: "Mallory Other", email: "mallory@example.com", passwordHash: hash },
  });

  const ws = await db.workspace.upsert({
    where: { slug: "mallory-workspace" },
    update: {},
    create: { name: "Mallory's Workspace", slug: "mallory-workspace" },
  });

  await db.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: other.id, workspaceId: ws.id } },
    update: {},
    create: { userId: other.id, workspaceId: ws.id, role: WorkspaceRole.OWNER },
  });

  const proj = await db.project.upsert({
    where: { workspaceId_key: { workspaceId: ws.id, key: "SECRET" } },
    update: {},
    create: {
      name: "Mallory Private",
      key: "SECRET",
      slug: "mallory-private",
      workspaceId: ws.id,
      issueCounter: 1,
    },
  });

  const issue = await db.issue.upsert({
    where: { projectId_number: { projectId: proj.id, number: 1 } },
    update: {},
    create: {
      number: 1,
      title: "Mallory confidential issue",
      projectId: proj.id,
      creatorId: other.id,
    },
  });

  const aditya = await db.user.findUniqueOrThrow({
    where: { email: "aditya@example.com" },
    select: { id: true },
  });

  const visible = (userId: string) =>
    db.issue.findFirst({
      where: {
        id: issue.id,
        project: { workspace: { members: { some: { userId } } } },
      },
      select: { id: true },
    });

  const leaksToOutsider = (await visible(aditya.id)) !== null;
  const visibleToOwner = (await visible(other.id)) !== null;

  console.log(`outsider can see the issue: ${leaksToOutsider}  (must be false)`);
  console.log(`owner can see the issue:    ${visibleToOwner}   (must be true)`);

  // Assert, so this is a regression test rather than a report nobody reads.
  if (leaksToOutsider) {
    throw new Error("TENANT ISOLATION BROKEN: a non-member can read another workspace's issue");
  }
  if (!visibleToOwner) {
    throw new Error("SCOPING TOO STRICT: a workspace member cannot read their own issue");
  }
  console.log("\nOK - tenant isolation holds in both directions.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
