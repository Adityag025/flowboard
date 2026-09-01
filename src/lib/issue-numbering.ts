import type { Prisma } from "@/generated/prisma/client";

/**
 * Claim the next issue number for a project.
 *
 * Extracted from createIssueAction so it can be tested directly under real
 * concurrency -- the correctness of this function is the whole reason issue keys
 * are trustworthy, and it was previously only reachable through an authenticated
 * Server Action.
 *
 * WHY NOT count(*) + 1:
 * Two requests arriving together would both read the same count and both try to
 * be FLOW-124. The composite unique index would reject one of them, so the user
 * sees an error for a collision that need never have happened.
 *
 * `increment` compiles to `SET "issueCounter" = "issueCounter" + 1`, which
 * Postgres serialises on the row: concurrent callers queue and each receives a
 * distinct value. Reading the counter and writing back would reintroduce the
 * race -- the read and the write must be one statement.
 *
 * Takes a transaction client so the number and the issue are committed together.
 */
export async function claimIssueNumber(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<number> {
  const project = await tx.project.update({
    where: { id: projectId },
    data: { issueCounter: { increment: 1 } },
    select: { issueCounter: true },
  });
  return project.issueCounter;
}
