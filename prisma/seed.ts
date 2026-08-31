/**
 * Development seed.
 *
 * Gives every existing user a workspace, a project, labels and a realistic set
 * of issues, so the dashboard and (soon) the Kanban board have something true
 * to render instead of a hardcoded array.
 *
 * IDEMPOTENT ON PURPOSE. `prisma migrate dev` runs this automatically, and it
 * may run many times a day. Every write below is an upsert or is guarded by an
 * existence check, so running it twice does not produce two "Acme" workspaces
 * or ten copies of the same issue.
 *
 * Run manually with: npm run db:seed
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  IssuePriority,
  IssueStatus,
  WorkspaceRole,
} from "../src/generated/prisma/enums";

loadEnv({ path: ".env.local" });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** "Acme Inc" -> "acme-inc" */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const LABELS = [
  { name: "bug", color: "#ef4444" },
  { name: "frontend", color: "#6366f1" },
  { name: "backend", color: "#0ea5e9" },
  { name: "authentication", color: "#f59e0b" },
  { name: "performance", color: "#10b981" },
];

const ISSUES: Array<{
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
}> = [
  {
    title: "Fix authentication redirect",
    description:
      "Users are redirected to /login after refreshing the dashboard, even with a valid session.",
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.HIGH,
    labels: ["bug", "authentication"],
  },
  {
    title: "Update landing page copy",
    description: "The hero section still describes the old pricing model.",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
    labels: ["frontend"],
  },
  {
    title: "API timeout on issue search",
    description:
      "Searching more than ~2000 issues times out. Likely a missing index on the title column.",
    status: IssueStatus.TODO,
    priority: IssuePriority.URGENT,
    labels: ["backend", "performance"],
  },
  {
    title: "Add dark mode toggle",
    description:
      "Theme currently follows prefers-color-scheme only; users want an explicit switch.",
    status: IssueStatus.DONE,
    priority: IssuePriority.MEDIUM,
    labels: ["frontend"],
  },
  {
    title: "Kanban drag handles feel sluggish",
    description:
      "Dropping a card waits for the server round-trip before moving. Needs an optimistic update.",
    status: IssueStatus.BACKLOG,
    priority: IssuePriority.MEDIUM,
    labels: ["frontend", "performance"],
  },
  {
    title: "Rate limit the signup endpoint",
    description: "Nothing stops a script creating thousands of accounts.",
    status: IssueStatus.BACKLOG,
    priority: IssuePriority.HIGH,
    labels: ["backend", "authentication"],
  },
  {
    title: "Comment notifications are never sent",
    description: "Mentioning a teammate in a comment should notify them.",
    status: IssueStatus.DONE,
    priority: IssuePriority.LOW,
    labels: ["backend"],
  },
];

async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true } });

  if (users.length === 0) {
    console.log("No users yet -- sign up first, then re-run `npm run db:seed`.");
    return;
  }

  for (const user of users) {
    const workspaceName = `${user.name.split(/\s+/)[0]}'s Workspace`;
    const workspaceSlug = slugify(`${user.name}-workspace`);

    // upsert keyed on the unique slug, so re-running finds the same row.
    const workspace = await db.workspace.upsert({
      where: { slug: workspaceSlug },
      update: {},
      create: { name: workspaceName, slug: workspaceSlug },
    });

    await db.workspaceMember.upsert({
      // The composite @@unique([userId, workspaceId]) is addressable by name.
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      update: {},
      create: { userId: user.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
    });

    const labels = await Promise.all(
      LABELS.map((label) =>
        db.label.upsert({
          where: { workspaceId_name: { workspaceId: workspace.id, name: label.name } },
          update: { color: label.color },
          create: { ...label, workspaceId: workspace.id },
        }),
      ),
    );
    const labelsByName = new Map(labels.map((label) => [label.name, label.id]));

    const project = await db.project.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: "FLOW" } },
      update: {},
      create: {
        name: "FlowBoard",
        key: "FLOW",
        slug: "flowboard",
        description: "Building FlowBoard itself.",
        workspaceId: workspace.id,
      },
    });

    const existingIssues = await db.issue.count({ where: { projectId: project.id } });
    if (existingIssues > 0) {
      console.log(`${user.email}: already seeded (${existingIssues} issues) -- skipping issues.`);
      continue;
    }

    // Start numbering at 121 so keys look like a project with history, matching
    // the FLOW-124 examples in the design notes.
    let number = 120;
    let boardOrder = 0;

    for (const spec of ISSUES) {
      number += 1;
      boardOrder += 1000;

      await db.issue.create({
        data: {
          number,
          title: spec.title,
          description: spec.description,
          status: spec.status,
          priority: spec.priority,
          // Gaps of 1000 leave room to drop cards between neighbours without
          // renumbering anything -- see boardOrder in schema.prisma.
          boardOrder,
          completedAt: spec.status === IssueStatus.DONE ? new Date() : null,
          projectId: project.id,
          creatorId: user.id,
          assigneeId: spec.status === IssueStatus.BACKLOG ? null : user.id,
          labels: {
            create: spec.labels
              .map((name) => labelsByName.get(name))
              .filter((id): id is string => Boolean(id))
              .map((labelId) => ({ labelId })),
          },
        },
      });
    }

    // Keep the counter consistent with the numbers we just assigned, or the
    // next real issue created through the UI would collide.
    await db.project.update({
      where: { id: project.id },
      data: { issueCounter: number },
    });

    console.log(`${user.email}: seeded ${ISSUES.length} issues in ${workspace.slug}/FLOW`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
