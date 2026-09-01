"use server";

import { revalidatePath } from "next/cache";

import { ActivityType, IssueStatus } from "@/generated/prisma/enums";
import { AuthorizationError, requireIssueAccess, requireUserId } from "@/lib/authz";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { publishBoardChange } from "@/lib/realtime";
import { moveIssueSchema } from "@/lib/validations/board";

/**
 * Standard gap between cards. Also the step used when renormalising a column.
 */
const ORDER_GAP = 1000;

/**
 * The smallest gap we will tolerate between two neighbours before rebuilding
 * the column.
 *
 * WHY THIS EXISTS -- the failure mode of fractional indexing:
 *
 * Dropping between two cards sets boardOrder to the midpoint of its
 * neighbours. Do that repeatedly between the SAME pair and the gap halves each
 * time: 1000, 500, 250, ... After roughly 50 such drops the gap is smaller than
 * a float64 can represent, the "midpoint" equals one of its neighbours, and the
 * ordering silently becomes ambiguous. Cards start jumping around.
 *
 * Most tutorials stop at "just use a float" and never mention this. The fix is
 * cheap: when the gap gets small, renumber the whole column back to clean
 * multiples. That is O(column length) but happens rarely, versus O(n) on EVERY
 * drag if we used integers.
 */
const MIN_GAP = 0.0005;

export type MoveResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move an issue to a position in a column.
 *
 * The client sends its intended NEIGHBOURS, not a computed boardOrder. That
 * matters: the client's view may be stale, and letting it dictate an absolute
 * position would let two concurrent drags write the same value. The server reads
 * the neighbours' current orders and derives the new one from live data.
 */
export async function moveIssueAction(input: {
  issueId: string;
  toStatus: IssueStatus;
  beforeIssueId?: string | null;
  afterIssueId?: string | null;
}): Promise<MoveResult> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const parsed = moveIssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That move was not valid." };
  }
  const { issueId, toStatus, beforeIssueId, afterIssueId } = parsed.data;

  try {
    // Re-derive access from the session. The payload's issueId is untrusted.
    const issue = await requireIssueAccess(issueId, userId);
    const projectId = issue.project.id;

    await db.$transaction(async (tx) => {
      /**
       * Neighbours are re-read INSIDE the transaction and constrained to the
       * same project and target column. A client could otherwise name an issue
       * from another column -- or another project it can see -- as a neighbour
       * and produce an order that means nothing.
       */
      const neighbourIds = [beforeIssueId, afterIssueId].filter(
        (id): id is string => Boolean(id),
      );

      const neighbours = neighbourIds.length
        ? await tx.issue.findMany({
            where: { id: { in: neighbourIds }, projectId, status: toStatus },
            select: { id: true, boardOrder: true },
          })
        : [];

      const orderOf = (id: string | null | undefined) =>
        id ? neighbours.find((n) => n.id === id)?.boardOrder : undefined;

      const beforeOrder = orderOf(beforeIssueId);
      const afterOrder = orderOf(afterIssueId);

      let newOrder: number;

      if (beforeOrder !== undefined && afterOrder !== undefined) {
        newOrder = (beforeOrder + afterOrder) / 2;
      } else if (beforeOrder !== undefined) {
        // Dropped at the bottom of the column.
        newOrder = beforeOrder + ORDER_GAP;
      } else if (afterOrder !== undefined) {
        // Dropped at the top. Halving keeps it above without going negative.
        newOrder = afterOrder / 2;
      } else {
        // Empty column, or neighbours we could not verify -- append.
        const last = await tx.issue.findFirst({
          where: { projectId, status: toStatus, id: { not: issueId } },
          orderBy: { boardOrder: "desc" },
          select: { boardOrder: true },
        });
        newOrder = (last?.boardOrder ?? 0) + ORDER_GAP;
      }

      await tx.issue.update({
        where: { id: issueId },
        data: {
          status: toStatus,
          boardOrder: newOrder,
          // Derived server-side, never sent by the client, and cleared when an
          // issue leaves DONE so "completed this week" stays honest.
          ...(toStatus !== issue.status
            ? { completedAt: toStatus === IssueStatus.DONE ? new Date() : null }
            : {}),
        },
      });

      if (toStatus !== issue.status) {
        await tx.activity.create({
          data: {
            type: ActivityType.ISSUE_STATUS_CHANGED,
            workspaceId: issue.project.workspaceId,
            actorId: userId,
            issueId,
            metadata: { from: issue.status, to: toStatus, via: "board" },
          },
        });
      }

      // Rebuild the column if precision is running out. See MIN_GAP above.
      const gapTooSmall =
        beforeOrder !== undefined &&
        afterOrder !== undefined &&
        Math.abs(afterOrder - beforeOrder) < MIN_GAP;

      if (gapTooSmall) {
        const column = await tx.issue.findMany({
          where: { projectId, status: toStatus },
          orderBy: [{ boardOrder: "asc" }, { id: "asc" }],
          select: { id: true },
        });

        // Sequential rather than Promise.all: these share one transaction, and
        // firing them concurrently on a single connection is what triggers
        // node-postgres's "already executing a query" warning.
        for (const [index, row] of column.entries()) {
          await tx.issue.update({
            where: { id: row.id },
            data: { boardOrder: (index + 1) * ORDER_GAP },
          });
        }
      }
    });

    revalidatePath(`/projects/${issue.project.key}`);
    revalidatePath("/issues");
    revalidatePath("/dashboard");

    /**
     * Announce AFTER the transaction commits, and deliberately not awaited into
     * the critical path -- publishBoardChange never throws. Publishing before
     * the commit would tell other viewers to refetch state that does not exist
     * yet, and they would read the old board and cache it as current.
     */
    void publishBoardChange({ projectId, actorId: userId });

    return { ok: true };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // Deliberately vague: the caller may not know this issue exists.
      return { ok: false, error: "You can no longer edit that issue." };
    }
    // Unexpected failures surface to the user AND stay in the server logs, with
    // enough context to find the row rather than just the stack.
    logger.error("moveIssueAction failed", error, {
      action: "moveIssueAction",
      issueId,
      toStatus,
    });
    return { ok: false, error: "Could not save that move. Please try again." };
  }
}
