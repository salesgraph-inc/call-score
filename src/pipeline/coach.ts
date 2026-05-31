import { z } from "zod";
import { generateJson } from "../llm/provider.js";
import type { LlmProvider } from "../llm/provider.js";
import type { CallTypeDef, RubricPack } from "../rubric/types.js";
import { lensesForCallType } from "../rubric/types.js";
import type { Classification, CoachingReport, DimensionScore, LensScore, Playbook, Score } from "../types.js";
import { evidenceSchema } from "./evidence.js";
import { looseString, looseStringArray } from "./coerce.js";

const SYSTEM =
  "You are a senior sales coach. You score a call against explicit rubrics, cite verbatim evidence, and give one concrete better move per dimension. You never inflate scores and never invent quotes. No signal means score 0.";

const dimScoreSchema = z.object({
  dimensionId: z.string(),
  lensId: z.string().optional(),
  score: z.coerce.number().int().min(0).max(3).catch(0),
  rationale: looseString.default(""),
  evidence: z.array(evidenceSchema).default([]),
  betterMove: looseString.default(""),
});

const schema = z.object({
  headline: looseString.default(""),
  sellingStyle: z
    .object({
      kind: z.enum(["founder_led", "rep_led", "unclear"]).catch("unclear").default("unclear"),
      note: looseString.default(""),
    })
    .default({ kind: "unclear", note: "" }),
  strengths: looseStringArray.default([]),
  gaps: looseStringArray.default([]),
  lenses: z
    .array(z.object({ lensId: z.string(), dimensions: z.array(dimScoreSchema).default([]) }))
    .default([]),
  scores: z.array(dimScoreSchema).default([]),
  topActions: looseStringArray.default([]),
});

export async function coachCall(args: {
  provider: LlmProvider;
  pack: RubricPack;
  callType: CallTypeDef;
  classification: Classification;
  transcript: string;
  playbook?: Playbook;
}): Promise<CoachingReport> {
  const { provider, pack, callType, classification, transcript, playbook } = args;
  const lenses = lensesForCallType(pack, callType);

  const rubricText = lenses
    .map((lens) => {
      const dims = lens.dimensions
        .map(
          (d) =>
            `  - ${d.id} — ${d.label}: ${d.question}\n      0=${d.scoringGuide["0"]}; 1=${d.scoringGuide["1"]}; 2=${d.scoringGuide["2"]}; 3=${d.scoringGuide["3"]}`,
        )
        .join("\n");
      return `## ${lens.label} (${lens.id})\n${lens.description}\nScore every dimension below:\n${dims}`;
    })
    .join("\n\n");

  const playbookBlock = buildPlaybookBlock(callType.id, playbook);

  const prompt = `Coach this "${callType.label}" call (${callType.motion}).

The desired outcome for this call type:
- Goal: ${callType.desiredOutcome.goal}
- Advance signal: ${callType.desiredOutcome.advanceSignal}
${playbookBlock}
SCORING RUBRICS — score every dimension of every lens below:
${rubricText}

TRANSCRIPT:
${transcript}

For each dimension:
- score 0..3 strictly per its guide. If the transcript has no signal, score 0 and say so.
- rationale: one tight sentence justifying the score.
- evidence: 0-3 items, each an object {"speaker": string, "quote": string} with a verbatim quote (none if score is 0).
- betterMove: one concrete, specific action the rep should take next time, tied to pain, value, or the advance. Not generic advice.

Return the scores as a "lenses" array — one object per lens: { "lensId": "<exact id>", "dimensions": [ { "dimensionId": "<exact id>", "score": 0-3, "rationale": string, "evidence": [...], "betterMove": string } ] }. Include every lens and every dimension listed above, using the exact ids.

Then:
- headline: one-line verdict on the call.
- sellingStyle: detect the selling style. kind = "founder_led" if the seller speaks as the company or founder, shows their own live product or account, and fluidly blends discovery and demo; "rep_led" if a quota-carrying rep runs a structured stage; otherwise "unclear". note: one sentence on how the style helped or hurt THIS call and what to lean into or guard against (e.g. founder-led authenticity is a strength but the demo energy can cost the advance).
- strengths: what the rep did well (most important first).
- gaps: what hurt the desired outcome (most important first).
- topActions: the 3 highest-leverage next moves for the rep, prioritized.`;

  const raw = await generateJson(provider, prompt, schema, { system: SYSTEM, maxTokens: 6000 });

  const found = new Map<string, z.infer<typeof dimScoreSchema>>();
  for (const group of raw.lenses) {
    for (const dim of group.dimensions) found.set(`${group.lensId}:${dim.dimensionId}`, dim);
  }
  for (const dim of raw.scores) {
    if (dim.lensId) found.set(`${dim.lensId}:${dim.dimensionId}`, dim);
  }

  const lensScores: LensScore[] = lenses.map((lens) => {
    const dimensions: DimensionScore[] = lens.dimensions.map((dim) => {
      const entry = found.get(`${lens.id}:${dim.id}`);
      return {
        lensId: lens.id,
        dimensionId: dim.id,
        label: dim.label,
        score: (entry ? entry.score : 0) as Score,
        rationale: entry?.rationale ?? "No signal in the transcript.",
        evidence: entry?.evidence ?? [],
        betterMove: entry?.betterMove ?? "",
      };
    });
    const average = dimensions.length
      ? dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
      : 0;
    return { lensId: lens.id, label: lens.label, dimensions, average: Math.round(average * 100) / 100 };
  });

  return {
    headline: raw.headline,
    sellingStyle: raw.sellingStyle,
    strengths: raw.strengths,
    gaps: raw.gaps,
    lenses: lensScores,
    topActions: raw.topActions,
  };
}

function buildPlaybookBlock(callTypeId: string, playbook?: Playbook): string {
  if (!playbook) return "";
  const section = playbook.byCallType.find((s) => s.callTypeId === callTypeId);
  if (!section) return "";
  const good = section.whatGoodLooksLike.slice(0, 6).map((g) => `- ${g}`).join("\n");
  const exemplars = section.exemplars
    .slice(0, 4)
    .map((e) => `- "${e.quote}" (${e.why})`)
    .join("\n");
  return `
WHAT GOOD LOOKS LIKE for this call type, mined from the team's own winning calls — coach toward these and let betterMove reference them:
${good}
${exemplars ? `Exemplar moves from winning calls:\n${exemplars}\n` : ""}`;
}
