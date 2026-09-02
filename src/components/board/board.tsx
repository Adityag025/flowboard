"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useOptimistic, useState, useTransition } from "react";

import { IssueStatus } from "@/generated/prisma/enums";
import { moveIssueAction } from "@/lib/actions/board";
import type { BoardCard as BoardCardData } from "@/lib/board-types";
import { BOARD_COLUMNS, statusLabels } from "@/lib/issues";
import { cn } from "@/lib/utils";

import { BoardCard } from "./board-card";

const ORDER_GAP = 1000;

/**
 * Which droppable a card lands in.
 *
 * The obvious choice, closestCorners, is WRONG for a multi-column board, and
 * subtly so. It compares all four corners of the dragged element, and our drag
 * overlay is 288px wide -- so dropping with the cursor clearly inside "In
 * Progress" could still match "Done", because the overlay's right-hand corners
 * were nearer to Done's. The card visibly landed in a column the user never
 * pointed at.
 *
 * pointerWithin asks the only question that matches a user's intent: which
 * droppable is under the CURSOR. It returns nothing when the pointer is outside
 * every droppable -- and it cannot work at all for keyboard dragging, which has
 * no pointer -- so closestCenter backs it up. Center, not corners, because a
 * single point cannot be split across two columns.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCenter(args);
};

type Move = { issueId: string; toStatus: IssueStatus; newOrder: number };

export function Board({
  issues,
  projectKey,
}: {
  issues: BoardCardData[];
  projectKey: string;
}) {
  /**
   * THE CENTRAL IDEA OF THIS STAGE.
   *
   * `issues` is SERVER state. It arrives as a prop and is the truth.
   * `optimisticIssues` is UI state -- a temporary local guess about what the
   * server is about to agree to.
   *
   * Without this split, dropping a card would freeze until the round trip
   * finished, and a board would feel broken. With it, the card moves at
   * 60fps and the network catches up afterwards.
   *
   * The critical property: we never *write* to optimistic state permanently.
   * React discards it the moment the transition ends and re-derives from the
   * new props. So if the server rejects the move, the card returns to where it
   * was with no rollback code of our own -- and if the server accepts it,
   * revalidatePath sends fresh props that happen to match our guess.
   */
  const [optimisticIssues, applyMove] = useOptimistic(
    issues,
    (current: BoardCardData[], move: Move) =>
      current.map((issue) =>
        issue.id === move.issueId
          ? { ...issue, status: move.toStatus, boardOrder: move.newOrder }
          : issue,
      ),
  );

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small distance threshold, a plain click registers as a drag
      // and the "Open" link becomes impossible to hit.
      activationConstraint: { distance: 5 },
    }),
    // Keyboard dragging: Space to lift, arrows to move, Space to drop. This is
    // the main reason for taking on dnd-kit rather than HTML5 drag events,
    // which support neither keyboards nor touch.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = BOARD_COLUMNS.map((status: IssueStatus) => ({
    status,
    cards: optimisticIssues
      .filter((issue) => issue.status === status)
      .sort((a, b) => a.boardOrder - b.boardOrder || a.id.localeCompare(b.id)),
  }));

  const draggingCard = optimisticIssues.find((issue) => issue.id === draggingId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over) return;

    const activeId = String(active.id);
    const activeCard = optimisticIssues.find((issue) => issue.id === activeId);
    if (!activeCard) return;

    // `over` is either a column (dropped on empty space) or another card.
    const overData = over.data.current as { status?: IssueStatus } | undefined;
    const overId = String(over.id);
    const overCard = optimisticIssues.find((issue) => issue.id === overId);
    const toStatus = overCard?.status ?? overData?.status;
    if (!toStatus) return;

    // The target column WITHOUT the dragged card, so index maths is not thrown
    // off by the card's own former position.
    const target = optimisticIssues
      .filter((issue) => issue.status === toStatus && issue.id !== activeId)
      .sort((a, b) => a.boardOrder - b.boardOrder || a.id.localeCompare(b.id));

    const insertAt = overCard
      ? target.findIndex((issue) => issue.id === overCard.id)
      : target.length;
    const index = insertAt === -1 ? target.length : insertAt;

    const before = target[index - 1] ?? null;
    const after = target[index] ?? null;

    // A drop that changes nothing should not cost a request.
    if (activeCard.status === toStatus && before?.id === activeId) return;
    const unchanged =
      activeCard.status === toStatus &&
      target.findIndex((i) => i.boardOrder > activeCard.boardOrder) === index;
    if (unchanged && before && after) return;

    /**
     * The optimistic order is computed with the SAME formula the server uses,
     * so the guess matches what comes back and the card does not visibly
     * settle into a different slot.
     *
     * The server does not trust this number -- it recomputes from the
     * neighbours it re-reads inside a transaction. This value exists purely to
     * render the next frame.
     */
    const newOrder =
      before && after
        ? (before.boardOrder + after.boardOrder) / 2
        : before
          ? before.boardOrder + ORDER_GAP
          : after
            ? after.boardOrder / 2
            : ORDER_GAP;

    startTransition(async () => {
      applyMove({ issueId: activeId, toStatus, newOrder });

      const result = await moveIssueAction({
        issueId: activeId,
        toStatus,
        beforeIssueId: before?.id ?? null,
        afterIssueId: after?.id ?? null,
      });

      /**
       * Surfacing the failure, not swallowing it.
       *
       * useOptimistic reverts the card on its own when this transition ends, so
       * doing nothing here would still be "correct" -- the board would show the
       * truth. But the user would see their card slide back and reasonably
       * assume they mis-dropped it, never learning the server refused. A silent
       * revert is how people lose work without noticing.
       */
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          // --destructive, not Tailwind's red-500. This banner predates the
          // terminal palette and was the last place an off-palette hue
          // survived; --destructive is a value computed for these two exact
          // surfaces (6.57:1 light, 7.10:1 dark) rather than a generic red.
          //
          // Deliberately still a BANNER and not a toast: a toast auto-dismisses,
          // and this is the message explaining why the card the user just
          // dragged slid back. It has to stay on screen until they dismiss it.
          className="flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <DndContext
        /**
         * An EXPLICIT id, and it is not cosmetic.
         *
         * dnd-kit derives the aria-describedby it puts on every draggable from
         * an incrementing module-level counter. The server render and the
         * client hydration each start that counter independently, so they
         * disagree -- "DndDescribedBy-0" versus "DndDescribedBy-1" -- and React
         * reports a hydration mismatch it explicitly "won't patch up".
         *
         * Passing a stable id makes the generated ids deterministic across
         * both renders.
         */
        id="flowboard-kanban"
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
        // Announcements are read by screen readers during a keyboard drag.
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up card ${active.id}`,
            onDragOver: () => undefined,
            onDragEnd: ({ over }) =>
              over ? `Dropped on ${over.id}` : "Dropped, no change",
            onDragCancel: () => "Move cancelled",
          },
        }}
      >
        <div
          className={cn(
            "flex gap-4 overflow-x-auto pb-4 transition-opacity",
            // Dim while saving, so a slow network is visible rather than silent.
            isPending && "opacity-80",
          )}
        >
          {columns.map((column) => (
            <Column
              key={column.status}
              status={column.status}
              cards={column.cards}
              projectKey={projectKey}
            />
          ))}
        </div>

        {/*
          DragOverlay renders the floating card in a portal, outside the
          columns' overflow containers. Without it the dragged card is clipped
          the moment it leaves its own column -- which is every cross-column
          drag, i.e. the entire point of a Kanban board.
        */}
        <DragOverlay>
          {draggingCard && (
            <ul className="w-72 list-none">
              <BoardCard card={draggingCard} projectKey={projectKey} isDragOverlay />
            </ul>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  cards,
  projectKey,
}: {
  status: IssueStatus;
  cards: BoardCardData[];
  projectKey: string;
}) {
  // The column itself is a drop target, so a card can be dropped into empty
  // space below the last card -- and into a column with no cards at all.
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status, type: "column" },
  });

  return (
    <section className="flex w-72 shrink-0 flex-col">
      <header className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {statusLabels[status]}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-accent bg-accent-subtle/40" : "border-border",
        )}
      >
        <SortableContext items={cards.map((card) => card.id)}>
          <ul className="flex min-h-24 flex-col gap-2">
            {cards.map((card) => (
              <BoardCard key={card.id} card={card} projectKey={projectKey} />
            ))}
          </ul>
        </SortableContext>
      </div>
    </section>
  );
}
