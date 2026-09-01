import { Prisma } from "@/generated/prisma/client";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/issues";
import { workspaceIdsFor } from "@/lib/queries/workspaces";

export type AnalyticsFilters = {
  projectKey?: string;
  /** How many trailing weeks the throughput series covers. */
  weeks: number;
};

export type Analytics = {
  headline: {
    open: number;
    completedThisWeek: number;
    /** Median days from creation to completion, or null when nothing is done yet. */
    medianCycleDays: number | null;
    unassigned: number;
  };
  byStatus: Array<{ status: IssueStatus; count: number }>;
  byPriority: Array<{ priority: IssuePriority; count: number }>;
  throughput: Array<{ weekStart: Date; completed: number }>;
  workload: Array<{ name: string; count: number }>;
  projects: Array<{ key: string; name: string }>;
  totalIssues: number;
};

/** Monday 00:00 of the current week, in the server's timezone. */
function startOfWeek(from = new Date()): Date {
  const daysSinceMonday = (from.getDay() + 6) % 7;
  const monday = new Date(from);
  monday.setDate(from.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Everything the analytics page renders.
 *
 * SCOPING, as everywhere: the workspace filter is applied first and cannot be
 * widened by any parameter. A hostile ?projectKey= can narrow the result set,
 * never reach another tenant's.
 *
 * These are separate POOLED queries rather than one transaction. Each is an
 * aggregate over the same rows, so a snapshot would be tidier -- but wrapping a
 * relation-loading read plus others in a transaction is exactly what triggered
 * the node-postgres connection-overlap bug, and analytics numbers that disagree
 * by one row between panels are not worth reintroducing it. The counts are
 * displayed, not decided on.
 */
export async function getAnalytics(
  userId: string,
  filters: AnalyticsFilters,
): Promise<Analytics | null> {
  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) return null;

  const projectWhere: Prisma.ProjectWhereInput = {
    workspaceId: { in: workspaceIds },
    archivedAt: null,
    ...(filters.projectKey ? { key: filters.projectKey } : {}),
  };

  const issueWhere: Prisma.IssueWhereInput = { project: projectWhere };

  const weekStart = startOfWeek();
  // Inclusive of the current (partial) week, so `weeks: 8` shows 8 bars.
  const rangeStart = new Date(weekStart);
  rangeStart.setDate(rangeStart.getDate() - (filters.weeks - 1) * 7);

  const [
    open,
    completedThisWeek,
    unassigned,
    totalIssues,
    statusGroups,
    priorityGroups,
    assigneeGroups,
    projects,
  ] = await Promise.all([
    db.issue.count({ where: { ...issueWhere, status: { in: [...OPEN_STATUSES] } } }),
    db.issue.count({
      where: { ...issueWhere, status: IssueStatus.DONE, completedAt: { gte: weekStart } },
    }),
    db.issue.count({
      where: { ...issueWhere, assigneeId: null, status: { in: [...OPEN_STATUSES] } },
    }),
    db.issue.count({ where: issueWhere }),

    db.issue.groupBy({ by: ["status"], where: issueWhere, _count: { _all: true } }),
    db.issue.groupBy({
      by: ["priority"],
      // Priority of a closed issue is history; the actionable question is what
      // is queued and how urgent it is.
      where: { ...issueWhere, status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    }),
    db.issue.groupBy({
      by: ["assigneeId"],
      where: { ...issueWhere, status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    }),

    db.project.findMany({
      where: { workspaceId: { in: workspaceIds }, archivedAt: null },
      select: { key: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  /**
   * Median cycle time and weekly throughput need SQL Prisma cannot express:
   * percentile_cont and date_trunc. Both are parameterised -- projectKey arrives
   * from a query string, and string-concatenating it into SQL is how you get an
   * injection in the one place the ORM was protecting you.
   */
  const projectFilterSql = filters.projectKey
    ? Prisma.sql`AND p.key = ${filters.projectKey}`
    : Prisma.empty;

  const medianRows = await db.$queryRaw<Array<{ median_days: number | null }>>(Prisma.sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (i."completedAt" - i."createdAt")) / 86400
           ) AS median_days
    FROM issues i
    JOIN projects p ON p.id = i."projectId"
    WHERE p."workspaceId" IN (${Prisma.join(workspaceIds)})
      AND p."archivedAt" IS NULL
      AND i."completedAt" IS NOT NULL
      ${projectFilterSql}
  `);

  const throughputRows = await db.$queryRaw<Array<{ week_start: Date; completed: bigint }>>(Prisma.sql`
    SELECT date_trunc('week', i."completedAt") AS week_start, COUNT(*) AS completed
    FROM issues i
    JOIN projects p ON p.id = i."projectId"
    WHERE p."workspaceId" IN (${Prisma.join(workspaceIds)})
      AND p."archivedAt" IS NULL
      AND i."completedAt" >= ${rangeStart}
      ${projectFilterSql}
    GROUP BY 1
    ORDER BY 1
  `);

  // Names for the assignee buckets, fetched separately so groupBy stays scalar.
  const assigneeIds = assigneeGroups
    .map((g) => g.assigneeId)
    .filter((id): id is string => Boolean(id));
  const people =
    assigneeIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  /**
   * Every status and priority appears, including zeroes.
   *
   * groupBy only returns rows that exist, so a status with no issues would be
   * absent and the chart would silently omit a category -- making "no issues in
   * Canceled" indistinguishable from "Canceled doesn't exist". Ordered by the
   * enum, not by count, so the bars do not reshuffle between page loads.
   */
  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const byStatus = Object.values(IssueStatus).map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const priorityCounts = new Map(priorityGroups.map((g) => [g.priority, g._count._all]));
  const byPriority = Object.values(IssuePriority).map((priority) => ({
    priority,
    count: priorityCounts.get(priority) ?? 0,
  }));

  // Dense weekly series: a week with nothing completed must render as a zero
  // column, not vanish and make the time axis lie about its spacing.
  const completedByWeek = new Map(
    throughputRows.map((r) => [startOfWeek(new Date(r.week_start)).getTime(), Number(r.completed)]),
  );
  const throughput: Array<{ weekStart: Date; completed: number }> = [];
  for (let i = 0; i < filters.weeks; i += 1) {
    const week = new Date(rangeStart);
    week.setDate(rangeStart.getDate() + i * 7);
    const normalised = startOfWeek(week);
    throughput.push({
      weekStart: normalised,
      completed: completedByWeek.get(normalised.getTime()) ?? 0,
    });
  }

  const workload = assigneeGroups
    .map((g) => ({
      name: g.assigneeId ? (nameById.get(g.assigneeId) ?? "Unknown") : "Unassigned",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const median = medianRows[0]?.median_days;

  return {
    headline: {
      open,
      completedThisWeek,
      medianCycleDays: median === null || median === undefined ? null : Number(median),
      unassigned,
    },
    byStatus,
    byPriority,
    throughput,
    workload,
    projects,
    totalIssues,
  };
}
