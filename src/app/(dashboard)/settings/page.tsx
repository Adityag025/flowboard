import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings/settings-form";
import { Card } from "@/components/ui/card";
import { WorkspaceRole } from "@/generated/prisma/enums";
import {
  changePasswordAction,
  renameWorkspaceAction,
  updateProfileAction,
} from "@/lib/actions/settings";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      createdAt: true,
      // Whether a password exists at all decides if the password form applies.
      passwordHash: true,
      memberships: {
        select: {
          role: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!account) {
    /**
     * A valid session for a user that no longer exists.
     *
     * Reachable in practice, not theoretical: JWT sessions are self-contained,
     * so deleting a user leaves their token working until it expires. Better to
     * say so than to crash on a null.
     */
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Card>
          <p className="text-sm text-muted">
            This account no longer exists. Please sign out and sign in again.
          </p>
        </Card>
      </div>
    );
  }

  const hasPassword = Boolean(account.passwordHash);

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">
          Member since{" "}
          {account.createdAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      <section aria-labelledby="profile-heading">
        <Card className="space-y-4">
          <div className="space-y-0.5">
            <h2 id="profile-heading" className="text-sm font-medium">
              Profile
            </h2>
            <p className="text-xs text-muted">How your name appears on issues and comments</p>
          </div>

          <SettingsForm
            action={updateProfileAction}
            submitLabel="Save name"
            fields={[
              {
                name: "name",
                label: "Name",
                defaultValue: account.name,
                required: true,
                maxLength: 80,
              },
              {
                name: "email",
                label: "Email",
                defaultValue: account.email,
                // Read-only rather than absent: people look here to check which
                // address they used. Changing it needs a verification flow --
                // otherwise a hijacked session could move the account to an
                // attacker's inbox and take over password recovery -- so it is
                // honestly disabled instead of half-implemented.
                disabled: true,
                hint: "Changing your email needs verification, which isn't built yet.",
              },
            ]}
          />
        </Card>
      </section>

      <section aria-labelledby="password-heading">
        <Card className="space-y-4">
          <div className="space-y-0.5">
            <h2 id="password-heading" className="text-sm font-medium">
              Password
            </h2>
            <p className="text-xs text-muted">
              {hasPassword
                ? "Your current password is required to set a new one"
                : "This account signs in without a password"}
            </p>
          </div>

          {hasPassword ? (
            <SettingsForm
              action={changePasswordAction}
              submitLabel="Change password"
              fields={[
                {
                  name: "currentPassword",
                  label: "Current password",
                  type: "password",
                  autoComplete: "current-password",
                  required: true,
                },
                {
                  name: "newPassword",
                  label: "New password",
                  type: "password",
                  autoComplete: "new-password",
                  required: true,
                  minLength: 8,
                  hint: "At least 8 characters.",
                },
                {
                  name: "confirmPassword",
                  label: "Confirm new password",
                  type: "password",
                  autoComplete: "new-password",
                  required: true,
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted">Nothing to change here.</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="workspaces-heading">
        <div className="space-y-3">
          <div className="space-y-0.5">
            <h2 id="workspaces-heading" className="text-sm font-medium">
              Workspaces
            </h2>
            <p className="text-xs text-muted">
              Only owners and admins can rename a workspace
            </p>
          </div>

          {account.memberships.map(({ role, workspace }) => {
            const canRename =
              role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;

            return (
              <Card key={workspace.id} className="space-y-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-muted">/{workspace.slug}</p>
                  <span className="rounded bg-surface-hover px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {role.toLowerCase()}
                  </span>
                </div>

                {canRename ? (
                  <SettingsForm
                    action={renameWorkspaceAction}
                    submitLabel="Rename"
                    hiddenFields={{ workspaceId: workspace.id }}
                    fields={[
                      {
                        name: "name",
                        label: "Workspace name",
                        defaultValue: workspace.name,
                        required: true,
                        maxLength: 80,
                        // Two workspaces on one page would otherwise share the
                        // id "name" and break every label association.
                        idPrefix: `ws-${workspace.id}-`,
                      },
                    ]}
                  />
                ) : (
                  <>
                    <p className="text-sm">{workspace.name}</p>
                    {/*
                      The control is absent rather than disabled: a disabled input
                      invites the user to try, then refuses. The server enforces
                      this regardless -- the role is re-checked in the action,
                      because hiding a form is not access control.
                    */}
                    <p className="text-xs text-muted">
                      Ask an owner or admin to rename this workspace.
                    </p>
                  </>
                )}
              </Card>
            );
          })}

          {account.memberships.length === 0 && (
            <Card>
              <p className="text-sm text-muted">You aren&apos;t in any workspace yet.</p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
