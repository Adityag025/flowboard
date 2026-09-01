import { ActivityType } from "@/generated/prisma/enums";

import { priorityLabels, statusLabels } from "./issues";

type ActivityLike = {
  type: ActivityType;
  metadata: unknown;
  actor: { name: string } | null;
};

/**
 * Renders an activity row as a sentence.
 *
 * `metadata` is Json, so Postgres cannot guarantee its shape -- this function
 * is where that risk is contained. Every read is defensive, and an unrecognised
 * shape degrades to a vaguer sentence rather than throwing. That is exactly why
 * the schema comment says metadata holds DISPLAY data only: nothing here
 * affects how the app behaves.
 */
export function describeActivity(activity: ActivityLike): string {
  const actor = activity.actor?.name ?? "Someone";
  const meta =
    activity.metadata && typeof activity.metadata === "object"
      ? (activity.metadata as Record<string, unknown>)
      : {};

  const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

  switch (activity.type) {
    case ActivityType.ISSUE_CREATED:
      return `${actor} created this issue`;

    case ActivityType.ISSUE_STATUS_CHANGED: {
      const from = asString(meta.from);
      const to = asString(meta.to);
      if (from && to && from in statusLabels && to in statusLabels) {
        return `${actor} changed status from ${statusLabels[from as keyof typeof statusLabels]} to ${statusLabels[to as keyof typeof statusLabels]}`;
      }
      return `${actor} changed the status`;
    }

    case ActivityType.ISSUE_PRIORITY_CHANGED: {
      const to = asString(meta.to);
      if (to && to in priorityLabels) {
        return `${actor} set priority to ${priorityLabels[to as keyof typeof priorityLabels]}`;
      }
      return `${actor} changed the priority`;
    }

    case ActivityType.ISSUE_ASSIGNED:
      return meta.assigneeId ? `${actor} changed the assignee` : `${actor} unassigned this issue`;

    case ActivityType.ISSUE_LABELED: {
      const label = asString(meta.label);
      return label ? `${actor} added the "${label}" label` : `${actor} changed labels`;
    }

    case ActivityType.COMMENT_ADDED:
      return `${actor} commented`;

    default:
      return `${actor} updated this issue`;
  }
}

/** "3 hours ago" without pulling in a date library for one function. */
export function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secondsPerUnit] of units) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return formatter.format(-Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return "just now";
}
