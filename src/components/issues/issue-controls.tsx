"use client";

import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { updateIssueAction } from "@/lib/actions/issues";
import { priorityLabels, statusLabels } from "@/lib/issues";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/**
 * Inline editing for status, priority and assignee.
 *
 * Server Actions are called DIRECTLY here -- no fetch, no /api route, no
 * hand-written request body. `updateIssueAction` is imported like any function
 * and React handles the network call.
 *
 * This is why Server Actions were the right choice over Route Handlers: the
 * exact same function is used by the form on the create page and by this
 * client-side <select>, with one validation and authorization path for both.
 *
 * The action calls revalidatePath, so the server re-renders and the new value
 * arrives without us touching local state. useTransition gives us `isPending`
 * to dim the control meanwhile. Stage 6 layers useOptimistic on top of exactly
 * this pattern for drag and drop.
 */
export function IssueControls({
  issueId,
  status,
  priority,
  assigneeId,
  members,
}: {
  issueId: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  members: Option[];
}) {
  const [isPending, startTransition] = useTransition();

  function update(changes: Parameters<typeof updateIssueAction>[0]) {
    startTransition(async () => {
      const result = await updateIssueAction(changes);
      if (!result.ok) {
        // A rejected mutation means the server disagreed with us. Reloading is
        // the honest response: it shows the real state rather than leaving the
        // UI displaying a change that never happened.
        // console, not our logger: this runs in the BROWSER, and lib/logger
        // writes to process.stdout. Devtools reads console anyway.
        console.error("Update rejected:", result.error);
        window.location.reload();
      }
    });
  }

  return (
    <div className={cn("space-y-4 transition-opacity", isPending && "opacity-60")}>
      <div className="space-y-1.5">
        <label htmlFor="control-status" className="block text-xs font-medium text-muted-foreground">
          Status
        </label>
        <Select
          id="control-status"
          value={status}
          disabled={isPending}
          onChange={(event) =>
            update({ issueId, status: event.target.value as IssueStatus })
          }
        >
          {Object.values(IssueStatus).map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="control-priority" className="block text-xs font-medium text-muted-foreground">
          Priority
        </label>
        <Select
          id="control-priority"
          value={priority}
          disabled={isPending}
          onChange={(event) => update({ issueId, priority: event.target.value })}
        >
          {Object.values(IssuePriority).map((value) => (
            <option key={value} value={value}>
              {priorityLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="control-assignee" className="block text-xs font-medium text-muted-foreground">
          Assignee
        </label>
        <Select
          id="control-assignee"
          value={assigneeId ?? ""}
          disabled={isPending}
          onChange={(event) =>
            // "" means unassigned, which must become null rather than an empty
            // string the database would reject as a foreign key.
            update({ issueId, assigneeId: event.target.value || null })
          }
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
