import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, Section } from "@/components/ui/card";
import { IssueStatus } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  OPEN_STATUSES,
  issueKey,
  priorityGlyphs,
  priorityLabels,
  priorityVariants,
  statusGlyphs,
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
   * One transaction, so the counts and the list share a single consistent
   * snapshot -- otherwise an edit landing between queries makes the numbers
   * disagree with the rows beneath them.
   *
   * The interactive form, which lets us name the four results instead of
   * destructuring a positional array -- easy to get subtly wrong when three of
   * them are counts.
   */
  const { openCount, inProgressCount, completedThisWeek, recentIssues } =
    await db.$transaction(async (tx) => {
      const openCount = await tx.issue.count({
        where: { ...visibleIssues, status: { in: [...OPEN_STATUSES] } },
      });
      const inProgressCount = await tx.issue.count({
        where: { ...visibleIssues, status: IssueStatus.IN_PROGRESS },
      });
      const completedThisWeek = await tx.issue.count({
        where: {
          ...visibleIssues,
          status: IssueStatus.DONE,
          completedAt: { gte: startOfWeek() },
        },
      });
      const recentIssues = await tx.issue.findMany({
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
      });

      return { openCount, inProgressCount, completedThisWeek, recentIssues };
    });

  const stats = [
    { label: "Open Issues", value: openCount },
    { label: "In Progress", value: inProgressCount },
    { label: "Completed This Week", value: completedThisWeek },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-medium tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-xs text-muted">
          {/* A terminal-style prompt line: quiet, and it reads as machine output
              rather than marketing copy. */}
          <span className="text-accent">&gt;</span> here&apos;s what&apos;s
          happening with your projects
        </p>
      </header>

      {/*
        One bordered strip divided by rules, not three floating cards. The
        numbers are the loudest thing on the page, which is correct -- they are
        why someone opened it.
      */}
      <section
        aria-label="Summary"
        className="grid grid-cols-1 border border-border sm:grid-cols-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <p className="text-2xl font-medium tabular-nums">{stat.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      <Section label="recent" meta={`${recentIssues.length} shown`}>
        {recentIssues.length === 0 ? (
          <p className="text-xs text-muted">
            No issues yet. Create your first one to get started.
          </p>
        ) : (
          <div className="border border-border">
            <ul className="divide-y divide-border">
              {recentIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 transition-colors hover:bg-surface-hover"
                >
                  <span className="text-[11px] text-accent">
                    {issueKey(issue.project.key, issue.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {issue.title}
                  </span>

                  <span className="hidden gap-1.5 md:flex">
                    {issue.labels.map(({ label }) => (
                      <Badge key={label.id}>{label.name}</Badge>
                    ))}
                  </span>

                  <Badge variant={priorityVariants[issue.priority]} glyph={priorityGlyphs[issue.priority]}>
                    {priorityLabels[issue.priority]}
                  </Badge>
                  <Badge variant={statusVariants[issue.status]} glyph={statusGlyphs[issue.status]}>
                    {statusLabels[issue.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
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
