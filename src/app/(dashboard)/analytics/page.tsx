import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { BarChart } from "@/components/analytics/bar-chart";
import { ColumnChart } from "@/components/analytics/column-chart";
import { DataTable } from "@/components/analytics/data-table";
import { ORDINAL_VARS, VIZ_CSS } from "@/components/analytics/viz-tokens";
import { Card, Section } from "@/components/ui/card";
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
          <p className="text-sm text-muted-foreground">
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
        <h1 className="text-lg font-medium tracking-tight">Analytics</h1>
        <p className="text-xs text-muted-foreground">
          <span className="text-accent">&gt;</span> {totalIssues}{" "}
          {totalIssues === 1 ? "issue" : "issues"}
          {projectKey ? ` in ${projectKey}` : " across all projects"}
        </p>
      </header>

      <AnalyticsFilters projects={projects} />

      {totalIssues === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
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
          {/* One strip divided by rules -- identical device to the dashboard, so
              the two pages read as the same product rather than two designs. */}
          <section
            aria-label="Summary"
            className="grid grid-cols-1 border border-border sm:grid-cols-2 lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-b border-border px-4 py-3 last:border-b-0 sm:[&:nth-child(-n+2)]:border-b lg:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&]:border-r lg:last:border-r-0"
              >
                <p className="text-2xl font-medium tabular-nums">{stat.value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                {stat.hint && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground opacity-60">{stat.hint}</p>
                )}
              </div>
            ))}
          </section>

          {/* The rule label names the single series, which is why no legend
              box appears below it. */}
          <Section
            label="completed per week"
            meta={`${completedInRange} over ${weeks} weeks`}
          >
            <div className="border border-border p-4">
              <ColumnChart data={throughputData} valueLabel="issue" />
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section label="by status" meta="all issues">
              <div className="border border-border p-4">
                <BarChart data={statusData} valueLabel="issue" />
              </div>
            </Section>

            <Section label="open by priority" meta="closed excluded">
              <div className="border border-border p-4">
                <BarChart data={priorityData} valueLabel="issue" />
              </div>
            </Section>
          </div>

          <Section label="open by assignee" meta="who is carrying what">
            <div className="border border-border p-4">
              <BarChart
                data={workload.map((row) => ({ label: row.name, value: row.count }))}
                valueLabel="issue"
                emptyMessage="No open issues to assign."
              />
            </div>
          </Section>

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
