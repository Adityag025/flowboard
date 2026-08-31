import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  currentUser,
  priorityLabels,
  recentIssues,
  stats,
  statusLabels,
} from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Overview",
};

/**
 * A Server Component. Note what is NOT here: no "use client", no useEffect,
 * no loading state, no fetch-on-mount. The data is resolved before the HTML
 * is sent. In Stage 4 the import above becomes an awaited Prisma call and this
 * component's shape barely changes -- that is the whole point of the pattern.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {currentUser.name}
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
 * Runs on the SERVER, so this reflects the server's clock and timezone, not
 * the visitor's. Fine for now; a real fix means rendering it on the client or
 * reading the user's timezone from their profile in Stage 3.
 */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
