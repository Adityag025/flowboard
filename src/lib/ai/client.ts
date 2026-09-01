import Anthropic from "@anthropic-ai/sdk";

/**
 * The model. Named once so a change is one edit rather than a grep.
 */
export const AI_MODEL = "claude-opus-5";

/**
 * Raised when the feature is asked for but no API key is configured.
 *
 * This is a normal, expected state -- a fresh clone has no key -- not a bug. It
 * is a distinct error type so the UI can say "AI is not configured" instead of
 * showing a generic failure, and so a missing key is never confused with a
 * request that actually failed.
 */
export class AIUnavailableError extends Error {
  constructor(message = "AI features are not configured on this server.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

/**
 * One client per process, for the same reason as the Prisma singleton: the SDK
 * holds an HTTP connection pool, and constructing one per request wastes
 * sockets.
 *
 * The SDK reads ANTHROPIC_API_KEY from the environment itself, so the key is
 * never passed around in our code.
 */
export function getAIClient(): Anthropic {
  if (!isAIConfigured()) {
    throw new AIUnavailableError();
  }
  client ??= new Anthropic();
  return client;
}
