import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { BarChart } from "@/components/analytics/bar-chart";
import { ColumnChart } from "@/components/analytics/column-chart";
import { DataTable } from "@/components/analytics/data-table";
import { ORDINAL_VARS, VIZ_CSS } from "@/components/analytics/viz-tokens";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { priorityLabels, statusLabels } from "@/lib/issues";
import { getAnalytics } from "@/lib/queries/analytics";

export const metadata: Metadata = {
  title: "Analytics",
};

const ALLOWED_WEEKS = [4, 8, 12, 26];

/** "Aug 25" — short enough for an axis tick. */
function weekTick(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  /**
   * Both parameters come from the query string, so both are validated rather
   * than trusted. `weeks` in particular reaches a date calculation and a query
   * range -- ?weeks=99999 would build a 99,999-element array before touching the
   * database.
   */
  const requestedWeeks = Number(single(params.weeks));
  const weeks = ALLOWED_WEEKS.includes(requestedWeeks) ? requestedWeeks : 8;
  const projectKey = single(params.projectKey)?.toUpperCase() || undefined;

  const analytics = await getAnalytics(user.id, { projectKey, weeks });

  if (!analytics) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <Card>
          <p className="text-sm text-muted">
            You aren&apos;t a member of any workspace yet.
          </p>
        </Card>
      </div>
    );
  }

  const { headline, byStatus, byPriority, throughput, workload, projects, totalIssues } =
    analytics;

  const statusData = byStatus.map((row) => ({
    label: statusLabels[row.status],
    value: row.count,
  }));

  // Ordinal ramp: priority is ORDERED, so colour depth carries the order rather
  // than merely distinguishing the bars. Index maps NONE..URGENT onto the
  // validated ramp.
  const priorityData = byPriority.map((row, index) => ({
    label: priorityLabels[row.priority],
    value: row.count,
    color: ORDINAL_VARS[index] ?? ORDINAL_VARS[ORDINAL_VARS.length - 1],
  }));

  const throughputData = throughput.map((row) => ({
    label: weekTick(row.weekStart),
    sublabel: `Week of ${row.weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
    value: row.completed,
  }));

  const completedInRange = throughput.reduce((sum, row) => sum + row.completed, 0);

  const stats = [
    { label: "Open issues", value: headline.open },
    { label: "Completed this week", value: headline.completedThisWeek },
    {
      label: "Median cycle time",
      value:
        headline.medianCycleDays === null
          ? "—"
          : headline.medianCycleDays < 1
            ? "<1 day"
            : `${headline.medianCycleDays.toFixed(1)} days`,
      // Said plainly, because "cycle time" means different things at different
      // companies and a dashboard should not assume.
      hint: "Created to completed, median",
    },
    { label: "Unassigned", value: headline.unassigned, hint: "Open issues with no owner" },
  ];

  return (
    <div className="space-y-6">
      {/* Chart colour roles. Inlined rather than in globals.css so the tokens
          live beside the components that consume them. */}
      <style>{VIZ_CSS}</style>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted">
          {totalIssues} {totalIssues === 1 ? "issue" : "issues"}
          {projectKey ? ` in ${projectKey}` : " across all projects"}
        </p>
      </header>

      <AnalyticsFilters projects={projects} />

      {totalIssues === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No issues yet, so there is nothing to chart.{" "}
            <Link href="/issues/new" className="text-accent hover:underline">
              Create one
            </Link>
            .
          </p>
        </Card>
      ) : (
        <>
          {/*
            Stat tiles, NOT charts. Four single numbers have no shape to compare
            and no trend to trace -- a chart would add ink and remove clarity.
          */}
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
                <p className="mt-1 text-sm text-muted">{stat.label}</p>
                {stat.hint && (
                  <p className="mt-0.5 text-xs text-muted opacity-70">{stat.hint}</p>
                )}
              </Card>
            ))}
          </section>

          <section aria-label="Throughput">
            <Card className="space-y-4">
              <div className="space-y-0.5">
                {/* The heading names the single series, which is why there is no
                    legend box below. */}
                <h2 className="text-sm font-medium">Issues completed per week</h2>
                <p className="text-xs text-muted">
                  {completedInRange} completed over the last {weeks} weeks
                </p>
              </div>
              <ColumnChart data={throughputData} valueLabel="issue" />
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Issues by status</h2>
                <p className="text-xs text-muted">All issues, including completed</p>
              </div>
              <BarChart data={statusData} valueLabel="issue" />
            </Card>

            <Card className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Open issues by priority</h2>
                <p className="text-xs text-muted">
                  Closed issues excluded — their priority is history
                </p>
              </div>
              <BarChart data={priorityData} valueLabel="issue" />
            </Card>
          </div>

          <section aria-label="Workload">
            <Card className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Open issues by assignee</h2>
                <p className="text-xs text-muted">Who is carrying what</p>
              </div>
              <BarChart
                data={workload.map((row) => ({ label: row.name, value: row.count }))}
                valueLabel="issue"
                emptyMessage="No open issues to assign."
              />
            </Card>
          </section>

          <DataTable
            sections={[
              { title: "By status", rows: statusData.map((d) => ({ label: d.label, value: d.value })) },
              { title: "Open by priority", rows: priorityData.map((d) => ({ label: d.label, value: d.value })) },
              {
                title: `Completed per week (last ${weeks})`,
                rows: throughput.map((row) => ({
                  label: weekTick(row.weekStart),
                  value: row.completed,
                })),
              },
              { title: "Open by assignee", rows: workload.map((r) => ({ label: r.name, value: r.count })) },
            ]}
          />
        </>
      )}
    </div>
  );
}
