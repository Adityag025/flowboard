import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * AUTHORIZATION FOR SERVER ACTIONS.
 *
 * The single most important thing to understand about Server Actions: each one
 * compiles to a PUBLIC HTTP ENDPOINT. React gives it an opaque id and posts to
 * it, but nothing stops anyone crafting that request by hand with any arguments
 * they like.
 *
 * So "the button is only rendered for members" is not access control. It is a
 * hint to well-behaved browsers. Every action must independently establish:
 *
 *   1. WHO is calling            -> requireUser()
 *   2. whether they may touch    -> requireIssueAccess() / requireProjectAccess()
 *      THIS specific row
 *
 * Never trust a workspaceId or projectId that arrived in the payload. Always
 * re-derive access from the session.
 */

export class AuthorizationError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** The signed-in user, or a redirect to login. For use in pages. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/** The signed-in user, or a thrown error. For use in actions, which must not redirect mid-mutation. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError("You must be signed in");
  }
  return session.user.id;
}

/**
 * Resolve an issue the caller is allowed to see.
 *
 * Membership is part of the WHERE clause, not a check afterwards. If the user
 * is not in the issue's workspace the database returns nothing, and we cannot
 * accidentally leak the row by forgetting a guard further down.
 *
 * Returns "not found" rather than "forbidden" on purpose: distinguishing the
 * two tells an attacker that FLOW-999 exists in someone else's workspace.
 */
export async function requireIssueAccess(issueId: string, userId: string) {
  const issue = await db.issue.findFirst({
    where: {
      id: issueId,
      project: { workspace: { members: { some: { userId } } } },
    },
    select: {
      id: true,
      number: true,
      status: true,
      priority: true,
      assigneeId: true,
      project: { select: { id: true, key: true, workspaceId: true } },
    },
  });

  if (!issue) {
    throw new AuthorizationError();
  }
  return issue;
}

/** Same idea for projects. */
export async function requireProjectAccess(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      workspace: { members: { some: { userId } } },
    },
    select: { id: true, key: true, workspaceId: true },
  });

  if (!project) {
    throw new AuthorizationError();
  }
  return project;
}

// workspaceIdsFor used to live here. It moved to lib/queries/workspaces.ts
// because it needs only the database, and keeping it in this module forced every
// importer to inherit next-auth and next/navigation as well.
