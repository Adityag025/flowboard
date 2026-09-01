import type { Metadata } from "next";

import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "New project",
};

export default async function NewProjectPage() {
  const user = await requireUser();

  // Only workspaces the user belongs to are offered. The action re-checks
  // membership regardless -- a form that omits an option is not access control.
  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspace: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const workspaces = memberships.map((m) => m.workspace);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted">
          A project groups issues and gives them a key prefix.
        </p>
      </header>

      {workspaces.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            You need to be in a workspace before you can create a project.
          </p>
        </Card>
      ) : (
        <Card>
          <CreateProjectForm workspaces={workspaces} />
        </Card>
      )}
    </div>
  );
}
