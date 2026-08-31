import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IssueStatus } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  OPEN_STATUSES,
  issueKey,
  priorityLabels,
  priorityVariants,
  statusLabels,
  statusVariants,
} from "@/lib/issues";

export const metadata: Metadata = {
  title: "Overview",
};

/** Monday 00:00 in the server's timezone. */
function startOfWeek(): Date {
  const now = new Date();
  // getDay() is 0 for Sunday, so shift so Monday is the first day.
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default async function DashboardPage() {
  const session = await auth();
  // The layout already redirected anyone unauthenticated, so this is present.
  const userId = session!.user.id;
  const firstName = session!.user.name?.trim().split(/\s+/)[0] ?? "there";

  /**
   * SCOPING IS THE SECURITY BOUNDARY.
   *
   * Every query below is filtered through the workspaces this user is a member
   * of. Nothing is fetched and then filtered in JavaScript -- if a row is not
   * theirs, the database never returns it. An `if (issue.userId === userId)`
   * check in the component would be a bug waiting for someone to forget it.
   */
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);

  if (workspaceIds.length === 0) {
    return <EmptyState firstName={firstName} />;
  }

  const visibleIssues = {
    project: {
      workspaceId: { in: workspaceIds },
      archivedAt: null,
    },
  };

  /**
   * $transaction batches these into ONE round trip and one consistent
   * snapshot. Four sequential awaits would mean four round trips, and the
   * counts could disagree with the list if someone edited an issue in between.
   */
  const [openCount, inProgressCount, completedThisWeek, recentIssues] =
    await db.$transaction([
      db.issue.count({
        where: { ...visibleIssues, status: { in: [...OPEN_STATUSES] } },
      }),
      db.issue.count({
        where: { ...visibleIssues, status: IssueStatus.IN_PROGRESS },
      }),
      db.issue.count({
        where: {
          ...visibleIssues,
          status: IssueStatus.DONE,
          completedAt: { gte: startOfWeek() },
        },
      }),
      db.issue.findMany({
        where: visibleIssues,
        orderBy: { updatedAt: "desc" },
        take: 5,
        /**
         * `select` rather than `include`, and only the columns actually
         * rendered. `include` would drag every column of every relation across
         * the wire -- including issue descriptions we do not show here.
         *
         * The nested selects also avoid the classic N+1: Prisma resolves the
         * project and labels for all five issues in one query each, not one
         * query per issue.
         */
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          priority: true,
          project: { select: { key: true } },
          labels: { select: { label: { select: { id: true, name: true } } } },
        },
      }),
    ]);

  const stats = [
    { label: "Open Issues", value: openCount },
    { label: "In Progress", value: inProgressCount },
    { label: "Completed This Week", value: completedThisWeek },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted">
          Here&apos;s what&apos;s happening with your projects.
        </p>
      </header>

      <section
        aria-label="Summary"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-sm text-muted">{stat.label}</p>
          </Card>
        ))}
      </section>

      <section aria-label="Recent issues" className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Recent Issues</h2>

        {recentIssues.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No issues yet. Create your first one to get started.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {recentIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-hover"
                >
                  <span className="font-mono text-xs text-muted">
                    {issueKey(issue.project.key, issue.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {issue.title}
                  </span>

                  <span className="hidden gap-1.5 md:flex">
                    {issue.labels.map(({ label }) => (
                      <Badge key={label.id}>{label.name}</Badge>
                    ))}
                  </span>

                  <Badge variant={priorityVariants[issue.priority]}>
                    {priorityLabels[issue.priority]}
                  </Badge>
                  <Badge variant={statusVariants[issue.status]}>
                    {statusLabels[issue.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function EmptyState({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted">
          You aren&apos;t a member of any workspace yet.
        </p>
      </header>
      <Card>
        <p className="text-sm text-muted">
          Workspaces are created automatically at signup. If you are seeing
          this, run{" "}
          <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-xs">
            npm run db:seed
          </code>{" "}
          to set one up, or{" "}
          <Link href="/settings" className="text-accent hover:underline">
            check your settings
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

/**
 * Still the SERVER's clock, so this is wrong for users in other timezones.
 * The real fix is a timezone on the user profile.
 */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
