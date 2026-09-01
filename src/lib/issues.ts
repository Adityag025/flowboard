import type { BadgeVariant } from "@/components/ui/badge";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

/**
 * The translation layer between database enums and what a human reads.
 *
 * Why this file exists at all: the database stores IN_PROGRESS because SCREAMING
 * _SNAKE is the Postgres enum convention, but no user should ever see that. The
 * mapping lives in ONE place so a rename is a single edit, rather than a
 * find-and-replace across every component that happens to render a status.
 *
 * `satisfies Record<IssueStatus, ...>` is the load-bearing part. Add a value to
 * the enum in schema.prisma and forget to add it here, and the BUILD fails
 * rather than the UI silently rendering an empty badge in production.
 */

export const statusLabels = {
  [IssueStatus.BACKLOG]: "Backlog",
  [IssueStatus.TODO]: "Todo",
  [IssueStatus.IN_PROGRESS]: "In Progress",
  [IssueStatus.DONE]: "Done",
  [IssueStatus.CANCELED]: "Canceled",
} satisfies Record<IssueStatus, string>;

/**
 * Status GLYPHS, which carry the state so colour never has to.
 *
 * Read as a progression: ○ not started -> ◐ underway -> ● complete, with ✕ for
 * abandoned. A screen reader gets the label text; the glyph is aria-hidden.
 */
export const statusGlyphs = {
  [IssueStatus.BACKLOG]: "·",
  [IssueStatus.TODO]: "○",
  [IssueStatus.IN_PROGRESS]: "◐",
  [IssueStatus.DONE]: "●",
  [IssueStatus.CANCELED]: "✕",
} satisfies Record<IssueStatus, string>;

/** Priority glyphs: escalating marks, with urgency pointing up. */
export const priorityGlyphs = {
  [IssuePriority.NONE]: "",
  [IssuePriority.LOW]: "▁",
  [IssuePriority.MEDIUM]: "▄",
  [IssuePriority.HIGH]: "█",
  [IssuePriority.URGENT]: "▲",
} satisfies Record<IssuePriority, string>;

export const statusVariants = {
  [IssueStatus.BACKLOG]: "neutral",
  [IssueStatus.TODO]: "slate",
  [IssueStatus.IN_PROGRESS]: "amber",
  [IssueStatus.DONE]: "emerald",
  [IssueStatus.CANCELED]: "neutral",
} satisfies Record<IssueStatus, BadgeVariant>;

export const priorityLabels = {
  [IssuePriority.NONE]: "No priority",
  [IssuePriority.LOW]: "Low",
  [IssuePriority.MEDIUM]: "Medium",
  [IssuePriority.HIGH]: "High",
  [IssuePriority.URGENT]: "Urgent",
} satisfies Record<IssuePriority, string>;

export const priorityVariants = {
  [IssuePriority.NONE]: "neutral",
  [IssuePriority.LOW]: "slate",
  [IssuePriority.MEDIUM]: "sky",
  [IssuePriority.HIGH]: "orange",
  [IssuePriority.URGENT]: "red",
} satisfies Record<IssuePriority, BadgeVariant>;

/** "FLOW" + 124 -> "FLOW-124" */
export function issueKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/**
 * Statuses that count as "open". Used by dashboard counts and default filters.
 * Named once so the definition of open cannot drift between two queries.
 */
export const OPEN_STATUSES = [
  IssueStatus.BACKLOG,
  IssueStatus.TODO,
  IssueStatus.IN_PROGRESS,
] as const;

/**
 * Column order on the Kanban board, left to right.
 *
 * Lives here rather than beside the board query, because Client Components
 * import it. See lib/board-types.ts for why that distinction matters.
 */
export const BOARD_COLUMNS = [
  IssueStatus.BACKLOG,
  IssueStatus.TODO,
  IssueStatus.IN_PROGRESS,
  IssueStatus.DONE,
  IssueStatus.CANCELED,
] as const;
