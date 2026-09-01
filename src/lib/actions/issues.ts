"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ActivityType, IssueStatus } from "@/generated/prisma/enums";
import {
  AuthorizationError,
  requireIssueAccess,
  requireProjectAccess,
  requireUserId,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { claimIssueNumber } from "@/lib/issue-numbering";
import {
  commentSchema,
  createIssueSchema,
  toggleLabelSchema,
  updateIssueSchema,
} from "@/lib/validations/issues";

export type IssueFormState = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/**
 * Turns a thrown AuthorizationError into form state instead of a crash, and
 * lets genuine bugs keep throwing so they surface in logs.
 */
function toFormState(error: unknown): IssueFormState {
  if (error instanceof AuthorizationError) {
    return { formError: error.message };
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createIssueAction(
  _previous: IssueFormState,
  formData: FormData,
): Promise<IssueFormState> {
  let redirectTo: string | null = null;

  try {
    const userId = await requireUserId();

    const parsed = createIssueSchema.safeParse({
      projectId: formData.get("projectId"),
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      status: formData.get("status") || undefined,
      priority: formData.get("priority") || undefined,
      assigneeId: formData.get("assigneeId") || undefined,
      // getAll, because multiple checkboxes share the name "labelIds".
      labelIds: formData.getAll("labelIds").map(String).filter(Boolean),
    });

    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const input = parsed.data;

    // NEVER trust the projectId from the payload -- re-derive access from the
    // session. Without this, anyone could post another workspace's projectId
    // and create issues inside it.
    const project = await requireProjectAccess(input.projectId, userId);

    const issue = await db.$transaction(async (tx) => {
      // Atomic; see the reasoning in lib/issue-numbering.ts.
      const number = await claimIssueNumber(tx, project.id);

      // Place new cards at the end of their column, leaving the usual gap.
      const last = await tx.issue.findFirst({
        where: { projectId: project.id, status: input.status },
        orderBy: { boardOrder: "desc" },
        select: { boardOrder: true },
      });

      const created = await tx.issue.create({
        data: {
          number,
          title: input.title,
          description: input.description ?? null,
          status: input.status,
          priority: input.priority,
          boardOrder: (last?.boardOrder ?? 0) + 1000,
          completedAt: input.status === IssueStatus.DONE ? new Date() : null,
          projectId: project.id,
          creatorId: userId,
          assigneeId: input.assigneeId ?? null,
          labels: {
            create: input.labelIds.map((labelId) => ({ labelId })),
          },
        },
        select: { id: true, number: true },
      });

      await tx.activity.create({
        data: {
          type: ActivityType.ISSUE_CREATED,
          workspaceId: project.workspaceId,
          actorId: userId,
          issueId: created.id,
          metadata: { title: input.title },
        },
      });

      return created;
    });

    redirectTo = `/issues/${project.key}-${issue.number}`;
  } catch (error) {
    return toFormState(error);
  }

  // redirect() throws, so it must sit OUTSIDE the try or the catch above would
  // swallow the navigation and the form would appear to hang.
  revalidatePath("/issues");
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

// ---------------------------------------------------------------------------
// Update (status / priority / assignee / title / description)
// ---------------------------------------------------------------------------

type UpdateInput = {
  issueId: string;
  status?: IssueStatus;
  priority?: string;
  assigneeId?: string | null;
  title?: string;
  description?: string | null;
};

/**
 * Called directly from client components (a <select> onChange, and in Stage 6 a
 * drag handler), which is why it takes an object rather than FormData.
 */
export async function updateIssueAction(input: UpdateInput) {
  const userId = await requireUserId();

  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid input" };
  }

  const { issueId, ...changes } = parsed.data;

  try {
    const issue = await requireIssueAccess(issueId, userId);

    await db.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: {
          ...changes,
          /**
           * completedAt is derived, never sent by the client. Set it when the
           * issue enters DONE and clear it when it leaves, so "completed this
           * week" stays honest if someone reopens an issue.
           */
          ...(changes.status
            ? {
                completedAt:
                  changes.status === IssueStatus.DONE ? new Date() : null,
              }
            : {}),
        },
      });

      // Only log what actually changed, so the activity feed stays readable.
      const events: Array<{ type: ActivityType; metadata: object }> = [];

      if (changes.status && changes.status !== issue.status) {
        events.push({
          type: ActivityType.ISSUE_STATUS_CHANGED,
          metadata: { from: issue.status, to: changes.status },
        });
      }
      if (changes.priority && changes.priority !== issue.priority) {
        events.push({
          type: ActivityType.ISSUE_PRIORITY_CHANGED,
          metadata: { from: issue.priority, to: changes.priority },
        });
      }
      if (changes.assigneeId !== undefined && changes.assigneeId !== issue.assigneeId) {
        events.push({
          type: ActivityType.ISSUE_ASSIGNED,
          metadata: { assigneeId: changes.assigneeId },
        });
      }

      if (events.length > 0) {
        await tx.activity.createMany({
          data: events.map((event) => ({
            ...event,
            workspaceId: issue.project.workspaceId,
            actorId: userId,
            issueId,
          })),
        });
      }
    });

    revalidatePath(`/issues/${issue.project.key}-${issue.number}`);
    revalidatePath("/issues");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export async function toggleLabelAction(input: { issueId: string; labelId: string }) {
  const userId = await requireUserId();

  const parsed = toggleLabelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid input" };
  }
  const { issueId, labelId } = parsed.data;

  try {
    const issue = await requireIssueAccess(issueId, userId);

    // The label must belong to the SAME workspace as the issue. Without this
    // check a caller could attach a label from an unrelated workspace they
    // happen to be a member of.
    const label = await db.label.findFirst({
      where: { id: labelId, workspaceId: issue.project.workspaceId },
      select: { id: true, name: true },
    });
    if (!label) {
      throw new AuthorizationError("Label not found");
    }

    const existing = await db.issueLabel.findUnique({
      where: { issueId_labelId: { issueId, labelId } },
    });

    if (existing) {
      await db.issueLabel.delete({
        where: { issueId_labelId: { issueId, labelId } },
      });
    } else {
      await db.$transaction(async (tx) => {
        await tx.issueLabel.create({ data: { issueId, labelId } });
        await tx.activity.create({
          data: {
            type: ActivityType.ISSUE_LABELED,
            workspaceId: issue.project.workspaceId,
            actorId: userId,
            issueId,
            metadata: { label: label.name },
          },
        });
      });
    }

    revalidatePath(`/issues/${issue.project.key}-${issue.number}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addCommentAction(
  _previous: IssueFormState,
  formData: FormData,
): Promise<IssueFormState> {
  try {
    const userId = await requireUserId();

    const parsed = commentSchema.safeParse({
      issueId: formData.get("issueId"),
      body: formData.get("body"),
    });

    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const { issueId, body } = parsed.data;
    const issue = await requireIssueAccess(issueId, userId);

    await db.$transaction(async (tx) => {
      await tx.comment.create({ data: { issueId, authorId: userId, body } });
      await tx.activity.create({
        data: {
          type: ActivityType.COMMENT_ADDED,
          workspaceId: issue.project.workspaceId,
          actorId: userId,
          issueId,
        },
      });
    });

    revalidatePath(`/issues/${issue.project.key}-${issue.number}`);
    return null;
  } catch (error) {
    return toFormState(error);
  }
}
