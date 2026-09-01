import { Prisma } from "@/generated/prisma/client";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { workspaceIdsFor } from "@/lib/authz";
import { db } from "@/lib/db";

export type IssueFilters = {
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string;
  labelId?: string;
  projectKey?: string;
  q?: string;
};

/**
 * Builds the WHERE clause for a list of issues.
 *
 * The workspace scope is baked in FIRST and cannot be overridden by any filter,
 * so a hostile query string can narrow results but never widen them past what
 * this user may see.
 */
function issueWhere(workspaceIds: string[], filters: IssueFilters): Prisma.IssueWhereInput {
  return {
    project: {
      workspaceId: { in: workspaceIds },
      archivedAt: null,
      // Nested inside the project filter, so it composes with the workspace
      // scope above rather than replacing it.
      ...(filters.projectKey ? { key: filters.projectKey } : {}),
    },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.labelId ? { labels: { some: { labelId: filters.labelId } } } : {}),
    ...(filters.q
      ? {
          /**
           * `mode: "insensitive"` maps to Postgres ILIKE. Fine at this scale;
           * it cannot use a plain btree index, so Stage 8 replaces it with a
           * proper full-text search (tsvector + GIN) rather than pretending
           * `contains` scales.
           */
          OR: [
            { title: { contains: filters.q, mode: "insensitive" } },
            { description: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/** Columns needed to render an issue row. Nothing more. */
const issueListSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  updatedAt: true,
  project: { select: { id: true, key: true, name: true } },
  assignee: { select: { id: true, name: true, image: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.IssueSelect;

export type IssueListItem = Prisma.IssueGetPayload<{ select: typeof issueListSelect }>;

export async function listIssues(userId: string, filters: IssueFilters, take = 50) {
  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) {
    return { issues: [] as IssueListItem[], total: 0 };
  }

  const where = issueWhere(workspaceIds, filters);

  // One transaction: the count and the page cannot disagree.
  const [issues, total] = await db.$transaction([
    db.issue.findMany({
      where,
      select: issueListSelect,
      // Secondary sort on id so pagination is stable when two rows share a
      // timestamp -- otherwise the same row can appear on two pages.
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
    }),
    db.issue.count({ where }),
  ]);

  return { issues, total };
}

/** Everything the detail page renders, in ONE query rather than five. */
export async function getIssueByKey(userId: string, projectKey: string, number: number) {
  return db.issue.findFirst({
    where: {
      number,
      project: {
        key: projectKey,
        workspace: { members: { some: { userId } } },
      },
    },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      aiSummary: true,
      project: {
        select: { id: true, key: true, name: true, workspaceId: true },
      },
      creator: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          editedAt: true,
          author: { select: { id: true, name: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** Projects, labels and members the user can pick from in forms. */
export async function getFormOptions(userId: string) {
  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) {
    return { projects: [], labels: [], members: [] };
  }

  const [projects, labels, memberships] = await db.$transaction([
    db.project.findMany({
      where: { workspaceId: { in: workspaceIds }, archivedAt: null },
      select: { id: true, name: true, key: true },
      orderBy: { name: "asc" },
    }),
    db.label.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  // The same person can be in two of our workspaces; show them once.
  const members = [...new Map(memberships.map((m) => [m.user.id, m.user])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return { projects, labels, members };
}
