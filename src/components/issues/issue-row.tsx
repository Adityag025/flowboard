import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  issueKey,
  priorityGlyphs,
  priorityLabels,
  priorityVariants,
  statusGlyphs,
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

        {/*
          LABELS ARE PLAIN TEXT IN LISTS, not coloured chips.

          They carry user-chosen hex colours, and rendering those here put five
          competing hues in every row -- which drowned the one signal colour and
          made the list look exactly like the generic dashboard this design
          replaced. Labels are NAMES, not states: the text is the information.

          The colour is not discarded, just demoted -- the issue detail page shows
          it as a small marker, where there is room and nothing competing. Lists
          optimise for scanning; detail optimises for richness.
        */}
        <span className="hidden gap-2 md:flex">
          {issue.labels.map(({ label }) => (
            <Badge key={label.id}>{label.name}</Badge>
          ))}
        </span>

        {/*
          Initials as bordered text, not an amber-filled tile. Amber is the
          signal colour and is reserved for identity (issue keys) and state
          (active nav) -- an avatar on every row would spend it on nothing.

          Unassigned is an em-dash rather than an empty dashed box, which read as
          a broken image.
        */}
        <span
          className="w-8 shrink-0 text-center text-[10px] text-muted"
          title={issue.assignee?.name ?? "Unassigned"}
        >
          {issue.assignee
            ? issue.assignee.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")
            : "—"}
        </span>

        <Badge variant={priorityVariants[issue.priority]} glyph={priorityGlyphs[issue.priority]}>
          {priorityLabels[issue.priority]}
        </Badge>
        <Badge variant={statusVariants[issue.status]} glyph={statusGlyphs[issue.status]}>
          {statusLabels[issue.status]}
        </Badge>
      </Link>
    </li>
  );
}
