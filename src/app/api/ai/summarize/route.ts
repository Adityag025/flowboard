import Anthropic from "@anthropic-ai/sdk";

import { auth } from "@/lib/auth";
import { AIUnavailableError, AI_MODEL, getAIClient } from "@/lib/ai/client";
import {
  SUMMARIZE_SYSTEM,
  buildSummarizeUserMessage,
  summaryInputHash,
  type IssueForSummary,
} from "@/lib/ai/prompts";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { db } from "@/lib/db";
import { issueKey } from "@/lib/issues";

/**
 * WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION.
 *
 * Every other mutation in this app is a Server Action, deliberately. This one
 * is not, and the reason is specific: a Server Action returns a value, once.
 * It cannot hand back a response that arrives progressively.
 *
 * A summary takes several seconds. As an action, the user stares at a spinner
 * and then the whole paragraph appears. As a stream, the first words show up in
 * a few hundred milliseconds. That difference is the entire user-facing point of
 * the feature, and streaming a Response body is what Route Handlers are for.
 *
 * So the rule is not "Server Actions are better". It is: mutations that return a
 * value -> Server Action; responses that arrive over time -> Route Handler.
 */
export async function POST(request: Request) {
  // 1. WHO. A route handler is a public endpoint like any other; the session is
  //    the only thing that establishes identity.
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. RATE LIMIT, before any expensive work. Checked ahead of the database
  //    read on purpose: a user hammering this endpoint should not get free
  //    queries either.
  const limit = checkRateLimit(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const issueId =
    typeof body === "object" && body !== null && "issueId" in body
      ? String((body as { issueId: unknown }).issueId)
      : "";
  if (!issueId) {
    return Response.json({ error: "issueId is required" }, { status: 400 });
  }

  // 3. MAY THEY. Membership is in the WHERE clause, so a non-member's issue is
  //    never returned -- the same rule as every other read in the app.
  const issue = await db.issue.findFirst({
    where: {
      id: issueId,
      project: { workspace: { members: { some: { userId } } } },
    },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      aiSummary: true,
      aiSummaryHash: true,
      project: { select: { key: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: { body: true, author: { select: { name: true } } },
      },
    },
  });

  // "Not found" rather than "forbidden", so this endpoint cannot be used to
  // discover which issue ids exist.
  if (!issue) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const forSummary: IssueForSummary = {
    key: issueKey(issue.project.key, issue.number),
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    comments: issue.comments.map((c) => ({
      author: c.author?.name ?? "Deleted user",
      body: c.body,
    })),
  };

  const hash = summaryInputHash(forSummary);

  // 4. CACHE. The cheapest LLM call is the one we do not make. A cached summary
  //    is returned immediately and costs nothing.
  if (issue.aiSummary && issue.aiSummaryHash === hash) {
    return new Response(issue.aiSummary, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Summary-Cached": "hit",
        "Cache-Control": "no-store",
      },
    });
  }

  let client: Anthropic;
  try {
    client = getAIClient();
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      // 503, not 500: the server is fine, the feature simply is not set up.
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const aiStream = client.beta.messages.stream({
          model: AI_MODEL,
          max_tokens: 64000,
          // Adaptive thinking: the model decides how much reasoning a given
          // issue warrants. `display: "omitted"` is the default on this model,
          // so no reasoning is streamed to the browser -- we only want prose.
          thinking: { type: "adaptive" },
          // A summary is a modest task; low effort is cheaper and enough. Raise
          // it if summaries come back shallow.
          output_config: { effort: "low" },
          // Safety classifiers can decline a request. Without a fallback the
          // call simply stops; with one, the same request is retried on another
          // model inside the same call.
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          system: SUMMARIZE_SYSTEM,
          messages: [
            { role: "user", content: buildSummarizeUserMessage(forSummary) },
          ],
        });

        for await (const event of aiStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await aiStream.finalMessage();

        // A refusal arrives as HTTP 200 with stop_reason "refusal", not as a
        // thrown error -- so it must be checked explicitly or it looks like a
        // successful empty response.
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode(
              "\n\n[The model declined to summarize this issue.]",
            ),
          );
          controller.close();
          return;
        }

        // 5. PERSIST, only after a clean finish. Caching a half-streamed
        //    summary because the connection dropped would poison the cache
        //    with truncated text that never regenerates.
        if (text.trim().length > 0) {
          await db.issue.update({
            where: { id: issue.id },
            data: {
              aiSummary: text.trim(),
              aiSummaryAt: new Date(),
              aiSummaryHash: hash,
            },
          });
        }

        controller.close();
      } catch (error) {
        /**
         * The response has already started, so we cannot change the status code
         * to 500 -- the browser has a 200 and some bytes. The honest option is
         * to append a visible marker so the user knows the text is incomplete,
         * rather than closing silently and leaving a truncated paragraph that
         * looks finished.
         */
        console.error("summarize stream failed:", error);
        const message =
          error instanceof Anthropic.RateLimitError
            ? "\n\n[Rate limited by the AI provider. Try again shortly.]"
            : "\n\n[The summary was interrupted. Please try again.]";
        controller.enqueue(encoder.encode(message));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Summary-Cached": "miss",
      // Summaries are per-issue and change; never let a proxy hold one.
      "Cache-Control": "no-store",
    },
  });
}
