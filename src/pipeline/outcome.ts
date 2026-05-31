import { z } from "zod";
import { generateJson } from "../llm/provider.js";
import type { LlmProvider } from "../llm/provider.js";
import type { CallTypeDef } from "../rubric/types.js";
import type { OutcomeAssessment } from "../types.js";
import { evidenceSchema } from "./evidence.js";
import { looseString, looseStringArray } from "./coerce.js";

const SYSTEM =
  "You assess whether a sales call achieved its intended outcome. You reason only from the transcript and never invent facts. Missing evidence means the criterion was not met.";

const schema = z.object({
  intendedOutcome: looseString.default(""),
  metCriteria: looseStringArray.default([]),
  missedCriteria: looseStringArray.default([]),
  actualOutcome: looseString.default(""),
  achieved: z.enum(["yes", "partial", "no"]).default("no"),
  advanceSecured: z.boolean().default(false),
  advanceDetail: looseString.default(""),
  gaps: looseStringArray.default([]),
  evidence: z.array(evidenceSchema).default([]),
});

export async function assessOutcome(args: {
  provider: LlmProvider;
  callType: CallTypeDef;
  transcript: string;
}): Promise<OutcomeAssessment> {
  const { provider, callType, transcript } = args;
  const { desiredOutcome } = callType;

  const prompt = `This is a "${callType.label}" call (${callType.motion}).

The desired outcome for this call type:
- Goal: ${desiredOutcome.goal}
- Exit criteria:
${desiredOutcome.exitCriteria.map((c) => `  - ${c}`).join("\n")}
- Advance signal: ${desiredOutcome.advanceSignal}

TRANSCRIPT:
${transcript}

Assess this specific call:
- intendedOutcome: in one sentence, what THIS call was actually trying to achieve (contextualize the goal to what happened).
- metCriteria / missedCriteria: split the exit criteria above into those clearly met vs not met by the transcript. Quote the exact criterion text.
- actualOutcome: what actually happened by the end of the call.
- achieved: "yes" if all key criteria met, "partial" if some, "no" if few or none.
- advanceSecured: true only if a specific, time-bound next step was committed. advanceDetail: describe it, or why none.
- gaps: the most important things the rep failed to accomplish against the desired outcome.
- evidence: 2-5 items, each an object {"speaker": string, "quote": string} with a short verbatim quote.`;

  const raw = await generateJson(provider, prompt, schema, { system: SYSTEM, maxTokens: 1400 });

  return {
    intendedOutcome: raw.intendedOutcome,
    desiredExitCriteria: desiredOutcome.exitCriteria,
    metCriteria: raw.metCriteria,
    missedCriteria: raw.missedCriteria,
    actualOutcome: raw.actualOutcome,
    achieved: raw.achieved,
    advanceSecured: raw.advanceSecured,
    advanceDetail: raw.advanceDetail,
    gaps: raw.gaps,
    evidence: raw.evidence,
  };
}
