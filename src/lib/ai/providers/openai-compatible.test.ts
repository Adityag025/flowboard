import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AiConfig } from "../provider";

import { createOpenAiCompatibleProvider } from "./openai-compatible";

/**
 * Tests the adapter against a REAL local HTTP server speaking the
 * /chat/completions shape.
 *
 * This is the whole reason the adapter is raw fetch rather than a vendor SDK: it
 * can be exercised completely without credentials or network access. Every
 * behaviour below -- SSE record framing, the json_schema -> json_object
 * fallback, markdown-fence stripping, auth failures -- is a real failure mode of
 * real providers, and none of it needs a paid API key to verify.
 */

type Handler = (body: Record<string, unknown>) => {
  status?: number;
  /** SSE chunks written with a delay between them. */
  sse?: string[];
  json?: unknown;
  text?: string;
};

let server: Server;
let baseUrl: string;
let handler: Handler;
/** Every request body the fake provider received, for assertions. */
let received: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      const body = JSON.parse(raw || "{}") as Record<string, unknown>;
      received.push(body);

      if (req.headers.authorization !== "Bearer test-key") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad key" }));
        return;
      }

      const result = handler(body);

      if (result.sse) {
        res.writeHead(result.status ?? 200, { "Content-Type": "text/event-stream" });
        for (const chunk of result.sse) {
          res.write(chunk);
          // A real provider writes across multiple TCP packets; this forces the
          // adapter's buffering to actually be exercised.
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        res.end();
        return;
      }

      res.writeHead(result.status ?? 200, { "Content-Type": "application/json" });
      res.end(result.text ?? JSON.stringify(result.json ?? {}));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function provider(overrides: Partial<AiConfig> = {}) {
  return createOpenAiCompatibleProvider({
    kind: "openai",
    apiKey: "test-key",
    model: "test-model",
    baseUrl,
    ...overrides,
  });
}

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of iterable) out += chunk;
  return out;
}

const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const delta = (content: string) => sse({ choices: [{ delta: { content } }] });

describe("streamText", () => {
  beforeAll(() => {
    received = [];
  });

  it("assembles text from SSE deltas", async () => {
    handler = () => ({
      sse: [delta("Hello"), delta(" "), delta("world"), "data: [DONE]\n\n"],
    });

    expect(await collect(provider().streamText({ system: "s", user: "u" }))).toBe(
      "Hello world",
    );
  });

  it("handles a record split across TCP writes", async () => {
    // The single most common way a hand-rolled SSE parser breaks: half a JSON
    // object arrives, gets parsed, and throws.
    const full = delta("split-safely");
    const midpoint = Math.floor(full.length / 2);
    handler = () => ({
      sse: [full.slice(0, midpoint), full.slice(midpoint), "data: [DONE]\n\n"],
    });

    expect(await collect(provider().streamText({ system: "s", user: "u" }))).toBe(
      "split-safely",
    );
  });

  it("stops at [DONE] and ignores anything after it", async () => {
    handler = () => ({
      sse: [delta("kept"), "data: [DONE]\n\n", delta("ignored")],
    });

    expect(await collect(provider().streamText({ system: "s", user: "u" }))).toBe("kept");
  });

  it("skips keepalive comments and malformed payloads without dying", async () => {
    handler = () => ({
      sse: [
        ": keepalive\n\n",
        "data: not-json\n\n",
        delta("survived"),
        sse({ unexpected: "shape" }),
        "data: [DONE]\n\n",
      ],
    });

    expect(await collect(provider().streamText({ system: "s", user: "u" }))).toBe(
      "survived",
    );
  });

  it("tolerates a null delta content", async () => {
    // Providers send a final chunk with content: null alongside finish_reason.
    handler = () => ({
      sse: [
        delta("text"),
        sse({ choices: [{ delta: { content: null }, finish_reason: "stop" }] }),
        "data: [DONE]\n\n",
      ],
    });

    expect(await collect(provider().streamText({ system: "s", user: "u" }))).toBe("text");
  });

  it("throws with the status when the request is rejected", async () => {
    handler = () => ({ status: 500, json: { error: "boom" } });

    await expect(
      collect(provider().streamText({ system: "s", user: "u" })),
    ).rejects.toThrow(/500/);
  });

  it("fails on a bad key rather than hanging", async () => {
    await expect(
      collect(provider({ apiKey: "wrong" }).streamText({ system: "s", user: "u" })),
    ).rejects.toThrow(/401/);
  });

  it("sends the model, stream flag and both messages", async () => {
    received = [];
    handler = () => ({ sse: ["data: [DONE]\n\n"] });
    await collect(provider().streamText({ system: "SYS", user: "USR" }));

    const body = received.at(-1)!;
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USR" },
    ]);
  });
});

const schema = z.object({
  title: z.string(),
  priority: z.enum(["LOW", "HIGH"]),
  labelNames: z.array(z.string()),
});

const validDraft = { title: "A bug", priority: "HIGH", labelNames: ["backend"] };
const asMessage = (content: string) => ({ choices: [{ message: { content } }] });

describe("generateJson", () => {
  it("returns validated data on the json_schema path", async () => {
    received = [];
    handler = () => ({ json: asMessage(JSON.stringify(validDraft)) });

    const result = await provider().generateJson(
      { system: "s", user: "u" },
      schema,
      "issue_draft",
    );

    expect(result).toEqual({ ok: true, data: validDraft });
    // First attempt must use strict json_schema, with the name we passed.
    const sent = received[0]!.response_format as Record<string, unknown>;
    expect(sent.type).toBe("json_schema");
    expect((sent.json_schema as Record<string, unknown>).name).toBe("issue_draft");
    expect((sent.json_schema as Record<string, unknown>).strict).toBe(true);
  });

  it("falls back to json_object when the provider rejects json_schema", async () => {
    // Ollama and older gateways 400 on json_schema. The operator should not have
    // to discover that themselves.
    received = [];
    let call = 0;
    handler = () => {
      call += 1;
      if (call === 1) return { status: 400, json: { error: "unsupported response_format" } };
      return { json: asMessage(JSON.stringify(validDraft)) };
    };

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");

    expect(result).toEqual({ ok: true, data: validDraft });
    expect(received).toHaveLength(2);
    expect((received[1]!.response_format as Record<string, unknown>).type).toBe(
      "json_object",
    );
    // The fallback must restate the schema in the prompt, since the endpoint is
    // no longer constraining generation.
    const messages = received[1]!.messages as { role: string; content: string }[];
    expect(messages[0]!.content).toContain("Respond with JSON only");
  });

  it("strips a markdown fence, which models add despite instructions", async () => {
    handler = () => ({
      json: asMessage("```json\n" + JSON.stringify(validDraft) + "\n```"),
    });

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");
    expect(result).toEqual({ ok: true, data: validDraft });
  });

  it("rejects output that does not match the schema", async () => {
    // The provider claimed success; our Zod validation is the real guarantee.
    handler = () => ({ json: asMessage(JSON.stringify({ title: "x", priority: "WAT" })) });

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("invalid");
  });

  it("reports a rate limit without burning the fallback attempt", async () => {
    received = [];
    handler = () => ({ status: 429, json: { error: "slow down" } });

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/[Rr]ate limit/);
    // A 429 is not a format problem, so retrying with a weaker format would
    // spend another request on the same failure.
    expect(received).toHaveLength(1);
  });

  it("reports a misconfigured key clearly", async () => {
    const result = await provider({ apiKey: "wrong" }).generateJson(
      { system: "s", user: "u" },
      schema,
      "d",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/misconfigured/);
  });

  it("does not retry a 5xx as a format problem", async () => {
    received = [];
    handler = () => ({ status: 503, json: { error: "down" } });

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");
    expect(result.ok).toBe(false);
    expect(received).toHaveLength(1);
  });

  it("handles an empty response body", async () => {
    handler = () => ({ json: { choices: [{ message: { content: "" } }] } });

    const result = await provider().generateJson({ system: "s", user: "u" }, schema, "d");
    expect(result.ok).toBe(false);
  });
});
