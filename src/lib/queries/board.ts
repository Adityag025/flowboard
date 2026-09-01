import type { Prisma } from "@/generated/prisma/client";
import type { BoardCard } from "@/lib/board-types";
import { db } from "@/lib/db";

const boardCardSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  boardOrder: true,
  assignee: { select: { id: true, name: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.IssueSelect;

/**
 * Fetch a project and all its issues, scoped by membership.
 *
 * ONE query for every card, not one per column. Grouping happens in memory
 * afterwards -- five `findMany` calls would be five round trips for data the
 * database can hand over in a single ordered scan, and the composite index
 * (projectId, status, boardOrder) makes that scan cheap.
 */
export async function getBoard(userId: string, projectKey: string) {
  const project = await db.project.findFirst({
    where: {
      key: projectKey,
      archivedAt: null,
      workspace: { members: { some: { userId } } },
    },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      workspaceId: true,
      workspace: { select: { name: true } },
    },
  });

  if (!project) return null;

  // Annotated with the hand-written BoardCard type: if the select above and
  // that type ever drift apart, this line fails to compile.
  const issues: BoardCard[] = await db.issue.findMany({
    where: { projectId: project.id },
    select: boardCardSelect,
    // id as a tiebreaker so two cards with identical boardOrder still have a
    // stable, repeatable order rather than shuffling between renders.
    orderBy: [{ boardOrder: "asc" }, { id: "asc" }],
  });

  return { project, issues };
}
