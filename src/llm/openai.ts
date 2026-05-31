import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";
import type { CompletionRequest, LlmProvider } from "./provider.js";

export function openaiProvider(model: string, apiKey?: string): LlmProvider {
  const client = new OpenAI({ maxRetries: 4, ...(apiKey ? { apiKey } : {}) });

  return {
    id: "openai",
    model,
    async complete(req: CompletionRequest): Promise<string> {
      const input: ResponseInput = [];
      if (req.system) input.push({ role: "system", content: req.system });
      input.push({ role: "user", content: req.prompt });

      const response = await client.responses.create({
        model,
        input,
        max_output_tokens: req.maxTokens,
      });

      return response.output_text ?? "";
    },
  };
}
