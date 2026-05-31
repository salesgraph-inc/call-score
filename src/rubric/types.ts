import type { Motion } from "../types.js";

export interface DesiredOutcome {
  goal: string;
  exitCriteria: string[];
  advanceSignal: string;
}

export interface CallTypeDef {
  id: string;
  motion: Motion;
  label: string;
  description: string;
  signals: string[];
  desiredOutcome: DesiredOutcome;
  lenses: string[];
}

export interface ScoringGuide {
  "0": string;
  "1": string;
  "2": string;
  "3": string;
}

export interface DimensionDef {
  id: string;
  label: string;
  question: string;
  scoringGuide: ScoringGuide;
}

export interface Lens {
  id: string;
  label: string;
  description: string;
  dimensions: DimensionDef[];
}

export interface RubricPack {
  id: string;
  label: string;
  description: string;
  callTypes: CallTypeDef[];
  lenses: Record<string, Lens>;
}

export function callTypeById(pack: RubricPack, id: string): CallTypeDef | undefined {
  return pack.callTypes.find((c) => c.id === id);
}

export function lensesForCallType(pack: RubricPack, callType: CallTypeDef): Lens[] {
  return callType.lenses
    .map((lensId) => pack.lenses[lensId])
    .filter((lens): lens is Lens => Boolean(lens));
}
