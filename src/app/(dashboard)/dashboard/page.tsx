import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import {
  priorityLabels,
  recentIssues,
  stats,
  statusLabels,
} from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Overview",
};

/**
 * A Server Component. No "use client", no useEffect, no fetch-on-mount -- the
 * data is resolved before any HTML is sent.
 *
 * This route was previously prerendered at BUILD time, which froze the
 * greeting below into the static output forever. Calling auth() reads cookies,
 * and reading cookies makes a route dynamic, so the greeting is now computed
 * per request. The bug fixed itself the moment the page needed a real user --
 * which is exactly why we did not paper over it with force-dynamic.
 *
 * The stats and issue list are still mock data. They become Prisma queries in
 * Stage 4, and the shape of this component barely changes.
 */
export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "there";

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

        <Card className="p-0">
          <ul className="divide-y divide-border">
            {recentIssues.map((issue) => (
              <li
                key={issue.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-hover"
              >
                <span className="font-mono text-xs text-muted">{issue.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {issue.title}
                </span>
                <Badge variant={issue.priority}>
                  {priorityLabels[issue.priority]}
                </Badge>
                <Badge variant={issue.status}>
                  {statusLabels[issue.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

/**
 * Still the SERVER's clock, so this reflects the server timezone rather than
 * the visitor's. Correct fix is the user's timezone on their profile -- noted
 * for when profiles land.
 */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
