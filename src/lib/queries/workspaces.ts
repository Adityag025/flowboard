import { db } from "@/lib/db";

/**
 * Workspace ids the caller belongs to -- the scope for every list query.
 *
 * This lived in lib/authz.ts and moved here, for a reason worth recording.
 *
 * authz.ts owns SESSION concerns: it imports next-auth and next/navigation's
 * redirect. This function needs neither -- it takes a userId and reads one
 * table. But because it sat in that module, anything importing it inherited the
 * whole auth stack. That is invisible in the app (Next resolves it fine) and
 * showed up the moment a test tried to import listIssues, which failed on
 * next-auth reaching for Next server internals.
 *
 * The same rule as lib/board-types.ts, in a different disguise: a module's
 * imports travel with everything it exports. Pure data queries belong in a
 * module that touches nothing but the database, so they stay importable from
 * tests, scripts, and anywhere else that has no request context.
 */
export async function workspaceIdsFor(userId: string): Promise<string[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((membership) => membership.workspaceId);
}
