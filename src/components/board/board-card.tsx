"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";

import { IssuePriority } from "@/generated/prisma/enums";
import {
  issueKey,
  priorityGlyphs,
  priorityLabels,
  priorityVariants,
} from "@/lib/issues";
import { Badge } from "@/components/ui/badge";
import type { BoardCard as BoardCardData } from "@/lib/board-types";
import { cn } from "@/lib/utils";

/**
 * The priority DOT that used to live here was the last survivor of the
 * pre-redesign palette -- five saturated hues (slate / sky / orange / red) on a
 * card, in an interface whose whole premise is one signal colour. It also put
 * meaning in colour alone: a colourblind reader could not tell HIGH from URGENT,
 * and neither could anyone printing the board.
 *
 * It now renders the same glyph + tone pair the issue list uses, so a priority
 * looks identical wherever it appears, and the glyph carries the meaning while
 * colour merely reinforces it.
 */
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
          {card.priority === IssuePriority.NONE ? (
            // A spacer, not nothing: NONE has no glyph, and dropping the slot
            // would shift the issue key left on those cards only, so a column
            // of keys would no longer line up.
            <span className="w-2 shrink-0" aria-hidden="true" />
          ) : (
            <Badge
              variant={priorityVariants[card.priority]}
              glyph={priorityGlyphs[card.priority]}
              title={priorityLabels[card.priority]}
              className="shrink-0"
            >
              {/*
                The label is present for screen readers but not drawn: the card
                is 288px wide and the glyph already says it at a glance. An
                `aria-label` on the old bare <span> was not a reliable
                substitute -- with no role, it is not guaranteed to be announced.
              */}
              <span className="sr-only">
                {priorityLabels[card.priority]} priority
              </span>
            </Badge>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
        </div>

        <p className="text-sm leading-snug">{card.title}</p>

        {card.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.labels.map(({ label }) => (
              <span
                key={label.id}
                className="text-[10px] uppercase tracking-wider text-muted-foreground"
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
          className="text-[11px] text-muted-foreground transition-colors hover:text-accent"
        >
          Open
        </Link>
        {card.assignee && (
          <span
            title={card.assignee.name}
            className="text-[9px] text-muted-foreground"
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
