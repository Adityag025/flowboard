import type { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

/**
 * The shape of a board card, declared EXPLICITLY rather than inferred from a
 * Prisma query payload.
 *
 * Why this file exists at all -- a real bug this caused:
 *
 * board.tsx is a Client Component. It originally imported both this type AND
 * the BOARD_COLUMNS constant from lib/queries/board.ts. The type import is
 * erased at compile time and harmless, but BOARD_COLUMNS is a runtime VALUE, so
 * importing it pulled in that whole module -- which imports `db`, which imports
 * @prisma/adapter-pg, which imports node-postgres. The build failed trying to
 * bundle a TCP database driver for the browser.
 *
 * The rule: a Client Component may import TYPES from a server module, but the
 * moment it imports a VALUE it inherits that module's entire dependency graph.
 * Shared constants and shared types therefore live in files that touch no
 * database.
 *
 * Declaring the shape by hand rather than deriving it from Prisma also means
 * the client never depends on the generated client at all. lib/queries/board.ts
 * annotates its return with this type, so a mismatch is a compile error.
 */
export type BoardCard = {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  boardOrder: number;
  assignee: { id: string; name: string } | null;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
};
