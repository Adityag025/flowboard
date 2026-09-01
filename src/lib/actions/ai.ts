"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { IssuePriority } from "@/generated/prisma/enums";
import { AIUnavailableError, AI_MODEL, getAIClient } from "@/lib/ai/client";
import { DRAFT_SYSTEM, buildDraftUserMessage } from "@/lib/ai/prompts";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { requireUserId, workspaceIdsFor } from "@/lib/authz";
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

  const limit = checkRateLimit(userId);
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

  let client: Anthropic;
  try {
    client = getAIClient();
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  try {
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: zodOutputFormat(draftSchema),
      },
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildDraftUserMessage(
            description,
            labels.map((label) => label.name),
          ),
        },
      ],
    });

    // A refusal is HTTP 200 with stop_reason "refusal" -- not a thrown error.
    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: "The model declined this request. Try rewording your description.",
      };
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return { ok: false, error: "The model returned something unusable. Try again." };
    }

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
    const byName = new Map(
      labels.map((label) => [label.name.toLowerCase(), label.id]),
    );

    const labelIds = [
      ...new Set(
        parsed.labelNames
          .map((name) => byName.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    return {
      ok: true,
      draft: {
        title: parsed.title.trim().slice(0, 200),
        description: parsed.description.trim().slice(0, 10_000),
        priority: parsed.priority,
        labelIds,
      },
    };
  } catch (error) {
    // A typed chain, not one broad catch: these need different messages, and
    // conflating them hides which failures are retryable.
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "The AI provider is rate limiting us. Try again shortly." };
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth failed -- check ANTHROPIC_API_KEY");
      return { ok: false, error: "AI is misconfigured on this server." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      return { ok: false, error: "The AI service failed. Please try again." };
    }
    throw error;
  }
}
