"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";

import { IssuePriority } from "@/generated/prisma/enums";
import { issueKey, priorityLabels } from "@/lib/issues";
import type { BoardCard as BoardCardData } from "@/lib/board-types";
import { cn } from "@/lib/utils";

const priorityDot: Record<IssuePriority, string> = {
  [IssuePriority.NONE]: "bg-transparent border border-border",
  [IssuePriority.LOW]: "bg-slate-500",
  [IssuePriority.MEDIUM]: "bg-sky-500",
  [IssuePriority.HIGH]: "bg-orange-500",
  [IssuePriority.URGENT]: "bg-red-500",
};

export function BoardCard({
  card,
  projectKey,
  isDragOverlay = false,
}: {
  card: BoardCardData;
  projectKey: string;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { status: card.status } });

  const key = issueKey(projectKey, card.number);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-md border border-border bg-surface p-3",
        // The original stays mounted but invisible while dragging so the column
        // keeps its height and the layout does not jump.
        isDragging && "opacity-0",
        isDragOverlay && "rotate-2 shadow-xl",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        // Grab handle covers the card body. Note this element is a button-like
        // drag target, so the LINK below must sit outside the listeners or a
        // click would start a drag instead of navigating.
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn("size-2 shrink-0 rounded-full", priorityDot[card.priority])}
            title={priorityLabels[card.priority]}
            aria-label={priorityLabels[card.priority]}
          />
          <span className="font-mono text-[11px] text-muted">{key}</span>
        </div>

        <p className="text-sm leading-snug">{card.title}</p>

        {card.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.labels.map(({ label }) => (
              <span
                key={label.id}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${label.color}1a`, color: label.color }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Link
          href={`/issues/${key}`}
          className="text-[11px] text-muted transition-colors hover:text-accent"
        >
          Open
        </Link>
        {card.assignee && (
          <span
            title={card.assignee.name}
            className="grid size-5 place-items-center rounded-full bg-accent-subtle text-[9px] font-semibold text-accent"
          >
            {card.assignee.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")}
          </span>
        )}
      </div>
    </li>
  );
}
