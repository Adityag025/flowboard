import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  issueKey,
  priorityLabels,
  priorityVariants,
  statusLabels,
  statusVariants,
} from "@/lib/issues";
import type { IssueListItem } from "@/lib/queries/issues";

/** Server Component -- pure presentation, zero client JS. */
export function IssueRow({ issue }: { issue: IssueListItem }) {
  const key = issueKey(issue.project.key, issue.number);

  return (
    <li className="transition-colors hover:bg-surface-hover">
      <Link
        href={`/issues/${key}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
      >
        <span className="font-mono text-xs text-muted">{key}</span>

        <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>

        <span className="hidden gap-1.5 md:flex">
          {issue.labels.map(({ label }) => (
            <Badge
              key={label.id}
              // Inline style, not a Tailwind class: the colour is user data from
              // the database, and Tailwind can only generate classes it sees at
              // build time. A dynamic `bg-[${color}]` would compile to nothing.
              style={{ backgroundColor: `${label.color}1a`, color: label.color }}
            >
              {label.name}
            </Badge>
          ))}
        </span>

        {issue.assignee ? (
          <span
            title={issue.assignee.name}
            className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent"
          >
            {issue.assignee.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")}
          </span>
        ) : (
          <span className="size-6 shrink-0 rounded-full border border-dashed border-border" title="Unassigned" />
        )}

        <Badge variant={priorityVariants[issue.priority]}>
          {priorityLabels[issue.priority]}
        </Badge>
        <Badge variant={statusVariants[issue.status]}>
          {statusLabels[issue.status]}
        </Badge>
      </Link>
    </li>
  );
}
