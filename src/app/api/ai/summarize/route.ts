import { auth } from "@/lib/auth";
import {
  AIUnavailableError,
  getAiProvider,
  type AiProvider,
} from "@/lib/ai/provider";
import {
  SUMMARIZE_SYSTEM,
  buildSummarizeUserMessage,
  summaryInputHash,
  type IssueForSummary,
} from "@/lib/ai/prompts";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { db } from "@/lib/db";
import { issueKey } from "@/lib/issues";
import { logger } from "@/lib/logger";

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
  /**
   * One request id, attached to every line this request emits.
   *
   * Without it, a production log is thousands of interleaved lines from
   * concurrent requests and you cannot tell which rate-limit rejection belongs
   * to which stream failure. Prefer an id the platform already assigned -- most
   * proxies set x-request-id, and reusing it means our logs join up with theirs.
   */
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = logger.child({ requestId, route: "/api/ai/summarize" });
  const startedAt = Date.now();

  // 1. WHO. A route handler is a public endpoint like any other; the session is
  //    the only thing that establishes identity.
  const session = await auth();
  if (!session?.user?.id) {
    log.warn("unauthenticated request");
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. RATE LIMIT, before any expensive work. Checked ahead of the database
  //    read on purpose: a user hammering this endpoint should not get free
  //    queries either.
  const limit = await checkRateLimit(userId);
  if (!limit.allowed) {
    // Worth logging: a spike here is either an abusive client or a limit set
    // too low, and you cannot tell which without the data.
    log.info("rate limited", { userId, backend: limit.backend });
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
    // Cache hit rate is the single most useful number for this endpoint: it is
    // the difference between the feature being cheap and being expensive.
    log.info("summary served from cache", {
      userId,
      issueId: issue.id,
      cached: true,
      ms: Date.now() - startedAt,
    });
    return new Response(issue.aiSummary, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Summary-Cached": "hit",
        "Cache-Control": "no-store",
      },
    });
  }

  let provider: AiProvider;
  try {
    provider = getAiProvider();
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      // Not an error level: nothing is broken, the feature is simply not
      // configured. Logging this at error would page someone for a no-op.
      log.info("ai not configured");
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
        /**
         * Provider-agnostic. Whether this is Anthropic, OpenAI, Groq or a local
         * Ollama is decided by configuration -- the handler only knows it gets
         * text chunks. Provider-specific behaviour (adaptive thinking, refusal
         * fallbacks, json_schema support) lives in the adapters.
         */
        for await (const chunk of provider.streamText({
          system: SUMMARIZE_SYSTEM,
          user: buildSummarizeUserMessage(forSummary),
          // Propagated so an abandoned stream actually stops generating -- an
          // orphaned generation still bills.
          signal: request.signal,
        })) {
          text += chunk;
          controller.enqueue(encoder.encode(chunk));
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

        log.info("summary generated", {
          userId,
          issueId: issue.id,
          cached: false,
          provider: provider.id,
          model: provider.model,
          chars: text.length,
          // Latency on the generated path is what you watch; the cached path is
          // always fast and tells you nothing.
          ms: Date.now() - startedAt,
        });

        controller.close();
      } catch (error) {
        /**
         * The response has already started, so we cannot change the status code
         * to 500 -- the browser has a 200 and some bytes. The honest option is
         * to append a visible marker so the user knows the text is incomplete,
         * rather than closing silently and leaving a truncated paragraph that
         * looks finished.
         */
        log.error("summarize stream failed", error, {
          userId,
          issueId: issue.id,
          // How much had been streamed before it broke -- distinguishes "failed
          // immediately" from "died most of the way through".
          streamedChars: text.length,
          ms: Date.now() - startedAt,
        });
        const message = "\n\n[The summary was interrupted. Please try again.]";
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
