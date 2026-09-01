import type { Metadata } from "next";
import Link from "next/link";

import { IssueFilters } from "@/components/issues/issue-filters";
import { IssueRow } from "@/components/issues/issue-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { getFormOptions, listIssues } from "@/lib/queries/issues";
import {
  issuePrioritySchema,
  issueStatusSchema,
} from "@/lib/validations/issues";

export const metadata: Metadata = {
  title: "Issues",
};

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  /**
   * The query string is user input. `?status=DROP TABLE` must not reach the
   * query, so each enum is parsed and silently dropped if invalid rather than
   * crashing the page on a hand-edited URL.
   */
  const statusParam = issueStatusSchema.safeParse(single(params.status));
  const priorityParam = issuePrioritySchema.safeParse(single(params.priority));

  const filters = {
    status: statusParam.success ? statusParam.data : undefined,
    priority: priorityParam.success ? priorityParam.data : undefined,
    assigneeId: single(params.assigneeId) || undefined,
    labelId: single(params.labelId) || undefined,
    projectKey: single(params.projectKey)?.toUpperCase() || undefined,
    q: single(params.q)?.trim() || undefined,
  };

  const [{ issues, total }, options] = await Promise.all([
    listIssues(user.id, filters),
    getFormOptions(user.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="text-sm text-muted">
            {total} {total === 1 ? "issue" : "issues"}
            {issues.length < total && ` (showing ${issues.length})`}
          </p>
        </div>

        <Link href="/issues/new">
          <Button>New issue</Button>
        </Link>
      </header>

      <IssueFilters labels={options.labels} members={options.members} />

      {issues.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No issues match these filters.{" "}
            <Link href="/issues" className="text-accent hover:underline">
              Clear them
            </Link>{" "}
            or{" "}
            <Link href="/issues/new" className="text-accent hover:underline">
              create an issue
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
