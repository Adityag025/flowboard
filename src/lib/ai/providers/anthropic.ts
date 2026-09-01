import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { logger } from "@/lib/logger";

import type { AiConfig, AiProvider, AiRequest, JsonResult } from "../provider";

/**
 * The Anthropic adapter, via the official SDK.
 *
 * Anthropic's native API is not OpenAI-shaped, and going through the SDK rather
 * than raw HTTP buys three things the generic adapter cannot express: adaptive
 * thinking, effort control, and server-side refusal fallbacks.
 */
export function createAnthropicProvider(config: AiConfig): AiProvider {
  // One client per provider instance; the SDK holds a connection pool.
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    id: "anthropic",
    model: config.model,

    async *streamText({ system, user, signal }: AiRequest) {
      const stream = client.beta.messages.stream(
        {
          model: config.model,
          max_tokens: 64000,
          // The model decides how much reasoning the task warrants. Display
          // defaults to omitted, so no reasoning is streamed to the browser.
          thinking: { type: "adaptive" },
          // Summarising is a modest task; low effort is cheaper and sufficient.
          output_config: { effort: "low" },
          // Safety classifiers can decline a request. Without a fallback the
          // call simply stops; with one, the same request is retried on another
          // model inside the same call.
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal },
      );

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }

      // A refusal arrives as a successful response with stop_reason "refusal",
      // not as a thrown error, so it must be checked explicitly or it looks like
      // a successful empty answer.
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        yield "\n\n[The model declined to answer.]";
      }
    },

    // No schemaName parameter: the Anthropic SDK derives the format from the
    // Zod schema itself, unlike the OpenAI json_schema block which needs a name.
    async generateJson<T>(
      { system, user }: AiRequest,
      schema: z.ZodType<T>,
    ): Promise<JsonResult<T>> {
      try {
        const response = await client.messages.parse({
          model: config.model,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          output_config: {
            effort: "low",
            // The SDK converts the Zod schema and validates the response.
            format: zodOutputFormat(schema as z.ZodType),
          },
          system,
          messages: [{ role: "user", content: user }],
        });

        if (response.stop_reason === "refusal") {
          return { ok: false, kind: "refusal", error: "The model declined this request." };
        }

        const parsed = response.parsed_output as T | null;
        if (!parsed) {
          return { ok: false, kind: "invalid", error: "The model returned unusable output." };
        }

        // Re-validated on our side regardless of what the SDK did: the schema is
        // ours to enforce, not the provider's to promise.
        const checked = schema.safeParse(parsed);
        if (!checked.success) {
          return { ok: false, kind: "invalid", error: "The model's output failed validation." };
        }

        return { ok: true, data: checked.data };
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          return { ok: false, kind: "transport", error: "Rate limited by the AI provider." };
        }
        if (error instanceof Anthropic.AuthenticationError) {
          logger.error("anthropic authentication failed", error, { component: "ai" });
          return { ok: false, kind: "transport", error: "AI is misconfigured on this server." };
        }
        if (error instanceof Anthropic.APIError) {
          logger.error("anthropic api error", error, { component: "ai" });
          return { ok: false, kind: "transport", error: "The AI service failed." };
        }
        throw error;
      }
    },
  };
}
