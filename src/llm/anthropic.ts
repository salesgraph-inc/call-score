import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, LlmProvider } from "./provider.js";

export function anthropicProvider(model: string, apiKey?: string): LlmProvider {
  const client = new Anthropic({ maxRetries: 4, ...(apiKey ? { apiKey } : {}) });

  return {
    id: "anthropic",
    model,
    async complete(req: CompletionRequest): Promise<string> {
      const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        messages: [{ role: "user", content: req.prompt }],
        ...(req.system ? { system: req.system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      });

      return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    },
  };
}
