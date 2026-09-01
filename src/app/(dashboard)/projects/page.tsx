import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { workspaceIdsFor } from "@/lib/queries/workspaces";
import { db } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/issues";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const user = await requireUser();
  const workspaceIds = await workspaceIdsFor(user.id);

  const projects =
    workspaceIds.length === 0
      ? []
      : await db.project.findMany({
          where: { workspaceId: { in: workspaceIds }, archivedAt: null },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            workspace: { select: { name: true } },
            /**
             * `_count` with a filter is one aggregate in the SAME query, not a
             * second round trip per project. Looping over projects and counting
             * issues for each would be the textbook N+1: one query becomes
             * N + 1 queries as soon as you have a few projects.
             */
            _count: {
              select: {
                issues: { where: { status: { in: [...OPEN_STATUSES] } } },
              },
            },
          },
        });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>

        <Link href="/projects/new">
          <Button>New project</Button>
        </Link>
      </header>

      {projects.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No projects yet.{" "}
            <Link href="/projects/new" className="text-accent hover:underline">
              Create your first one
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.key}`} className="block">
                <Card className="h-full transition-colors hover:bg-surface-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">
                        {project.name}
                      </h2>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {project.key}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-surface-hover px-2 py-0.5 text-xs text-muted">
                      {project._count.issues} open
                    </span>
                  </div>
                  {project.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-muted">
                      {project.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    {project.workspace.name}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
