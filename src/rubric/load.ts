import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Lens, RubricPack } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, "..", "..");
export const DEFAULT_PACK_DIR = join(PACKAGE_ROOT, "packs", "default");

const motionSchema = z.enum(["pre_sales", "post_sales"]);

const desiredOutcomeSchema = z.object({
  goal: z.string(),
  exitCriteria: z.array(z.string()),
  advanceSignal: z.string(),
});

const callTypeSchema = z.object({
  id: z.string(),
  motion: motionSchema,
  label: z.string(),
  description: z.string(),
  signals: z.array(z.string()),
  desiredOutcome: desiredOutcomeSchema,
  lenses: z.array(z.string()),
});

const scoringGuideSchema = z.object({
  "0": z.string(),
  "1": z.string(),
  "2": z.string(),
  "3": z.string(),
});

const dimensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  question: z.string(),
  scoringGuide: scoringGuideSchema,
});

const lensSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  dimensions: z.array(dimensionSchema).min(1),
});

const packMetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});

function readYaml(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function loadPack(dir: string = DEFAULT_PACK_DIR): RubricPack {
  const meta = packMetaSchema.parse(readYaml(join(dir, "pack.yaml")));
  const callTypes = z.array(callTypeSchema).min(1).parse(readYaml(join(dir, "call-types.yaml")));

  const lensesDir = join(dir, "lenses");
  const lensFiles = readdirSync(lensesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const lenses: Record<string, Lens> = {};
  for (const file of lensFiles) {
    const lens = lensSchema.parse(readYaml(join(lensesDir, file)));
    lenses[lens.id] = lens;
  }

  for (const callType of callTypes) {
    for (const lensId of callType.lenses) {
      if (!lenses[lensId]) {
        throw new Error(`Call type "${callType.id}" references unknown lens "${lensId}"`);
      }
    }
  }

  return { id: meta.id, label: meta.label, description: meta.description, callTypes, lenses };
}
