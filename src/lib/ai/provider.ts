import type { z } from "zod";

/**
 * Provider-agnostic AI interface.
 *
 * WHY THIS LAYER EXISTS
 * The two things this app asks of a model -- stream some prose, return a
 * validated object -- are supported by every serious provider. What differs is
 * the wire format. Pinning the app to one vendor's SDK means a switch is a
 * rewrite of every call site; putting the vendor behind these two methods makes
 * it a config change.
 *
 * TWO ADAPTERS COVER ALMOST EVERYTHING
 *   anthropic  -- the official SDK. Anthropic's native API is not
 *                 OpenAI-shaped, and the SDK gives us adaptive thinking,
 *                 effort control and server-side fallbacks that a generic
 *                 client cannot express.
 *   openai     -- raw HTTP against /chat/completions. That shape is a de facto
 *                 standard: OpenAI, Groq, Together, OpenRouter, Mistral,
 *                 DeepSeek, Fireworks, vLLM and Ollama all speak it. One
 *                 adapter, any of them, via AI_BASE_URL.
 *
 * WHAT IS DELIBERATELY *NOT* HERE
 * No lowest-common-denominator flattening of provider features. The Anthropic
 * adapter still uses adaptive thinking and fallbacks; the OpenAI adapter still
 * uses json_schema where the endpoint supports it. The interface is the narrow
 * waist, not a cap on what each side may do.
 */

export type AiRequest = {
  system: string;
  user: string;
  /** Aborting must actually stop generation -- an abandoned stream still bills. */
  signal?: AbortSignal;
};

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: "refusal" | "invalid" | "transport" };

export type AiProvider = {
  /** For logs and diagnostics, never shown to users. */
  readonly id: string;
  readonly model: string;

  /** Yields text chunks as they arrive. */
  streamText(request: AiRequest): AsyncIterable<string>;

  /**
   * Returns an object validated against `schema`.
   *
   * The schema is enforced by Zod on OUR side regardless of what the provider
   * claims to guarantee. Provider-side structured output is an optimisation that
   * makes valid output likelier; it is not a guarantee we rely on. Support
   * varies from strict JSON Schema to nothing at all, and "the docs say it
   * returns JSON" is not a contract.
   */
  generateJson<T>(
    request: AiRequest,
    schema: z.ZodType<T>,
    schemaName: string,
  ): Promise<JsonResult<T>>;
};

/**
 * Raised when AI is asked for but not configured.
 *
 * A normal, expected state -- a fresh clone has no key -- not a bug. A distinct
 * type so the UI can say "not configured" rather than showing a generic failure,
 * and so a missing key is never mistaken for a request that failed.
 */
export class AIUnavailableError extends Error {
  constructor(message = "AI features are not configured on this server.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export type ProviderKind = "anthropic" | "openai";

export type AiConfig = {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  /** Only meaningful for the openai adapter. */
  baseUrl: string;
};

const DEFAULT_MODELS: Record<ProviderKind, string> = {
  anthropic: "claude-opus-5",
  // Left to the operator on purpose: there is no sensible default that is
  // correct across OpenAI, Groq, Together and Ollama simultaneously.
  openai: "",
};

const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  anthropic: "",
  openai: "https://api.openai.com/v1",
};

/**
 * Resolve configuration from the environment.
 *
 * Precedence is chosen so that adding this feature did not break anyone already
 * running with ANTHROPIC_API_KEY:
 *
 *   1. AI_PROVIDER, if set, wins outright.
 *   2. Otherwise, a bare ANTHROPIC_API_KEY still means Anthropic.
 *   3. Otherwise, an AI_API_KEY with no provider named means the OpenAI-shaped
 *      adapter, since that is the shape most third parties expose.
 *
 * Returns null rather than throwing when nothing is configured: callers must
 * degrade, and a missing key is not an exceptional condition.
 */
export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();

  let kind: ProviderKind | null = null;
  if (explicit === "anthropic" || explicit === "claude") kind = "anthropic";
  else if (
    explicit === "openai" ||
    explicit === "openai-compatible" ||
    explicit === "compatible"
  ) {
    kind = "openai";
  } else if (explicit) {
    // An unrecognised value is a typo, and silently falling back to a different
    // provider than the operator asked for is worse than not starting the
    // feature at all.
    return null;
  }

  if (!kind) {
    if (env.ANTHROPIC_API_KEY?.trim()) kind = "anthropic";
    else if (env.AI_API_KEY?.trim()) kind = "openai";
    else return null;
  }

  // A provider-specific key beats the generic one, so both can coexist while
  // switching providers.
  const apiKey =
    (kind === "anthropic" ? env.ANTHROPIC_API_KEY?.trim() : undefined) ||
    env.AI_API_KEY?.trim() ||
    env.ANTHROPIC_API_KEY?.trim() ||
    "";

  if (!apiKey) return null;

  const model = env.AI_MODEL?.trim() || DEFAULT_MODELS[kind];
  if (!model) return null;

  const baseUrl = (env.AI_BASE_URL?.trim() || DEFAULT_BASE_URLS[kind]).replace(/\/+$/, "");

  return { kind, apiKey, model, baseUrl };
}

export function isAIConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveAiConfig(env) !== null;
}

/**
 * The configured provider, or a thrown AIUnavailableError.
 *
 * Cached per process: each adapter holds an HTTP connection pool, and building
 * one per request wastes sockets. Cleared by resetAiProvider() in tests.
 *
 * The dynamic requires are deliberate: importing both adapters eagerly would
 * pull the Anthropic SDK into every process that only ever talks to Ollama.
 */
let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const config = resolveAiConfig();
  if (!config) throw new AIUnavailableError();

  if (config.kind === "anthropic") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAnthropicProvider } = require("./providers/anthropic") as typeof import("./providers/anthropic");
    cached = createAnthropicProvider(config);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createOpenAiCompatibleProvider } = require("./providers/openai-compatible") as typeof import("./providers/openai-compatible");
    cached = createOpenAiCompatibleProvider(config);
  }

  return cached;
}

/** Tests only. */
export function resetAiProvider(): void {
  cached = null;
}
