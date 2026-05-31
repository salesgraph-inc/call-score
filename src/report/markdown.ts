import type { CallAnalysis, EvidenceQuote, LensScore, Playbook } from "../types.js";

const ACHIEVED_LABEL: Record<CallAnalysis["outcome"]["achieved"], string> = {
  yes: "Achieved",
  partial: "Partially achieved",
  no: "Not achieved",
};

export function renderCallReport(a: CallAnalysis): string {
  const c = a.classification;
  const o = a.outcome;
  const lines: string[] = [];

  lines.push(`# Call coaching — ${a.meta.title ?? a.meta.source}`);
  lines.push("");
  lines.push(
    `**${c.label}** · ${c.motion === "pre_sales" ? "Pre-sales" : "Post-sales"} · classifier confidence ${pct(c.confidence)}`,
  );
  if (a.meta.date) lines.push(`Date: ${a.meta.date}`);
  lines.push(`Model: ${a.meta.model} · Pack: ${a.meta.pack}`);
  lines.push("");
  lines.push(`> ${a.coaching.headline}`);
  lines.push("");

  const style = a.coaching.sellingStyle;
  if (style && style.kind !== "unclear") {
    const styleLabel = style.kind === "founder_led" ? "Founder-led" : "Rep-led";
    lines.push(`**Style:** ${styleLabel}${style.note ? ` — ${style.note}` : ""}`);
    lines.push("");
  }

  lines.push("## Outcome");
  lines.push(`- **Intended:** ${o.intendedOutcome}`);
  lines.push(`- **Result:** ${ACHIEVED_LABEL[o.achieved]}`);
  lines.push(`- **Actual:** ${o.actualOutcome}`);
  lines.push(`- **Advance:** ${o.advanceSecured ? "Secured" : "Not secured"} — ${o.advanceDetail}`);
  if (o.metCriteria.length) lines.push(`- **Met:** ${o.metCriteria.join("; ")}`);
  if (o.missedCriteria.length) lines.push(`- **Missed:** ${o.missedCriteria.join("; ")}`);
  lines.push("");

  for (const lens of a.coaching.lenses) {
    lines.push(`## ${lens.label} — ${lens.average.toFixed(2)}/3`);
    lines.push("");
    lines.push("| Dimension | Score | Assessment |");
    lines.push("| --- | :---: | --- |");
    for (const d of lens.dimensions) {
      lines.push(`| ${d.label} | ${d.score}/3 | ${escapeCell(d.rationale)} |`);
    }
    lines.push("");
    const moves = lens.dimensions.filter((d) => d.betterMove.trim().length > 0 && d.score < 3);
    if (moves.length) {
      lines.push("**Better moves:**");
      for (const d of moves) lines.push(`- _${d.label}:_ ${d.betterMove}`);
      lines.push("");
    }
  }

  lines.push("## Coaching");
  lines.push(...bullets("Strengths", a.coaching.strengths));
  lines.push(...bullets("Gaps", a.coaching.gaps));
  lines.push(...numbered("Top actions", a.coaching.topActions));

  if (lensEvidence(a).length) {
    lines.push("## Evidence");
    for (const e of lensEvidence(a).slice(0, 8)) lines.push(`- ${formatQuote(e)}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function renderPlaybook(p: Playbook): string {
  const lines: string[] = [];
  const b = p.meta.outcomeBreakdown;

  lines.push(`# Sales playbook`);
  lines.push("");
  lines.push(
    `Built from **${p.meta.calls}** calls · won ${b.won} / lost ${b.lost} / open ${b.open} / unknown ${b.unknown}`,
  );
  lines.push(`Model: ${p.meta.model} · Pack: ${p.meta.pack}`);
  lines.push("");
  lines.push(p.summary);
  lines.push("");

  for (const section of p.byCallType) {
    lines.push(`## ${section.label} (${section.callsAnalyzed} call${section.callsAnalyzed === 1 ? "" : "s"})`);
    lines.push("");
    if (section.benchmarks.length) {
      lines.push("| Dimension | Avg score |");
      lines.push("| --- | :---: |");
      for (const bm of section.benchmarks) lines.push(`| ${bm.label} | ${bm.avgScore.toFixed(2)}/3 |`);
      lines.push("");
    }
    lines.push(...bullets("What good looks like", section.whatGoodLooksLike));
    lines.push(...bullets("Common gaps", section.commonGaps));
    if (section.exemplars.length) {
      lines.push("**Exemplar moves:**");
      for (const e of section.exemplars) lines.push(`- "${e.quote}" — ${e.why} _(${e.source})_`);
      lines.push("");
    }
  }

  if (p.recurringPains.length) {
    lines.push("## Recurring pains");
    for (const pain of p.recurringPains) {
      lines.push(`- **${pain.pain}** (${pain.frequency}×)${pain.examples.length ? ` — ${pain.examples.join(", ")}` : ""}`);
    }
    lines.push("");
  }

  if (p.commonObjections.length) {
    lines.push("## Common objections");
    for (const obj of p.commonObjections) {
      lines.push(`- **${obj.objection}** (${obj.frequency}×) → ${obj.recommendedResponse}`);
    }
    lines.push("");
  }

  if (p.winningQuestions.length) {
    lines.push("## Winning questions");
    for (const q of p.winningQuestions) {
      const tag = q.callTypeId ? `_(${q.callTypeId})_ ` : "";
      const why = q.rationale ? ` — ${q.rationale}` : "";
      lines.push(`- ${tag}${q.question}${why}`);
    }
    lines.push("");
  }

  if (p.valueNarratives.length) {
    lines.push("## Value narratives");
    for (const v of p.valueNarratives) {
      lines.push(`- **${v.theme}:** ${v.framing}${v.proofPoints.length ? ` — proof: ${v.proofPoints.join("; ")}` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function bullets(heading: string, items: string[]): string[] {
  if (!items.length) return [];
  return [`**${heading}:**`, ...items.map((i) => `- ${i}`), ""];
}

function numbered(heading: string, items: string[]): string[] {
  if (!items.length) return [];
  return [`**${heading}:**`, ...items.map((i, idx) => `${idx + 1}. ${i}`), ""];
}

function lensEvidence(a: CallAnalysis): EvidenceQuote[] {
  const seen = new Set<string>();
  const out: EvidenceQuote[] = [];
  const collect = (lenses: LensScore[]) => {
    for (const lens of lenses) {
      for (const d of lens.dimensions) {
        for (const e of d.evidence) {
          if (seen.has(e.quote)) continue;
          seen.add(e.quote);
          out.push(e);
        }
      }
    }
  };
  collect(a.coaching.lenses);
  return out;
}

function formatQuote(e: EvidenceQuote): string {
  return e.speaker ? `**${e.speaker}:** "${e.quote}"` : `"${e.quote}"`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
