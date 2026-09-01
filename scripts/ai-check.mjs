/**
 * Reports whether AI is configured and reachable, without spending a request on
 * a paid provider.
 *
 * Exists because "the AI panel says not configured" has several distinct causes
 * -- no key, a typo in AI_PROVIDER, a model that was never pulled, Ollama not
 * running -- and they are indistinguishable from the UI.
 *
 * Run with: npm run ai:check
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
const apiKey = process.env.AI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.AI_MODEL?.trim();
const baseUrl = process.env.AI_BASE_URL?.trim()?.replace(/\/+$/, "");

const inferred =
  provider || (process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic (inferred)" : apiKey ? "openai (inferred)" : "none");

console.log(`provider : ${inferred}`);
console.log(`model    : ${model || "(default)"}`);
console.log(`baseUrl  : ${baseUrl || "(provider default)"}`);
console.log(`api key  : ${apiKey ? "set" : "MISSING"}`);

if (!apiKey) {
  console.log("\nAI is disabled. The app still works; the AI panels show a note.");
  process.exit(0);
}

// Only the OpenAI-compatible path can be probed for free -- listing models on a
// local Ollama costs nothing. Hitting a paid provider just to check config would
// bill the user for a health check.
if (!baseUrl) {
  console.log("\nNo AI_BASE_URL, so this is a hosted provider -- not probing it (that would cost a request).");
  process.exit(0);
}

try {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    console.log(`\nEndpoint reachable but returned ${response.status}.`);
    process.exit(1);
  }

  const body = await response.json();
  const ids = (body.data ?? []).map((m) => m.id);
  console.log(`\nreachable: yes (${ids.length} model${ids.length === 1 ? "" : "s"} available)`);
  if (ids.length > 0) console.log(`available: ${ids.join(", ")}`);

  if (model && ids.length > 0 && !ids.includes(model)) {
    console.log(`\nWARNING: AI_MODEL="${model}" is not in that list. Pull it with:  npm run ai:pull`);
    process.exit(1);
  }
  console.log("\nAI is configured and reachable.");
} catch (error) {
  console.log(`\nCould not reach ${baseUrl} -- ${error.message}`);
  console.log("If this is Ollama, start it with:  ollama serve");
  process.exit(1);
}
