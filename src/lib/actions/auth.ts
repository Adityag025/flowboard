"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { Prisma } from "@/generated/prisma/client";

import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { signInSchema, signUpSchema } from "@/lib/validations/auth";
import { slugify, slugSuffix } from "@/lib/workspaces";
import { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * What a form gets back. `fieldErrors` drives per-input messages; `formError`
 * is for things no single field caused (bad credentials, database down).
 */
export type AuthFormState = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/**
 * bcrypt work factor. 12 is roughly 250ms on modern hardware -- deliberately
 * slow, because the whole point is to make offline brute-forcing of a stolen
 * hash expensive. Raise it as hardware improves; never lower it for speed.
 */
const BCRYPT_ROUNDS = 12;

/**
 * `next` comes from a query string, so it is attacker-controlled. Accepting it
 * unchecked turns our login page into an open redirect -- "log in and get sent
 * to evil.example.com". Allow only same-site absolute paths.
 */
function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  // "//evil.com" is protocol-relative and would leave the site.
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  /**
   * User + workspace + membership are created in ONE TRANSACTION.
   *
   * A user with no workspace is a dead end -- they would land on a dashboard
   * with nothing to show and no way to make anything. So the three rows are
   * all-or-nothing: if the membership insert fails, the orphaned user is rolled
   * back rather than left behind as an account that can log in but do nothing.
   *
   * The retry loop exists only for slug collisions. Two people with the same
   * name generate the same slug, and slugs are globally unique.
   */
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const slug =
      attempt === 0
        ? slugify(`${name}-workspace`)
        : `${slugify(`${name}-workspace`)}-${slugSuffix()}`;

    try {
      await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name, email, passwordHash },
          select: { id: true },
        });

        const workspace = await tx.workspace.create({
          data: { name: `${name.split(/\s+/)[0]}'s Workspace`, slug },
          select: { id: true },
        });

        await tx.workspaceMember.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            // Whoever creates a workspace owns it.
            role: WorkspaceRole.OWNER,
          },
        });
      });

      break;
    } catch (error) {
      /**
       * We do NOT pre-check for a duplicate email with findUnique. Between the
       * check and the insert, another request could claim the same address -- a
       * race the database already prevents with its unique index. Let the
       * constraint be the authority and handle the violation instead.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // P2002 tells us WHICH constraint failed, which matters: an email
        // clash is the user's problem to fix, a slug clash is ours to retry.
        const target = Array.isArray(error.meta?.target)
          ? (error.meta.target as string[])
          : [];

        if (target.some((column) => column.includes("email"))) {
          return { fieldErrors: { email: ["That email is already registered"] } };
        }

        if (attempt < MAX_ATTEMPTS - 1) {
          continue;
        }
        return { formError: "Could not create your workspace. Please try again." };
      }
      throw error;
    }
  }

  // Sign the new account straight in, so signup does not dump the user back
  // onto a login form. This throws a redirect on success -- see signInAction.
  return signInAction(null, formData);
}

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const redirectTo = safeRedirectPath(formData.get("next"));

  try {
    await signIn("credentials", { ...parsed.data, redirectTo });
  } catch (error) {
    /**
     * THE IMPORTANT BIT: on success, signIn does not return -- it throws a
     * special redirect error that Next intercepts to navigate the browser.
     *
     * So a bare `catch` here would swallow the success case and the user would
     * appear to be stuck on the login form despite being signed in. Only
     * AuthError means genuine failure; everything else must be re-thrown.
     */
    if (error instanceof AuthError) {
      // One message for every failure mode. Distinguishing "no such user" from
      // "wrong password" would let anyone enumerate registered emails.
      return { formError: "Invalid email or password" };
    }
    throw error;
  }

  return null;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
