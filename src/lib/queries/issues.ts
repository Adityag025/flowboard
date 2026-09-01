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
   * The INTERACTIVE transaction form, so this can return a shaped object and
   * keep the page/count logic readable. Same single consistent snapshot as the
   * array form.
   *
   * Note for anyone chasing it: node-postgres logs a deprecation warning
   * ("client.query() when the client is already executing a query") on Prisma
   * transactions. It is NOT caused by the array form of $transaction -- switching
   * away from it does not silence the warning. The stack sits entirely inside
   * @prisma/adapter-pg's PgTransaction.performIO, i.e. upstream. Verified with
   * --trace-deprecation.
   */
  const { rows, total } = await db.$transaction(async (tx) => {
    const rows = await tx.issue.findMany({
      where,
      select: issueListSelect,
      // The id tiebreaker is load-bearing for pagination, not cosmetic: without
      // it, two issues sharing a millisecond make the page boundary ambiguous
      // and the seam row repeats or vanishes.
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      // Fetch ONE more than we need. If it comes back, there is another page --
      // which is cheaper and more accurate than comparing against a total that
      // may have changed since it was counted.
      take: take + 1,
    });

    // `total` counts the whole filtered set, not the page. It is a separate
    // count() and gets slower on very large tables; if that ever matters,
    // switch to an approximate count rather than dropping the cursor.
    const total = await tx.issue.count({ where: base });

    return { rows, total };
  });

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
