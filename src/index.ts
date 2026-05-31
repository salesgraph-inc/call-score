export * from "./types.js";
export * from "./rubric/types.js";
export { loadPack, DEFAULT_PACK_DIR } from "./rubric/load.js";

export { resolveProvider, providerForModel, generateJson, DEFAULT_MODEL } from "./llm/index.js";
export type {
  LlmProvider,
  CompletionRequest,
  ProviderKind,
  ResolveProviderOptions,
} from "./llm/index.js";

export { analyzeCall } from "./pipeline/analyze.js";
export type { AnalyzeCallOptions } from "./pipeline/analyze.js";
export { classifyCall } from "./pipeline/classify.js";
export { assessOutcome } from "./pipeline/outcome.js";
export { coachCall } from "./pipeline/coach.js";

export { buildPlaybook } from "./playbook/build.js";

export { renderCallReport, renderPlaybook } from "./report/markdown.js";

export { sanitizeTranscript, wrapUntrusted } from "./security.js";
export type { SanitizeResult } from "./security.js";
