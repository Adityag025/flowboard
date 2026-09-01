import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueSummary } from "@/components/ai/issue-summary";
import { CommentForm } from "@/components/issues/comment-form";
import { IssueControls } from "@/components/issues/issue-controls";
import { LabelPicker } from "@/components/issues/label-picker";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { describeActivity, relativeTime } from "@/lib/activity";
import { isAIConfigured } from "@/lib/ai/provider";
import { requireUser } from "@/lib/authz";
import {
  issueKey,
  priorityLabels,
  priorityVariants,
  statusLabels,
  statusVariants,
} from "@/lib/issues";
import { getFormOptions, getIssueByKey } from "@/lib/queries/issues";
import { parseIssueKey } from "@/lib/validations/issues";

type Params = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params;
  const parsed = parseIssueKey(key);
  if (!parsed) return { title: "Issue" };

  const user = await requireUser();
  const issue = await getIssueByKey(user.id, parsed.projectKey, parsed.number);

  // The title itself must not leak an issue the user cannot see -- getIssueByKey
  // already scopes by membership, so a miss becomes a generic title.
  return {
    title: issue
      ? `${issueKey(issue.project.key, issue.number)} · ${issue.title}`
      : "Issue",
  };
}

export default async function IssueDetailPage({ params }: Params) {
  const { key } = await params;
  const parsed = parseIssueKey(key);
  if (!parsed) notFound();

  const user = await requireUser();
  const issue = await getIssueByKey(user.id, parsed.projectKey, parsed.number);

  /**
   * notFound() covers BOTH "no such issue" and "exists but not yours", because
   * getIssueByKey filters on membership. Returning 403 for the second case
   * would confirm that FLOW-999 exists in someone else's workspace.
   */
  if (!issue) notFound();

  const options = await getFormOptions(user.id);
  const displayKey = issueKey(issue.project.key, issue.number);
  const activeLabelIds = issue.labels.map(({ label }) => label.id);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted">
        <Link href="/issues" className="transition-colors hover:text-foreground">
          Issues
        </Link>
        <span>/</span>
        <span className="font-mono text-xs">{displayKey}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <header className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">{issue.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariants[issue.status]}>
                {statusLabels[issue.status]}
              </Badge>
              <Badge variant={priorityVariants[issue.priority]}>
                {priorityLabels[issue.priority]}
              </Badge>
              {issue.labels.map(({ label }) => (
                <Badge
                  key={label.id}
                  style={{ backgroundColor: `${label.color}1a`, color: label.color }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted">
              Opened {relativeTime(issue.createdAt)}
              {issue.creator ? ` by ${issue.creator.name}` : ""} in{" "}
              {issue.project.name}
            </p>
          </header>

          <Card>
            {issue.description ? (
              // whitespace-pre-wrap preserves the author's line breaks. The text
              // is rendered as TEXT, never as HTML -- React escapes it, so a
              // description containing <script> is displayed, not executed.
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {issue.description}
              </p>
            ) : (
              <p className="text-sm text-muted">No description provided.</p>
            )}
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted">
              Comments ({issue.comments.length})
            </h2>

            {issue.comments.length > 0 && (
              <ul className="space-y-3">
                {issue.comments.map((comment) => (
                  <li key={comment.id}>
                    <Card>
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <span className="font-medium">
                          {comment.author?.name ?? "Deleted user"}
                        </span>
                        <span className="text-muted">
                          {relativeTime(comment.createdAt)}
                          {comment.editedAt ? " (edited)" : ""}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {comment.body}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            <Card>
              <CommentForm issueId={issue.id} />
            </Card>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <IssueSummary
            issueId={issue.id}
            cachedSummary={issue.aiSummary}
            aiConfigured={isAIConfigured()}
          />

          <Card className="space-y-4">
            <IssueControls
              issueId={issue.id}
              status={issue.status}
              priority={issue.priority}
              assigneeId={issue.assignee?.id ?? null}
              members={options.members}
            />
            {options.labels.length > 0 && (
              <div className="border-t border-border pt-4">
                <LabelPicker
                  issueId={issue.id}
                  allLabels={options.labels}
                  activeLabelIds={activeLabelIds}
                />
              </div>
            )}
          </Card>

          <div className="space-y-2">
            <h2 className="text-xs font-medium text-muted">Activity</h2>
            <ul className="space-y-2">
              {issue.activities.map((activity) => (
                <li key={activity.id} className="text-xs text-muted">
                  {describeActivity(activity)}{" "}
                  <span className="opacity-70">
                    · {relativeTime(activity.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
