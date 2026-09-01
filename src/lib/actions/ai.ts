"use server";

import { z } from "zod";

import { IssuePriority } from "@/generated/prisma/enums";
import {
  AIUnavailableError,
  getAiProvider,
  type AiProvider,
} from "@/lib/ai/provider";
import { DRAFT_SYSTEM, buildDraftUserMessage } from "@/lib/ai/prompts";
import { resolveLabelIds } from "@/lib/ai/resolve-labels";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { requireUserId } from "@/lib/authz";
import { workspaceIdsFor } from "@/lib/queries/workspaces";
import { db } from "@/lib/db";

/**
 * The shape we ask the model to produce.
 *
 * Structured outputs constrain generation to this schema, so we get an object
 * rather than prose we would have to parse out of a paragraph. `priority` is a
 * closed enum, so the model cannot answer "quite important".
 */
const draftSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum([
    IssuePriority.NONE,
    IssuePriority.LOW,
    IssuePriority.MEDIUM,
    IssuePriority.HIGH,
    IssuePriority.URGENT,
  ]),
  labelNames: z.array(z.string()),
});

export type IssueDraft = {
  title: string;
  description: string;
  priority: IssuePriority;
  labelIds: string[];
};

export type DraftResult =
  | { ok: true; draft: IssueDraft }
  | { ok: false; error: string };

/** Guards against someone pasting a novel and running up the input bill. */
const MAX_INPUT_CHARS = 4000;

/**
 * Generate a structured issue draft from free text.
 *
 * A Server Action rather than a Route Handler, unlike summarize: there is
 * nothing to stream. The caller needs the WHOLE object before it can fill in a
 * form -- a half-arrived title is useless -- so a single return value is the
 * right shape, and we keep the type safety that comes with it.
 */
export async function draftIssueAction(input: {
  description: string;
}): Promise<DraftResult> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const limit = await checkRateLimit(userId);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const description = input.description?.trim() ?? "";
  if (description.length < 10) {
    return { ok: false, error: "Describe the problem in a sentence or two first." };
  }
  if (description.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `Please keep it under ${MAX_INPUT_CHARS} characters.`,
    };
  }

  const workspaceIds = await workspaceIdsFor(userId);
  if (workspaceIds.length === 0) {
    return { ok: false, error: "You are not a member of any workspace." };
  }

  // Only labels this user can actually apply are offered to the model.
  const labels = await db.label.findMany({
    where: { workspaceId: { in: workspaceIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let provider: AiProvider;
  try {
    provider = getAiProvider();
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  {
    /**
     * Provider-agnostic. The adapter decides HOW the object is constrained --
     * Anthropic's structured outputs, OpenAI's json_schema, or a json_object
     * fallback for endpoints supporting neither. The Zod schema below is
     * enforced on our side either way, so weaker provider support degrades to a
     * retry rather than to bad data.
     */
    const result = await provider.generateJson(
      {
        system: DRAFT_SYSTEM,
        user: buildDraftUserMessage(
          description,
          labels.map((label) => label.name),
        ),
      },
      draftSchema,
      "issue_draft",
    );

    if (!result.ok) {
      if (result.kind === "refusal") {
        return {
          ok: false,
          error: "The model declined this request. Try rewording your description.",
        };
      }
      return { ok: false, error: result.error };
    }

    const parsed = result.data;

    /**
     * TREAT MODEL OUTPUT LIKE USER INPUT.
     *
     * The schema guarantees the SHAPE, not the CONTENT. Everything below is a
     * value the model chose, and it can be wrong in ways the schema permits:
     *
     *   - `title` can exceed our 200-character column, so it is truncated.
     *   - `labelNames` can contain a label that does not exist, or one from a
     *     workspace this user cannot see, despite the instruction not to invent
     *     any. So names are resolved against the labels we actually fetched for
     *     THIS user, and anything unmatched is dropped -- not created.
     *
     * The model is an untrusted source that happens to be helpful. It never
     * gets to decide what rows exist.
     */
    const labelIds = resolveLabelIds(parsed.labelNames, labels);

    return {
      ok: true,
      draft: {
        title: parsed.title.trim().slice(0, 200),
        description: parsed.description.trim().slice(0, 10_000),
        priority: parsed.priority,
        labelIds,
      },
    };
  }
  // Provider-specific error handling (rate limits, auth, transport) now lives
  // inside each adapter, which is the only place that knows what its errors look
  // like. This function receives a discriminated result and maps it to UI copy.
}
