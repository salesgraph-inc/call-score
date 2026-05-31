import type { z } from "zod";

export interface CompletionRequest {
  system?: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
}

const JSON_INSTRUCTION = "\n\nReturn ONLY a single valid JSON object. No prose, no markdown, no code fences, no commentary before or after.";
const RETRY_INSTRUCTION = "\n\nYour previous response was not valid JSON matching the required schema. Return ONLY the JSON object, nothing else.";

export async function generateJson<S extends z.ZodTypeAny>(
  provider: LlmProvider,
  prompt: string,
  schema: S,
  opts: { system?: string; maxTokens?: number } = {},
): Promise<z.infer<S>> {
  const base: CompletionRequest = {
    system: opts.system,
    prompt: prompt + JSON_INSTRUCTION,
    maxTokens: opts.maxTokens ?? 2000,
    jsonMode: true,
  };

  try {
    const text = await provider.complete(base);
    if (process.env.CALL_SCORE_DEBUG) process.stderr.write(`[llm-raw]\n${text.slice(0, 6000)}\n[/llm-raw]\n`);
    return parseJson(text, schema);
  } catch (firstError) {
    try {
      return parseJson(await provider.complete({ ...base, prompt: base.prompt + RETRY_INSTRUCTION }), schema);
    } catch (retryError) {
      const detail = retryError instanceof Error ? retryError.message : String(retryError);
      const first = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(`generateJson failed after retry: ${detail} (first attempt: ${first})`);
    }
  }
}

function parseJson<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    parsed = JSON.parse(repairJson(match[0]));
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

function repairJson(input: string): string {
  return input.replace(/,(\s*[}\]])/g, "$1");
}
