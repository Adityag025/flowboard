"use client";

import { useTransition } from "react";

import { toggleLabelAction } from "@/lib/actions/issues";
import { cn } from "@/lib/utils";

export function LabelPicker({
  issueId,
  allLabels,
  activeLabelIds,
}: {
  issueId: string;
  allLabels: Array<{ id: string; name: string; color: string }>;
  activeLabelIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const active = new Set(activeLabelIds);

  return (
    <div className={cn("space-y-1.5 transition-opacity", isPending && "opacity-60")}>
      <p className="text-xs font-medium text-muted-foreground">Labels</p>
      <div className="flex flex-wrap gap-1.5">
        {allLabels.map((label) => {
          const isActive = active.has(label.id);
          return (
            <button
              key={label.id}
              type="button"
              disabled={isPending}
              aria-pressed={isActive}
              onClick={() =>
                startTransition(async () => {
                  await toggleLabelAction({ issueId, labelId: label.id });
                })
              }
              className={cn(
                "rounded border px-2 py-0.5 text-xs transition-colors",
                isActive
                  ? "border-transparent"
                  : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
              // Colours come from the database, so they must be inline styles --
              // Tailwind only generates classes it can see at build time.
              style={
                isActive
                  ? { backgroundColor: `${label.color}26`, color: label.color }
                  : undefined
              }
            >
              {label.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
