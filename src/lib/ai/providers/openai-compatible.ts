import { z } from "zod";

import { logger } from "@/lib/logger";

import type { AiConfig, AiProvider, AiRequest, JsonResult } from "../provider";

/**
 * Adapter for any endpoint speaking OpenAI's /chat/completions shape.
 *
 * That covers OpenAI, Groq, Together, OpenRouter, Mistral, DeepSeek, Fireworks,
 * vLLM, LM Studio and Ollama -- point AI_BASE_URL at one of them.
 *
 * WHY RAW fetch AND NOT THE openai PACKAGE
 * The surface used here is two endpoints and an SSE parser. Adding a dependency
 * to POST JSON to a URL would fail this project's rule that every dependency
 * needs a reason -- and the official client carries provider-specific defaults
 * (retry behaviour, base URL handling, header quirks) that are actively unhelpful
 * when the endpoint is Ollama on localhost.
 */

/** The subset of the response we read. Unknown fields are ignored, not rejected. */
const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        message: z.object({ content: z.string().nullish() }).optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
});

export function createOpenAiCompatibleProvider(config: AiConfig): AiProvider {
  const endpoint = `${config.baseUrl}/chat/completions`;

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  return {
    id: "openai-compatible",
    model: config.model,

    async *streamText({ system, user, signal }: AiRequest) {
      const response = await post(
        {
          model: config.model,
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        signal,
      );

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        logger.error("ai stream request failed", undefined, {
          component: "ai",
          provider: "openai-compatible",
          status: response.status,
          // Truncated: a provider error body can be a full HTML error page.
          detail: detail.slice(0, 300),
        });
        throw new Error(`AI request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // stream: true, or a multi-byte character split across chunks decodes
        // as a replacement character.
        buffer += decoder.decode(value, { stream: true });

        /**
         * SSE records are separated by a blank line, and a record can arrive
         * split across TCP chunks -- so we only consume complete records and
         * leave the remainder in the buffer. Parsing line-by-line as bytes
         * arrive is the classic way to truncate JSON mid-object.
         */
        const records = buffer.split("\n\n");
        buffer = records.pop() ?? "";

        for (const record of records) {
          for (const line of record.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();

            // Sentinel, not JSON. Parsing it throws.
            if (payload === "[DONE]") return;
            if (!payload) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(payload);
            } catch {
              // Some gateways interleave keepalive junk. Skip rather than kill
              // the stream.
              continue;
            }

            const chunk = chunkSchema.safeParse(parsed);
            if (!chunk.success) continue;

            const text = chunk.data.choices?.[0]?.delta?.content;
            if (text) yield text;
          }
        }
      }
    },

    async generateJson<T>(
      { system, user, signal }: AiRequest,
      schema: z.ZodType<T>,
      schemaName: string,
    ): Promise<JsonResult<T>> {
      const jsonSchema = z.toJSONSchema(schema as z.ZodType);

      const baseBody = {
        model: config.model,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };

      /**
       * Two attempts, because structured-output support is genuinely uneven
       * across providers speaking this shape:
       *
       *   1. json_schema with strict:true -- OpenAI, and a growing number of
       *      others. Constrains generation, so output is valid by construction.
       *   2. json_object -- much wider support, but only promises "some JSON".
       *
       * Ollama and older gateways reject the first with a 400. Rather than make
       * the operator discover that themselves, we fall back automatically.
       *
       * Either way OUR Zod validation is the actual guarantee.
       */
      const attempts = [
        {
          label: "json_schema",
          body: {
            ...baseBody,
            response_format: {
              type: "json_schema",
              json_schema: { name: schemaName, schema: jsonSchema, strict: true },
            },
          },
        },
        {
          label: "json_object",
          body: {
            ...baseBody,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `${system}\n\nRespond with JSON only, matching this schema exactly:\n${JSON.stringify(jsonSchema)}`,
              },
              { role: "user", content: user },
            ],
          },
        },
      ];

      let lastError = "The AI service failed.";

      for (const attempt of attempts) {
        let response: Response;
        try {
          response = await post(attempt.body, signal);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return { ok: false, kind: "transport", error: "Request cancelled." };
          }
          logger.error("ai request failed", error, {
            component: "ai",
            provider: "openai-compatible",
            mode: attempt.label,
          });
          return { ok: false, kind: "transport", error: "Could not reach the AI service." };
        }

        if (!response.ok) {
          const detail = await response.text().catch(() => "");

          // 429 and 5xx are not a response-format problem, so retrying with a
          // weaker format would just spend another request on the same failure.
          if (response.status === 429) {
            return { ok: false, kind: "transport", error: "Rate limited by the AI provider." };
          }
          if (response.status === 401 || response.status === 403) {
            logger.error("ai authentication failed", undefined, {
              component: "ai",
              provider: "openai-compatible",
              status: response.status,
            });
            return { ok: false, kind: "transport", error: "AI is misconfigured on this server." };
          }

          logger.warn("ai structured request rejected", {
            component: "ai",
            provider: "openai-compatible",
            mode: attempt.label,
            status: response.status,
            detail: detail.slice(0, 300),
          });
          lastError = `The AI service rejected the request (${response.status}).`;
          // Only a 4xx that is plausibly about the format is worth retrying.
          if (response.status >= 500) return { ok: false, kind: "transport", error: lastError };
          continue;
        }

        const payload = (await response.json().catch(() => null)) as unknown;
        const parsedEnvelope = chunkSchema.safeParse(payload);
        const content = parsedEnvelope.success
          ? parsedEnvelope.data.choices?.[0]?.message?.content
          : undefined;

        if (!content) {
          lastError = "The model returned an empty response.";
          continue;
        }

        let asObject: unknown;
        try {
          asObject = JSON.parse(content);
        } catch {
          /**
           * Some models wrap JSON in a markdown fence despite being told not
           * to. Strip a fence and retry once before giving up -- cheaper than a
           * second API call, and this is common enough to be worth handling.
           */
          const unfenced = content
            .replace(/^\s*```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "");
          try {
            asObject = JSON.parse(unfenced);
          } catch {
            lastError = "The model did not return valid JSON.";
            continue;
          }
        }

        const checked = schema.safeParse(asObject);
        if (!checked.success) {
          logger.warn("ai output failed schema validation", {
            component: "ai",
            provider: "openai-compatible",
            mode: attempt.label,
          });
          lastError = "The model's output did not match the expected shape.";
          continue;
        }

        return { ok: true, data: checked.data };
      }

      return { ok: false, kind: "invalid", error: lastError };
    },
  };
}
