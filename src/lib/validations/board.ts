import { z } from "zod";

import { IssueStatus } from "@/generated/prisma/enums";

export const moveIssueSchema = z.object({
  issueId: z.string().min(1),
  toStatus: z.enum(IssueStatus),
  // Nullable AND optional: "no neighbour on this side" is a real, valid state
  // (top of a column, bottom of a column, or an empty column).
  beforeIssueId: z.string().nullish(),
  afterIssueId: z.string().nullish(),
});
