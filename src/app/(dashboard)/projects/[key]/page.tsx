import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Board } from "@/components/board/board";
import { RealtimeSync } from "@/components/board/realtime-sync";
import { requireUser } from "@/lib/authz";
import { getBoard } from "@/lib/queries/board";
import { isRealtimeConfigured } from "@/lib/realtime";

type Params = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params;
  const user = await requireUser();
  const board = await getBoard(user.id, key.toUpperCase());
  return { title: board ? `${board.project.name} board` : "Project" };
}

export default async function ProjectBoardPage({ params }: Params) {
  const { key } = await params;
  const user = await requireUser();

  const board = await getBoard(user.id, key.toUpperCase());
  // Covers both "no such project" and "not yours" -- getBoard scopes on
  // membership, so a miss must not distinguish the two.
  if (!board) notFound();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/projects" className="transition-colors hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <span className="font-mono text-xs">{board.project.key}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {board.project.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {board.issues.length}{" "}
            {board.issues.length === 1 ? "issue" : "issues"} ·{" "}
            {board.project.workspace.name}
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/issues?projectKey=${board.project.key}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            View as list
          </Link>
          <Link href="/issues/new" className="text-accent hover:underline">
            New issue
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Drag a card to move it, or focus one and press Space, then the arrow
          keys.
        </p>
        {/* isRealtimeConfigured() runs on the server; only a boolean crosses. */}
        <RealtimeSync
          projectId={board.project.id}
          enabled={isRealtimeConfigured()}
        />
      </div>

      {/*
        The Board is a Client Component because dragging is inherently
        interactive. Note what crosses the boundary: plain serialisable data.
        The QUERY stayed on the server, so no database code reaches the browser.
      */}
      <Board issues={board.issues} projectKey={board.project.key} />
    </div>
  );
}
