import type { Metadata } from "next";
import Link from "next/link";

import { IssueFilters } from "@/components/issues/issue-filters";
import { IssueRow } from "@/components/issues/issue-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { decodeCursor } from "@/lib/pagination";
import { ISSUES_PER_PAGE, getFormOptions, listIssues } from "@/lib/queries/issues";
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

  const cursorParam = single(params.cursor);
  const cursor = decodeCursor(cursorParam);
  const isPaged = cursor !== null;

  const [{ issues, total, nextCursor }, options] = await Promise.all([
    listIssues(user.id, filters, { cursor }),
    getFormOptions(user.id),
  ]);

  /**
   * Filters must survive paging, and the cursor must NOT survive a filter
   * change -- a cursor from the unfiltered list is meaningless once the filter
   * narrows the set. IssueFilters drops `cursor` when it sets any other param
   * for exactly this reason.
   */
  const nextHref = (() => {
    if (!nextCursor) return null;
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "cursor" || value === undefined) continue;
      next.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
    }
    next.set("cursor", nextCursor);
    return `/issues?${next.toString()}`;
  })();

  const firstPageHref = (() => {
    const first = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "cursor" || value === undefined) continue;
      first.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
    }
    const query = first.toString();
    return query ? `/issues?${query}` : "/issues";
  })();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "issue" : "issues"}
            {(nextCursor || isPaged) &&
              ` · showing ${issues.length} per page`}
          </p>
        </div>

        <Link href="/issues/new">
          <Button>New issue</Button>
        </Link>
      </header>

      <IssueFilters labels={options.labels} members={options.members} />

      {issues.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
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
        <>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
          </Card>

          {/*
            Plain links, not a "Load more" button.

            Appending rows client-side would force IssueRow to become a Client
            Component -- it is currently server-rendered and ships zero JS -- to
            gain infinite scroll on a list people filter rather than scroll.
            Links keep every row on the server, work without JavaScript, and
            each page is a real URL you can share.

            There is no "Previous": keyset pagination only walks forward. The
            browser Back button IS the previous page, because each page has its
            own URL.
          */}
          {(nextCursor || isPaged) && (
            <nav className="flex items-center justify-between gap-3 text-sm">
              {isPaged ? (
                <Link
                  href={firstPageHref}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  &larr; First page
                </Link>
              ) : (
                <span />
              )}

              {nextHref ? (
                <Link href={nextHref} className="text-accent hover:underline">
                  Next {ISSUES_PER_PAGE} &rarr;
                </Link>
              ) : (
                <span className="text-muted-foreground opacity-70">End of results</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
