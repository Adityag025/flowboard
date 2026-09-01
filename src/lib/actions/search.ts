"use server";

import { requireUserId } from "@/lib/authz";
import { db } from "@/lib/db";
import { workspaceIdsFor } from "@/lib/queries/workspaces";

export type SearchHit = {
  id: string;
  key: string;
  title: string;
  status: string;
  projectName: string;
};

/** Hard cap on results. A dropdown that scrolls is a list, not a quick search. */
const LIMIT = 8;
/** Below this, matching is noise -- "a" matches everything. */
const MIN_QUERY = 2;
const MAX_QUERY = 100;

/**
 * Quick search over issues the caller can see.
 *
 * A Server Action rather than a route handler: the caller needs the whole result
 * set before it can render a list, there is nothing to stream, and this way the
 * result is typed end to end.
 *
 * Scoped through workspace membership like every other read. Worth stating
 * plainly because search is the single easiest place to leak a whole database:
 * an unscoped LIKE over issues would happily return every tenant's titles.
 */
export async function searchIssuesAction(rawQuery: string): Promise<SearchHit[]> {
  const userId = await requireUserId();

  const query = rawQuery.trim().slice(0, MAX_QUERY);
  if (query.length < MIN_QUERY) return [];

  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) return [];

  /**
   * An exact issue key ("FLOW-124", or just "124") should win outright rather
   * than being ranked among title matches -- when someone types a key they want
   * that issue, not everything mentioning the number.
   */
  const keyMatch = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(query);
  const bareNumber = /^\d+$/.test(query) ? Number(query) : null;

  const issues = await db.issue.findMany({
    where: {
      project: { workspaceId: { in: workspaceIds }, archivedAt: null },
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        ...(keyMatch
          ? [
              {
                number: Number(keyMatch[2]),
                project: { key: keyMatch[1]!.toUpperCase() },
              },
            ]
          : []),
        ...(bareNumber !== null && Number.isSafeInteger(bareNumber)
          ? [{ number: bareNumber }]
          : []),
      ],
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      project: { select: { key: true, name: true } },
    },
    // Most recently touched first: the thing you are looking for is usually the
    // thing someone touched recently.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: LIMIT,
  });

  return issues.map((issue) => ({
    id: issue.id,
    key: `${issue.project.key}-${issue.number}`,
    title: issue.title,
    status: issue.status,
    projectName: issue.project.name,
  }));
}
