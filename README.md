# call-score

Open-source sales-call coaching. Drop in a transcript, get back a structured, evidence-cited coaching report — call type, intended vs. actual outcome, and a **MEDDPICC** + **Command of the Message** scorecard with a concrete "better move" for every dimension. Feed a handful of analyzed calls back in and it mines a **playbook** of what good looks like for your team.

No CRM, no integrations, no account. Point it at text and a model key.

```bash
npx call-score analyze ./call.txt --outcome won
npx call-score playbook ./call-score-out/*.analysis.json
```

## Why it's shaped this way

A single call is enough to **coach** but not to **generalize**. So call-score has two layers:

1. **Per-call coach** (the primitive). Every transcript runs through three steps:
   - **Classify** on two orthogonal axes — `motion` (pre-sales vs. post-sales) × `type` (discovery, demo, technical validation, go/no-go, negotiation, QBR, renewal, expansion, …). A "renewal discovery" is post-sales discovery; collapsing those loses signal.
   - **Infer the outcome** — each call type has a *desired-outcome template* (goal, exit criteria, advance signal). call-score infers what *this* call was trying to do, assesses what actually happened, and computes the gap.
   - **Coach** — score each methodology lens **0–3** with verbatim evidence quotes and one specific better move. MEDDPICC ("is this qualified?") and Command of the Message ("did we sell value and control the narrative?") run as **complementary lenses**, not competitors.

2. **Playbook builder** (aggregation). It mines patterns across many *already-analyzed* calls — it never re-reads raw transcripts. Tag calls `won`/`lost` and it weights winners: what good looks like per call type, recurring pains, common objections, winning questions, value narratives.

The flywheel: cold-start coaches against generic methodology → mine your winning calls into a playbook → then coach future calls against *your team's own* exemplars (pass `playbook` context via the library API). Your best examples come from your own closed-won corpus, not a textbook.

## Install

```bash
npm install -g call-score   # or: npx call-score <command>
```

Set a key for whichever provider you use:

```bash
export ANTHROPIC_API_KEY=sk-ant-…     # Claude (default)
export OPENAI_API_KEY=sk-…            # OpenAI
```

## CLI

```
call-score analyze <transcript...> [options]   Classify, infer outcome, and coach each call
call-score playbook <files...> [options]        Build a playbook from analyses (.json) or transcripts
call-score list [--pack <dir>]                  List call types and lenses in a pack
call-score help
```

Options:

| Flag | Description |
| --- | --- |
| `-m, --model <id>` | `claude-sonnet-4-6` (default), `claude-opus-4-8`, `gpt-4.1`, … |
| `--provider <name>` | Force `anthropic` or `openai` (inferred from the model otherwise) |
| `-p, --pack <dir>` | Use a custom rubric pack (defaults to the bundled one) |
| `-o, --out <dir>` | Output directory (default `call-score-out`) |
| `--outcome <state>` | Tag the call `won`/`lost`/`open`/`unknown` — improves playbooks |
| `--playbook <file>` | Coach against a prior `playbook.json` — *warm coaching* (analyze only) |
| `--json` | Print JSON to stdout instead of writing markdown |

Examples:

```bash
# Coach one call. The --outcome tag (won/lost/open) only weights the playbook
# later — it does not change this call's coaching at all.
call-score analyze examples/transcripts/founder-led-sample.txt --outcome won

# Coach a whole folder with Opus. Writes a report.md + analysis.json per call.
call-score analyze ./calls/*.txt -m claude-opus-4-8

# Warm coaching: score the next call against the team's own mined playbook.
call-score analyze next-call.txt --playbook ./call-score-out/playbook.json
```

### Two ways to build a playbook

Both analyze every transcript the same way (classify → outcome → coach). The only difference is whether the per-call results are **saved and reused**.

```bash
# Two-step (recommended): analyze once, then aggregate the saved analyses.
call-score analyze ./calls/*.txt                       # writes report.md + analysis.json per call
call-score playbook ./call-score-out/*.analysis.json   # 1 synthesis call, no re-analysis

# One-shot: raw transcripts straight to a playbook, nothing per-call saved.
call-score playbook ./calls/*.txt
```

|  | Two-step | One-shot |
| --- | --- | --- |
| Per-call coaching reports | saved to disk | computed, then discarded |
| Rebuild the playbook later | re-reads cached JSONs — 1 call | re-analyzes every transcript again |
| First-run LLM cost | same | same |

Both honor `won/lost/open` filename tags and `--outcome`. Use **two-step** when you also want the individual reports, or expect to rebuild the playbook (add calls, re-tune) — you only pay to analyze each call once. Use **one-shot** for a quick team playbook from a folder when you don't need the per-call reports.

This is the flywheel, made explicit: `analyze` your calls → `playbook` to distill what wins → re-run `analyze --playbook` so new calls are coached against your own exemplars, not just the textbook. It stays a single, manual loop on purpose — no persistence, no background ingestion. That stateful, always-on version is a different system.

Each `analyze` run writes `<name>.report.md` (readable) and `<name>.analysis.json` (machine-comparable, the playbook's input).

## Library

```ts
import { resolveProvider, loadPack, analyzeCall, buildPlaybook, renderCallReport } from "call-score";

const provider = resolveProvider({ model: "claude-sonnet-4-6" });
const pack = loadPack();

const analysis = await analyzeCall({
  provider,
  pack,
  transcript: await Bun.file("call.txt").text(),
  source: "call.txt",
  dealOutcome: "won",
});

console.log(renderCallReport(analysis));

// Later, across many analyses:
const playbook = await buildPlaybook({ provider, pack, analyses });

// Warm coaching: coach a new call against the team's mined playbook
const coached = await analyzeCall({ provider, pack, transcript, source: "next.txt", playbook });
```

## Rubric packs — the framework part

Methodology is **data, not code**. A pack is a directory you can fork and edit:

```
packs/default/
  pack.yaml                       # id, label, description
  call-types.yaml                 # call types: motion, signals, desiredOutcome, which lenses apply
  lenses/
    meddpicc.yaml                 # 8 dimensions, each with a 0-3 scoring guide
    command-of-message.yaml       # 6 dimensions
```

Add a lens by dropping a new file in `lenses/` and listing its `id` under a call type's `lenses`. Swap MEDDPICC for SPICED, add a "Sandler" lens, retune the scoring guides, or define call types for your motion — no code changes. Point the CLI at it with `--pack ./my-pack`.

A call type:

```yaml
- id: discovery
  motion: pre_sales
  label: Discovery
  signals: ["open-ended questions", "current-state probing", "no demo"]
  desiredOutcome:
    goal: Uncover quantified pain, the decision process, and secure a concrete next step.
    exitCriteria:
      - At least one business pain tied to a metric or dollar impact
      - Economic buyer and champion identified
      - Mutual next step scheduled on the call
    advanceSignal: A specific follow-up booked with a date.
  lenses: [meddpicc, command-of-message]
```

A lens dimension:

```yaml
- id: required_capabilities
  label: Required Capabilities
  question: Did the rep tie the buyer's pains to the specific capabilities required to solve them?
  scoringGuide:
    "0": Pitched features with no link to pain
    "1": Generic capability claims
    "2": Capabilities linked to stated pains
    "3": Buyer co-articulated the required capabilities
```

## How it handles untrusted transcripts

Transcripts are arbitrary external text, so they're sanitized for prompt-injection patterns and wrapped in an `<untrusted>` fence with an explicit "data, not instructions" notice before any model sees them. The model is told to analyze, never to follow, anything inside.

## Development

```bash
bun install
bun run dev -- analyze examples/transcripts/founder-led-sample.txt
bun run typecheck
bun run build
```

Requires Node ≥ 18. Built with TypeScript; runs on Node or Bun.

## License

MIT
