import { z } from "zod";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

/**
 * z.enum over the Prisma enum object rather than a hand-written list. Add a
 * status to schema.prisma and this accepts it automatically -- one source of
 * truth instead of two that drift.
 */
export const issueStatusSchema = z.enum(IssueStatus);
export const issuePrioritySchema = z.enum(IssuePriority);

export const createIssueSchema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  title: z.string().trim().min(1, "Enter a title").max(200, "Title is too long"),
  description: z.string().trim().max(10_000).optional(),
  status: issueStatusSchema.default(IssueStatus.BACKLOG),
  priority: issuePrioritySchema.default(IssuePriority.NONE),
  // "" from an unselected <select> must become undefined, not a bad id.
  assigneeId: z.string().transform((v) => v || undefined).optional(),
  labelIds: z.array(z.string()).default([]),
});

export const updateIssueSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  assigneeId: z.string().nullable().optional(),
});

export const commentSchema = z.object({
  issueId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first").max(10_000, "Comment is too long"),
});

export const toggleLabelSchema = z.object({
  issueId: z.string().min(1),
  labelId: z.string().min(1),
});

/** Parses "FLOW-124" into its parts. Returns null if it is not a valid key. */
export function parseIssueKey(raw: string): { projectKey: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(decodeURIComponent(raw));
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { projectKey: match[1]!.toUpperCase(), number };
}
