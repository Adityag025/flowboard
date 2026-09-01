"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { WorkspaceRole } from "@/generated/prisma/enums";
import { requireUserId } from "@/lib/authz";
import { db } from "@/lib/db";
import { toUserMessage } from "@/lib/errors";
import {
  changePasswordSchema,
  renameWorkspaceSchema,
  updateProfileSchema,
} from "@/lib/validations/settings";

export type SettingsFormState = {
  ok?: true;
  message?: string;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/** Same cost factor as signup -- see actions/auth.ts. */
const BCRYPT_ROUNDS = 12;

export async function updateProfileAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    const userId = await requireUserId();

    const parsed = updateProfileSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    await db.user.update({ where: { id: userId }, data: { name: parsed.data.name } });

    /**
     * The name is rendered in the header and on every issue, so the whole shell
     * has to re-render -- not just this page.
     *
     * Worth knowing: the SESSION still carries the old name until the JWT is
     * reissued, because it is stored in the token rather than read from the
     * database on each request. That is the cost of the JWT session strategy the
     * Credentials provider forces on us.
     */
    revalidatePath("/", "layout");

    return { ok: true, message: "Name updated." };
  } catch (error) {
    return { formError: toUserMessage(error, { action: "updateProfileAction" }) };
  }
}

export async function changePasswordAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    const userId = await requireUserId();

    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      // An OAuth-only account has no password to change.
      return { formError: "This account does not use a password." };
    }

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) {
      // Attributed to the field so it lands next to the input that is wrong.
      return { fieldErrors: { currentPassword: ["That is not your current password"] } };
    }

    await db.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS) },
    });

    /**
     * HONEST LIMITATION, surfaced to the user rather than hidden: changing the
     * password does NOT invalidate sessions on other devices. JWT sessions are
     * self-contained and stay valid until they expire, so there is no server-side
     * session list to revoke. Fixing it properly means a token version on the
     * user row, checked in the jwt callback -- deliberately not done here rather
     * than half-done.
     */
    return {
      ok: true,
      message: "Password changed. Other devices stay signed in until their session expires.",
    };
  } catch (error) {
    return { formError: toUserMessage(error, { action: "changePasswordAction" }) };
  }
}

export async function renameWorkspaceAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    const userId = await requireUserId();

    const parsed = renameWorkspaceSchema.safeParse({
      workspaceId: formData.get("workspaceId"),
      name: formData.get("name"),
    });
    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    /**
     * ROLE CHECK, and the workspaceId from the payload is never trusted.
     *
     * Membership alone is not enough here: a MEMBER can see a workspace but must
     * not rename it. So the query requires a membership row for THIS user with
     * an owning role -- a single query that answers "may they" rather than a
     * fetch followed by a comparison someone can forget to write.
     */
    const workspace = await db.workspace.findFirst({
      where: {
        id: parsed.data.workspaceId,
        members: {
          some: {
            userId,
            role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
          },
        },
      },
      select: { id: true },
    });

    if (!workspace) {
      // Not found, not forbidden -- a MEMBER should not learn whether the id was
      // real or merely off-limits.
      return { formError: "Workspace not found." };
    }

    await db.workspace.update({
      where: { id: workspace.id },
      data: { name: parsed.data.name },
    });

    revalidatePath("/settings");
    revalidatePath("/projects");

    return { ok: true, message: "Workspace renamed." };
  } catch (error) {
    return { formError: toUserMessage(error, { action: "renameWorkspaceAction" }) };
  }
}
