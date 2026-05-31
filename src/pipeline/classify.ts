import { z } from "zod";
import { generateJson } from "../llm/provider.js";
import type { LlmProvider } from "../llm/provider.js";
import type { RubricPack } from "../rubric/types.js";
import type { Classification } from "../types.js";

const SYSTEM =
  "You are a precise sales-call classifier. You read a transcript and identify the single best-fit call type from a fixed catalog. You never invent call types outside the catalog.";

export async function classifyCall(args: {
  provider: LlmProvider;
  pack: RubricPack;
  transcript: string;
}): Promise<Classification> {
  const { provider, pack, transcript } = args;
  const ids = pack.callTypes.map((c) => c.id) as [string, ...string[]];
  const idEnum = z.enum(ids);

  const schema = z.object({
    callTypeId: idEnum,
    confidence: z.number().min(0).max(1).default(0.6),
    rationale: z.string().default(""),
    signals: z.array(z.string()).default([]),
    alternatives: z
      .array(z.object({ callTypeId: idEnum, confidence: z.number().min(0).max(1) }))
      .default([]),
  });

  const catalog = pack.callTypes
    .map(
      (c) => `- ${c.id} (${c.motion}) — ${c.label}: ${c.description} Signals: ${c.signals.join("; ")}.`,
    )
    .join("\n");

  const prompt = `Classify this sales call.

MOTION is the orthogonal pre-sales vs post-sales axis:
- pre_sales: the account has not bought yet (discovery through close).
- post_sales: an existing customer (onboarding through renewal or expansion).

CALL TYPE CATALOG (choose exactly one callTypeId):
${catalog}

TRANSCRIPT:
${transcript}

Pick the callTypeId whose signals best match the transcript. confidence is 0..1. signals = short cues drawn from the transcript that justify the choice. alternatives = up to 2 other plausible callTypeIds with their confidence. Never invent ids outside the catalog.`;

  const raw = await generateJson(provider, prompt, schema, { system: SYSTEM, maxTokens: 700 });
  const def = pack.callTypes.find((c) => c.id === raw.callTypeId);
  if (!def) throw new Error(`classifier returned unknown callTypeId: ${raw.callTypeId}`);

  return {
    motion: def.motion,
    callTypeId: def.id,
    label: def.label,
    confidence: raw.confidence,
    rationale: raw.rationale,
    signals: raw.signals,
    alternatives: raw.alternatives,
  };
}
