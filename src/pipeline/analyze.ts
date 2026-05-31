import { sanitizeTranscript, wrapUntrusted } from "../security.js";
import type { LlmProvider } from "../llm/provider.js";
import type { RubricPack } from "../rubric/types.js";
import type { CallAnalysis, DealOutcome, Playbook } from "../types.js";
import { classifyCall } from "./classify.js";
import { assessOutcome } from "./outcome.js";
import { coachCall } from "./coach.js";

export interface AnalyzeCallOptions {
  provider: LlmProvider;
  pack: RubricPack;
  transcript: string;
  source: string;
  title?: string;
  date?: string;
  dealOutcome?: DealOutcome;
  playbook?: Playbook;
}

export async function analyzeCall(opts: AnalyzeCallOptions): Promise<CallAnalysis> {
  const { provider, pack } = opts;
  const sanitized = sanitizeTranscript(opts.transcript);
  const wrapped = wrapUntrusted(sanitized.text);

  const classification = await classifyCall({ provider, pack, transcript: wrapped });
  const callType = pack.callTypes.find((c) => c.id === classification.callTypeId);
  if (!callType) throw new Error(`unknown call type after classification: ${classification.callTypeId}`);

  const [outcome, coaching] = await Promise.all([
    assessOutcome({ provider, callType, transcript: wrapped }),
    coachCall({ provider, pack, callType, classification, transcript: wrapped, playbook: opts.playbook }),
  ]);

  return {
    meta: {
      source: opts.source,
      title: opts.title,
      date: opts.date,
      analyzedAt: new Date().toISOString(),
      model: provider.model,
      pack: pack.id,
      dealOutcome: opts.dealOutcome ?? "unknown",
    },
    classification,
    outcome,
    coaching,
  };
}
