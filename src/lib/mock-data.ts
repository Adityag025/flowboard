/**
 * TEMPORARY. Delete this entire file in Stage 4 when Prisma lands.
 *
 * It lives in one place, and the types below are shaped like the rows we
 * expect from the database. When the real queries arrive, the page components
 * should need almost no edits -- only their data source changes.
 */
import type { BadgeVariant } from "@/components/ui/badge";

export type IssueStatus = "backlog" | "todo" | "in-progress" | "done";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export type Issue = {
  key: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
};

export const statusLabels: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};

export const priorityLabels: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

// Both unions are subsets of BadgeVariant. This assignment is never executed --
// it exists so TypeScript fails the build if the two ever drift apart.
const _statusIsBadgeVariant: BadgeVariant = "in-progress" satisfies IssueStatus;
void _statusIsBadgeVariant;

export const recentIssues: Issue[] = [
  { key: "FLOW-124", title: "Fix authentication redirect", status: "in-progress", priority: "high" },
  { key: "FLOW-125", title: "Update landing page copy", status: "todo", priority: "low" },
  { key: "FLOW-126", title: "API timeout on issue search", status: "todo", priority: "urgent" },
  { key: "FLOW-127", title: "Add dark mode toggle", status: "done", priority: "medium" },
  { key: "FLOW-128", title: "Kanban drag handles feel sluggish", status: "backlog", priority: "medium" },
];

export const stats = [
  { label: "Open Issues", value: 12 },
  { label: "In Progress", value: 4 },
  { label: "Completed This Week", value: 8 },
];

export const currentUser = { name: "Aditya", initials: "AG" };
