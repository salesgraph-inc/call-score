import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
import type { LlmProvider } from "./provider.js";

export { generateJson } from "./provider.js";
export type { CompletionRequest, LlmProvider } from "./provider.js";

export type ProviderKind = "anthropic" | "openai";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function providerForModel(model: string): ProviderKind {
  const m = model.toLowerCase();
  if (m.startsWith("openai/") || m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("codex") || m.includes("-codex")) {
    return "openai";
  }
  return "anthropic";
}

export interface ResolveProviderOptions {
  model?: string;
  provider?: ProviderKind;
  apiKey?: string;
}

export function resolveProvider(opts: ResolveProviderOptions = {}): LlmProvider {
  const model = opts.model ?? process.env.CALL_SCORE_MODEL ?? DEFAULT_MODEL;
  const kind = opts.provider ?? providerForModel(model);
  const bareModel = model.replace(/^(anthropic|openai)\//, "");

  if (kind === "openai") {
    const key = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set (required for OpenAI models)");
    return openaiProvider(bareModel, key);
  }

  const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for Anthropic models)");
  return anthropicProvider(bareModel, key);
}
