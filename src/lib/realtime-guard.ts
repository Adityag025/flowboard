import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Authorises a realtime subscription to a project.
 *
 * Separate from lib/authz.ts only because this returns a result object rather
 * than throwing or redirecting -- a route handler needs to choose its own status
 * code, and a redirect in an SSE handler would produce a stream the browser
 * cannot use.
 *
 * As everywhere else: membership goes in the WHERE clause, and a miss is 404
 * rather than 403, so this endpoint cannot be used to discover which project ids
 * exist.
 */
export async function requireIssueAccessless(
  projectId: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 404 }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401 };
  }

  const project = await db.project.findFirst({
    where: {
      id: projectId,
      workspace: { members: { some: { userId: session.user.id } } },
    },
    select: { id: true },
  });

  if (!project) {
    return { ok: false, status: 404 };
  }

  return { ok: true, userId: session.user.id };
}
