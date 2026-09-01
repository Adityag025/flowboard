"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { priorityLabels, statusLabels } from "@/lib/issues";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/**
 * Filters live in the URL, not in React state.
 *
 * That is the whole design decision here, and it buys a lot: the filtered view
 * is shareable and bookmarkable, the back button works, and a refresh keeps
 * your filters. It also means the SERVER does the filtering -- the page re-runs
 * its query with new searchParams rather than shipping every issue to the
 * browser and hiding some with JavaScript.
 *
 * useTransition keeps the old list on screen (dimmed) while the new one loads,
 * instead of flashing empty.
 */
export function IssueFilters({
  labels,
  members,
}: {
  labels: Option[];
  members: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    // Copy, because searchParams is read-only.
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      // Drop the key entirely rather than leaving ?status= in the URL.
      params.delete(key);
    }
    /**
     * Any filter change resets pagination.
     *
     * A cursor points at a specific row in a specific ordered set. Change the
     * filter and that set changes, so the old cursor either skips rows that
     * should now be first or lands past the end and shows an empty page. Both
     * look like data loss to the user.
     */
    params.delete("cursor");
    startTransition(() => {
      router.push(`/issues?${params.toString()}`);
    });
  }

  const projectKey = searchParams.get("projectKey");
  const activeCount = [
    "status",
    "priority",
    "assigneeId",
    "labelId",
    "projectKey",
    "q",
  ].filter((key) => searchParams.get(key)).length;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <input
        type="search"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder="Search title or description..."
        // Search on Enter rather than every keystroke: each change is a server
        // round trip, and debouncing would still fire queries nobody reads.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setParam("q", event.currentTarget.value.trim());
          }
        }}
        className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent sm:w-64"
      />

      <Select
        className="w-auto"
        value={searchParams.get("status") ?? ""}
        onChange={(event) => setParam("status", event.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {Object.values(IssueStatus).map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        value={searchParams.get("priority") ?? ""}
        onChange={(event) => setParam("priority", event.target.value)}
        aria-label="Filter by priority"
      >
        <option value="">All priorities</option>
        {Object.values(IssuePriority).map((priority) => (
          <option key={priority} value={priority}>
            {priorityLabels[priority]}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        value={searchParams.get("assigneeId") ?? ""}
        onChange={(event) => setParam("assigneeId", event.target.value)}
        aria-label="Filter by assignee"
      >
        <option value="">Anyone</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        value={searchParams.get("labelId") ?? ""}
        onChange={(event) => setParam("labelId", event.target.value)}
        aria-label="Filter by label"
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </Select>

      {projectKey && (
        <button
          type="button"
          onClick={() => setParam("projectKey", "")}
          className="h-9 rounded-md border border-accent bg-accent-subtle px-3 font-mono text-xs text-accent"
          title="Remove project filter"
        >
          {projectKey} &times;
        </button>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => startTransition(() => router.push("/issues"))}
          className="h-9 rounded-md px-3 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}
