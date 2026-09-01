import { Prisma } from "@/generated/prisma/client";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { workspaceIdsFor } from "@/lib/queries/workspaces";
import { db } from "@/lib/db";
import { cursorFilter, encodeCursor, type Cursor } from "@/lib/pagination";

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

export const ISSUES_PER_PAGE = 25;

export type IssuePage = {
  issues: IssueListItem[];
  total: number;
  /** Pass back as ?cursor= to get the next page. null means this is the last. */
  nextCursor: string | null;
};

export async function listIssues(
  userId: string,
  filters: IssueFilters,
  options: { cursor?: Cursor | null; take?: number } = {},
): Promise<IssuePage> {
  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) {
    return { issues: [], total: 0, nextCursor: null };
  }

  const take = options.take ?? ISSUES_PER_PAGE;
  const base = issueWhere(workspaceIds, filters);

  // The cursor NARROWS the already-scoped query; it is ANDed with the workspace
  // filter, never merged in a way that could replace it.
  const where = options.cursor
    ? { AND: [base, cursorFilter(options.cursor)] }
    : base;

  /**
   * The page and the count run as TWO POOLED QUERIES, deliberately NOT wrapped
   * in one transaction.
   *
   * They used to share a transaction, for a consistent snapshot. That combination
   * triggers node-postgres's "client.query() when the client is already executing
   * a query" deprecation -- which pg@9 turns into a thrown error, so this was a
   * latent breakage, not just log noise.
   *
   * The precise trigger, isolated by experiment:
   *
   *   findMany WITH RELATIONS, followed by another query, in the SAME
   *   transaction  -> warns
   *   the same findMany with nothing after it              -> clean
   *   the same findMany outside a transaction              -> clean
   *   a scalar-only findMany plus another query in a tx    -> clean
   *
   * Prisma's query interpreter issues several queries to load relations, and a
   * following query in the same transaction overlaps them on that transaction's
   * single connection. Separate pooled queries each get their own connection, so
   * nothing overlaps.
   *
   * WHAT THIS COSTS: `total` and the page are no longer read from one snapshot,
   * so a concurrent insert can make the count disagree with the rows by one.
   * `total` is a display number ("60 issues"), and nobody is harmed by it being
   * momentarily stale. Correctness of the PAGE itself does not depend on it --
   * `nextCursor` comes from the rows, not from the count.
   *
   * NOTE FOR FUTURE EDITS: do not "tidy" these back into a $transaction. The
   * dashboard and getFormOptions are safe only because their relation-loading
   * query happens to be LAST in their transaction; that is a fragile, invisible
   * constraint, so prefer pooled queries whenever relations are involved.
   */
  const [rows, total] = await Promise.all([
    db.issue.findMany({
      where,
      select: issueListSelect,
      // The id tiebreaker is load-bearing for pagination, not cosmetic: without
      // it, two issues sharing a millisecond make the page boundary ambiguous
      // and the seam row repeats or vanishes.
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      // Fetch ONE more than we need. If it comes back, there is another page --
      // cheaper and more accurate than comparing against a total that may have
      // changed since it was counted.
      take: take + 1,
    }),
    db.issue.count({ where: base }),
  ]);

  const hasMore = rows.length > take;
  const issues = hasMore ? rows.slice(0, take) : rows;
  const last = issues.at(-1);

  return {
    issues,
    total,
    nextCursor:
      hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
  };
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

  const { projects, labels, memberships } = await db.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where: { workspaceId: { in: workspaceIds }, archivedAt: null },
      select: { id: true, name: true, key: true },
      orderBy: { name: "asc" },
    });
    const labels = await tx.label.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });
    const memberships = await tx.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { user: { select: { id: true, name: true } } },
    });
    return { projects, labels, memberships };
  });

  // The same person can be in two of our workspaces; show them once.
  const members = [...new Map(memberships.map((m) => [m.user.id, m.user])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return { projects, labels, members };
}
