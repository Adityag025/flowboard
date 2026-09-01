import { describe, expect, it } from "vitest";

import { isAIConfigured, resolveAiConfig } from "./provider";

/**
 * Config resolution takes an env object as a parameter precisely so it can be
 * tested without mutating process.env -- mutating global env in tests leaks
 * across files and produces order-dependent failures.
 */
const env = (values: Record<string, string | undefined>) =>
  values as unknown as NodeJS.ProcessEnv;

describe("resolveAiConfig", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveAiConfig(env({}))).toBeNull();
    expect(isAIConfigured(env({}))).toBe(false);
  });

  it("keeps working for anyone already using ANTHROPIC_API_KEY alone", () => {
    // Backwards compatibility is the whole point of this branch: adding
    // multi-provider support must not require an existing deployment to change
    // its configuration.
    const config = resolveAiConfig(env({ ANTHROPIC_API_KEY: "sk-ant-xxx" }));
    expect(config).toEqual({
      kind: "anthropic",
      apiKey: "sk-ant-xxx",
      model: "claude-opus-5",
      baseUrl: "",
    });
  });

  it("treats a bare AI_API_KEY as the OpenAI-compatible shape", () => {
    const config = resolveAiConfig(env({ AI_API_KEY: "sk-xxx", AI_MODEL: "gpt-4.1" }));
    expect(config?.kind).toBe("openai");
    expect(config?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("lets AI_PROVIDER override the inferred provider", () => {
    // An Anthropic key present but the operator explicitly wants Groq.
    const config = resolveAiConfig(
      env({
        AI_PROVIDER: "openai",
        ANTHROPIC_API_KEY: "sk-ant-xxx",
        AI_API_KEY: "gsk-xxx",
        AI_MODEL: "llama-3.3-70b",
        AI_BASE_URL: "https://api.groq.com/openai/v1",
      }),
    );
    expect(config?.kind).toBe("openai");
    expect(config?.apiKey).toBe("gsk-xxx");
    expect(config?.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it.each(["anthropic", "claude"])("accepts %j as Anthropic", (name) => {
    expect(resolveAiConfig(env({ AI_PROVIDER: name, AI_API_KEY: "k" }))?.kind).toBe(
      "anthropic",
    );
  });

  it.each(["openai", "openai-compatible", "compatible"])(
    "accepts %j as OpenAI-compatible",
    (name) => {
      expect(
        resolveAiConfig(env({ AI_PROVIDER: name, AI_API_KEY: "k", AI_MODEL: "m" }))?.kind,
      ).toBe("openai");
    },
  );

  it("is case-insensitive and tolerant of stray whitespace", () => {
    const config = resolveAiConfig(
      env({ AI_PROVIDER: "  OpenAI  ", AI_API_KEY: " k ", AI_MODEL: " m " }),
    );
    expect(config?.kind).toBe("openai");
    expect(config?.apiKey).toBe("k");
    expect(config?.model).toBe("m");
  });

  it("returns null for an unrecognised AI_PROVIDER rather than guessing", () => {
    // A typo must not silently route traffic to a provider the operator did not
    // ask for -- that is worse than the feature being off.
    expect(
      resolveAiConfig(env({ AI_PROVIDER: "opeanai", AI_API_KEY: "k", AI_MODEL: "m" })),
    ).toBeNull();
  });

  it("requires a model for the openai adapter, since there is no safe default", () => {
    // Defaulting to a specific OpenAI model would be wrong for Groq, Ollama and
    // every other endpoint that speaks the same shape.
    expect(resolveAiConfig(env({ AI_API_KEY: "k" }))).toBeNull();
  });

  it("defaults the model for Anthropic, where there is one", () => {
    expect(resolveAiConfig(env({ ANTHROPIC_API_KEY: "k" }))?.model).toBe("claude-opus-5");
  });

  it("lets AI_MODEL override the Anthropic default", () => {
    expect(
      resolveAiConfig(env({ ANTHROPIC_API_KEY: "k", AI_MODEL: "claude-sonnet-5" }))?.model,
    ).toBe("claude-sonnet-5");
  });

  it("prefers the provider-specific key so both can coexist while switching", () => {
    const config = resolveAiConfig(
      env({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "specific", AI_API_KEY: "generic" }),
    );
    expect(config?.apiKey).toBe("specific");
  });

  it("falls back to AI_API_KEY when the Anthropic-specific key is absent", () => {
    const config = resolveAiConfig(env({ AI_PROVIDER: "anthropic", AI_API_KEY: "generic" }));
    expect(config?.apiKey).toBe("generic");
  });

  it("strips trailing slashes from the base URL", () => {
    // Otherwise the endpoint becomes ".../v1//chat/completions", which some
    // gateways 404 on.
    const config = resolveAiConfig(
      env({ AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "http://localhost:11434/v1///" }),
    );
    expect(config?.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("treats an empty-string key as unconfigured", () => {
    // .env files routinely contain KEY="" -- which is not a key.
    expect(resolveAiConfig(env({ ANTHROPIC_API_KEY: "" }))).toBeNull();
    expect(resolveAiConfig(env({ AI_API_KEY: "   " }))).toBeNull();
  });

  it("supports a local Ollama with no real key", () => {
    // Ollama ignores the Authorization header, but our resolver still needs
    // something non-empty -- documented so nobody wonders why "ollama" is there.
    const config = resolveAiConfig(
      env({
        AI_PROVIDER: "openai",
        AI_API_KEY: "ollama",
        AI_MODEL: "llama3.2",
        AI_BASE_URL: "http://localhost:11434/v1",
      }),
    );
    expect(config).toEqual({
      kind: "openai",
      apiKey: "ollama",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
    });
  });
});
