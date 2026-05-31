#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { DEFAULT_PACK_DIR, loadPack } from "./rubric/load.js";
import { resolveProvider, type ProviderKind } from "./llm/index.js";
import { analyzeCall } from "./pipeline/analyze.js";
import { buildPlaybook } from "./playbook/build.js";
import { renderCallReport, renderPlaybook } from "./report/markdown.js";
import type { CallAnalysis, DealOutcome, Playbook } from "./types.js";

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const ALIASES: Record<string, string> = { m: "model", o: "out", p: "pack" };

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token.startsWith("--") || (token.startsWith("-") && token.length === 2)) {
      const rawKey = token.startsWith("--") ? token.slice(2) : token.slice(1);
      const key = token.startsWith("--") ? rawKey : ALIASES[rawKey] ?? rawKey;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      _.push(token);
    }
  }
  return { _, flags };
}

const log = (msg: string): void => {
  process.stderr.write(`${msg}\n`);
};

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function packDir(flags: Args["flags"]): string {
  return str(flags.pack) ?? DEFAULT_PACK_DIR;
}

function makeProvider(flags: Args["flags"]) {
  try {
    return resolveProvider({
      model: str(flags.model),
      provider: str(flags.provider) as ProviderKind | undefined,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

function looksLikeAnalysis(value: unknown): value is CallAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Boolean(v.classification && v.outcome && v.coaching && v.meta);
}

function looksLikePlaybook(value: unknown): value is Playbook {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Boolean(v.meta && Array.isArray(v.byCallType));
}

function outcomeFromFilename(file: string): DealOutcome | undefined {
  const match = basename(file).toLowerCase().match(/(?:^|[.\-_])(won|lost|open)(?:[.\-_]|$)/);
  return match ? (match[1] as DealOutcome) : undefined;
}

function loadPlaybookFlag(flags: Args["flags"]): Playbook | undefined {
  const path = str(flags.playbook);
  if (!path) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!looksLikePlaybook(parsed)) fail(`${path} is not a playbook JSON`);
  return parsed;
}

async function runAnalyze(files: string[], flags: Args["flags"]): Promise<void> {
  if (!files.length) fail("analyze needs at least one transcript file");
  const pack = loadPack(packDir(flags));
  const playbook = loadPlaybookFlag(flags);
  const provider = makeProvider(flags);
  const asJson = Boolean(flags.json);
  const outDir = str(flags.out) ?? "call-score-out";
  const flagOutcome = str(flags.outcome) as DealOutcome | undefined;
  if (!asJson) mkdirSync(outDir, { recursive: true });
  if (playbook) log(`Warm coaching against playbook (${playbook.meta.calls} prior calls)`);

  let failures = 0;
  for (const file of files) {
    const dealOutcome = outcomeFromFilename(file) ?? flagOutcome ?? "unknown";
    log(`Analyzing ${file} [${dealOutcome}] (model ${provider.model}) …`);
    try {
      const transcript = readFileSync(file, "utf8");
      const analysis = await analyzeCall({
        provider,
        pack,
        transcript,
        source: basename(file),
        dealOutcome,
        playbook,
      });

      if (asJson) {
        process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
        continue;
      }

      const base = basename(file, extname(file));
      const jsonPath = join(outDir, `${base}.analysis.json`);
      const mdPath = join(outDir, `${base}.report.md`);
      writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
      writeFileSync(mdPath, renderCallReport(analysis));
      log(`  ${analysis.classification.label} · ${analysis.coaching.headline}`);
      log(`  wrote ${mdPath}`);
      log(`  wrote ${jsonPath}`);
    } catch (err) {
      failures += 1;
      log(`  failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures) log(`${failures} of ${files.length} file(s) failed`);
}

async function runPlaybook(files: string[], flags: Args["flags"]): Promise<void> {
  if (!files.length) fail("playbook needs analysis .json files or transcript files");
  const pack = loadPack(packDir(flags));
  const provider = makeProvider(flags);
  const analyses: CallAnalysis[] = [];

  for (const file of files) {
    if (extname(file).toLowerCase() === ".json") {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!looksLikeAnalysis(parsed)) fail(`${file} is not a call analysis JSON`);
      analyses.push(parsed);
    } else {
      log(`Analyzing ${file} …`);
      analyses.push(
        await analyzeCall({ provider, pack, transcript: readFileSync(file, "utf8"), source: basename(file) }),
      );
    }
  }

  log(`Building playbook from ${analyses.length} call${analyses.length === 1 ? "" : "s"} …`);
  const playbook = await buildPlaybook({ provider, pack, analyses });

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(playbook, null, 2)}\n`);
    return;
  }

  const outDir = str(flags.out) ?? "call-score-out";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "playbook.json"), JSON.stringify(playbook, null, 2));
  writeFileSync(join(outDir, "playbook.md"), renderPlaybook(playbook));
  log(`  wrote ${join(outDir, "playbook.md")}`);
  log(`  wrote ${join(outDir, "playbook.json")}`);
}

function runList(flags: Args["flags"]): void {
  const pack = loadPack(packDir(flags));
  log(`Pack: ${pack.label} (${pack.id})`);
  process.stdout.write("Call types:\n");
  for (const c of pack.callTypes) {
    process.stdout.write(`  ${c.id.padEnd(24)} [${c.motion}]  ${c.label}\n`);
  }
  process.stdout.write("Lenses:\n");
  for (const [id, lens] of Object.entries(pack.lenses)) {
    process.stdout.write(`  ${id.padEnd(24)} ${lens.dimensions.length} dimensions\n`);
  }
}

function printUsage(): void {
  process.stdout.write(`call-score — open-source sales-call coaching

Usage:
  call-score analyze <transcript...> [options]   Classify, infer outcome, and coach each call
  call-score playbook <files...> [options]        Build a playbook from analyses (.json) or transcripts
  call-score list [--pack <dir>]                  List call types and lenses in a pack
  call-score help                                 Show this help

Options:
  -m, --model <id>        Model id (e.g. claude-sonnet-4-6, claude-opus-4-8, gpt-4.1). Default: claude-sonnet-4-6
      --provider <name>   Force provider: anthropic | openai (inferred from model otherwise)
  -p, --pack <dir>        Rubric pack directory. Default: bundled pack
  -o, --out <dir>         Output directory for reports. Default: call-score-out
      --outcome <state>   Tag analyzed calls: won | lost | open | unknown (improves playbooks)
                          Per-file override: put a won/lost/open token in the filename
                          (e.g. acme-first-call.won.txt)
      --playbook <file>   Coach against a prior playbook.json — warm coaching (analyze only)
      --json              Print JSON to stdout instead of writing markdown reports

Environment:
  ANTHROPIC_API_KEY       Required for Claude models
  OPENAI_API_KEY          Required for OpenAI models
  CALL_SCORE_MODEL        Default model id

Examples:
  call-score analyze call.txt --outcome won
  call-score analyze ./calls/*.txt -m claude-opus-4-8
  call-score playbook ./call-score-out/*.analysis.json
  call-score analyze next-call.txt --playbook ./call-score-out/playbook.json
`);
}

async function main(): Promise<void> {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const command = _[0];

  if (!command || command === "help" || flags.help) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const rest = _.slice(1);
  switch (command) {
    case "analyze":
      await runAnalyze(rest, flags);
      break;
    case "playbook":
      await runPlaybook(rest, flags);
      break;
    case "list":
    case "packs":
      runList(flags);
      break;
    default:
      fail(`unknown command: ${command} (try "call-score help")`);
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
