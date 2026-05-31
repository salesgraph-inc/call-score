import { z } from "zod";
import { generateJson } from "../llm/provider.js";
import type { LlmProvider } from "../llm/provider.js";
import type { RubricPack } from "../rubric/types.js";
import type {
  CallAnalysis,
  DealOutcome,
  Playbook,
  PlaybookBenchmark,
  PlaybookCallTypeSection,
} from "../types.js";
import { looseString, looseStringArray } from "../pipeline/coerce.js";

const SYSTEM =
  "You distill a sales playbook from a corpus of already-analyzed calls. You generalize across calls, weight winning calls most heavily, and only use quotes that appear verbatim in the supplied data. You never invent quotes, sources, or numbers.";

function objectValuesToArray(keyName: string) {
  return (val: unknown): unknown => {
    if (Array.isArray(val) || val === undefined || val === null) return val;
    if (typeof val === "object") {
      return Object.entries(val as Record<string, unknown>).map(([k, v]) => ({
        [keyName]: k,
        ...(v && typeof v === "object" ? (v as Record<string, unknown>) : {}),
      }));
    }
    return val;
  };
}

const byCallTypeItem = z.object({
  callTypeId: looseString.default(""),
  whatGoodLooksLike: looseStringArray.default([]),
  commonGaps: looseStringArray.default([]),
  exemplars: z
    .array(z.object({ quote: looseString.default(""), why: looseString.default(""), source: looseString.default("") }))
    .default([]),
});

const schema = z.object({
  summary: looseString.default(""),
  byCallType: z.preprocess(objectValuesToArray("callTypeId"), z.array(byCallTypeItem)).default([]),
  recurringPains: z
    .array(z.object({ pain: looseString, frequency: z.number().int().default(1), examples: looseStringArray.default([]) }))
    .default([]),
  commonObjections: z
    .array(
      z.object({
        objection: looseString,
        recommendedResponse: looseString.default(""),
        frequency: z.number().int().default(1),
      }),
    )
    .default([]),
  winningQuestions: z
    .array(z.object({ question: looseString, rationale: looseString.default(""), callTypeId: looseString.default("") }))
    .default([]),
  valueNarratives: z
    .array(z.object({ theme: looseString, framing: looseString.default(""), proofPoints: looseStringArray.default([]) }))
    .default([]),
});

export async function buildPlaybook(args: {
  provider: LlmProvider;
  pack: RubricPack;
  analyses: CallAnalysis[];
}): Promise<Playbook> {
  const { provider, pack, analyses } = args;
  if (analyses.length === 0) throw new Error("cannot build a playbook from zero analyzed calls");

  const order = uniqueCallTypeIds(analyses);
  const digests = analyses.map(digestFor);

  const prompt = `You have ${analyses.length} analyzed sales calls. Distill a reusable playbook.

Each record below is the structured analysis of one call (NOT a raw transcript). Weight calls with dealOutcome "won" and high scores most heavily when deciding what good looks like.

ANALYZED CALLS (JSON):
${JSON.stringify(digests, null, 2)}

Produce:
- summary: 2-4 sentences on the state of these calls and the biggest team-wide opportunity.
- byCallType: for EACH distinct callType present, give whatGoodLooksLike (concrete behaviors the best calls showed), commonGaps (recurring misses), and exemplars (2-4 strong moves — quote MUST appear verbatim in a record's quotes, with its source filename and a short why).
- recurringPains: buyer pains that recur across calls, with frequency = how many calls mention them and 1-2 example sources.
- commonObjections: objections or risks that recur, each with a recommended response and frequency.
- winningQuestions: high-leverage questions or moves that correlated with progress, each tagged to a callTypeId.
- valueNarratives: the value themes that landed, each with framing and proofPoints.

Only use quotes present in the data. Attribute sources by their filename. Do not fabricate.

SHAPE: byCallType MUST be a JSON array of objects, each with a "callTypeId" field — not an object keyed by id. Every winningQuestions item MUST include a "callTypeId".`;

  const raw = await generateJson(provider, prompt, schema, { system: SYSTEM, maxTokens: 8000 });

  const byCallType: PlaybookCallTypeSection[] = order.map((id) => {
    const def = pack.callTypes.find((c) => c.id === id);
    const group = analyses.filter((a) => a.classification.callTypeId === id);
    const section = raw.byCallType.find((s) => s.callTypeId === id);
    return {
      callTypeId: id,
      label: def?.label ?? id,
      motion: def?.motion ?? "pre_sales",
      callsAnalyzed: group.length,
      whatGoodLooksLike: section?.whatGoodLooksLike ?? [],
      commonGaps: section?.commonGaps ?? [],
      exemplars: section?.exemplars ?? [],
      benchmarks: benchmarksFor(group),
    };
  });

  const outcomeBreakdown: Record<DealOutcome, number> = { won: 0, lost: 0, open: 0, unknown: 0 };
  for (const a of analyses) outcomeBreakdown[a.meta.dealOutcome] += 1;

  return {
    meta: {
      calls: analyses.length,
      sources: analyses.map((a) => a.meta.source),
      pack: pack.id,
      model: provider.model,
      generatedAt: new Date().toISOString(),
      outcomeBreakdown,
    },
    summary: raw.summary,
    byCallType,
    recurringPains: raw.recurringPains,
    commonObjections: raw.commonObjections,
    winningQuestions: raw.winningQuestions,
    valueNarratives: raw.valueNarratives,
  };
}

function uniqueCallTypeIds(analyses: CallAnalysis[]): string[] {
  const order: string[] = [];
  for (const a of analyses) {
    if (!order.includes(a.classification.callTypeId)) order.push(a.classification.callTypeId);
  }
  return order;
}

function digestFor(a: CallAnalysis) {
  return {
    source: a.meta.source,
    callType: a.classification.callTypeId,
    dealOutcome: a.meta.dealOutcome,
    achieved: a.outcome.achieved,
    advanceSecured: a.outcome.advanceSecured,
    missedCriteria: a.outcome.missedCriteria,
    gaps: [...a.outcome.gaps, ...a.coaching.gaps],
    strengths: a.coaching.strengths,
    topActions: a.coaching.topActions,
    scores: a.coaching.lenses.flatMap((l) =>
      l.dimensions.map((d) => ({ dimension: d.dimensionId, score: d.score })),
    ),
    quotes: a.coaching.lenses
      .flatMap((l) => l.dimensions.filter((d) => d.score >= 2).flatMap((d) => d.evidence.map((e) => e.quote)))
      .concat(a.outcome.evidence.map((e) => e.quote))
      .slice(0, 8),
  };
}

function benchmarksFor(analyses: CallAnalysis[]): PlaybookBenchmark[] {
  const acc = new Map<string, { lensId: string; dimensionId: string; label: string; sum: number; n: number }>();
  for (const a of analyses) {
    for (const lens of a.coaching.lenses) {
      for (const d of lens.dimensions) {
        const key = `${d.lensId}:${d.dimensionId}`;
        const cur = acc.get(key) ?? { lensId: d.lensId, dimensionId: d.dimensionId, label: d.label, sum: 0, n: 0 };
        cur.sum += d.score;
        cur.n += 1;
        acc.set(key, cur);
      }
    }
  }
  return [...acc.values()].map((v) => ({
    lensId: v.lensId,
    dimensionId: v.dimensionId,
    label: v.label,
    avgScore: Math.round((v.sum / v.n) * 100) / 100,
  }));
}
