"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/authz";
import { db } from "@/lib/db";
import { toUserMessage } from "@/lib/errors";
import { createProjectSchema } from "@/lib/validations/projects";
import { slugify, slugSuffix } from "@/lib/workspaces";

export type ProjectFormState = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/** Next's redirect signals by throwing; a catch-all must let it through. */
function isRedirectSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createProjectAction(
  _previous: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  let redirectTo: string | null = null;

  try {
    const userId = await requireUserId();

    const parsed = createProjectSchema.safeParse({
      workspaceId: formData.get("workspaceId"),
      name: formData.get("name"),
      key: formData.get("key"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }
    const input = parsed.data;

    /**
     * The workspaceId arrives in the payload and is never trusted: membership is
     * re-derived from the session. Without this, anyone could post another
     * workspace's id and create a project inside it.
     *
     * ANY member may create a project -- deliberately not restricted to
     * OWNER/ADMIN. Creating work is the normal activity of a workspace; renaming
     * the workspace itself is the administrative act, and that is where the role
     * check lives.
     */
    const membership = await db.workspaceMember.findFirst({
      where: { userId, workspaceId: input.workspaceId },
      select: { workspaceId: true },
    });

    if (!membership) {
      // Not found, not forbidden -- the caller must not learn whether the id was
      // real or merely someone else's.
      return { formError: "Workspace not found." };
    }

    const MAX_ATTEMPTS = 5;
    let created: { key: string } | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      // Slugs are unique per workspace; a retry suffix handles two projects
      // whose names slugify identically ("Web App" and "web-app").
      const slug =
        attempt === 0
          ? slugify(input.name)
          : `${slugify(input.name)}-${slugSuffix()}`;

      try {
        created = await db.project.create({
          data: {
            name: input.name,
            key: input.key,
            slug: slug || `project-${slugSuffix()}`,
            description: input.description ?? null,
            workspaceId: membership.workspaceId,
          },
          select: { key: true },
        });
        break;
      } catch (error) {
        /**
         * No pre-check with findFirst: between the check and the insert another
         * request could claim the same key, so the composite unique index is the
         * authority and P2002 is handled instead.
         *
         * P2002 names the constraint that failed, and the two cases need
         * different treatment -- a key clash is the user's to fix, a slug clash
         * is ours to retry silently.
         */
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const target = Array.isArray(error.meta?.target)
            ? (error.meta.target as string[])
            : [];

          if (target.some((column) => column.includes("key"))) {
            return {
              fieldErrors: {
                key: [`The key ${input.key} is already used in this workspace`],
              },
            };
          }

          if (attempt < MAX_ATTEMPTS - 1) continue;
          return { formError: "Could not create the project. Please try again." };
        }
        throw error;
      }
    }

    if (!created) {
      return { formError: "Could not create the project. Please try again." };
    }

    revalidatePath("/projects");
    revalidatePath("/analytics");
    redirectTo = `/projects/${created.key}`;
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    return { formError: toUserMessage(error, { action: "createProjectAction" }) };
  }

  // Outside the try: redirect() signals by throwing, and the catch above would
  // swallow the navigation.
  redirect(redirectTo);
}
