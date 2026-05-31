export type Motion = "pre_sales" | "post_sales";

export type Score = 0 | 1 | 2 | 3;

export type OutcomeAchievement = "yes" | "partial" | "no";

export type DealOutcome = "won" | "lost" | "open" | "unknown";

export interface EvidenceQuote {
  speaker?: string;
  quote: string;
}

export interface Classification {
  motion: Motion;
  callTypeId: string;
  label: string;
  confidence: number;
  rationale: string;
  signals: string[];
  alternatives: { callTypeId: string; confidence: number }[];
}

export interface OutcomeAssessment {
  intendedOutcome: string;
  desiredExitCriteria: string[];
  metCriteria: string[];
  missedCriteria: string[];
  actualOutcome: string;
  achieved: OutcomeAchievement;
  advanceSecured: boolean;
  advanceDetail: string;
  gaps: string[];
  evidence: EvidenceQuote[];
}

export interface DimensionScore {
  lensId: string;
  dimensionId: string;
  label: string;
  score: Score;
  rationale: string;
  evidence: EvidenceQuote[];
  betterMove: string;
}

export interface LensScore {
  lensId: string;
  label: string;
  dimensions: DimensionScore[];
  average: number;
}

export interface SellingStyle {
  kind: "founder_led" | "rep_led" | "unclear";
  note: string;
}

export interface CoachingReport {
  headline: string;
  sellingStyle: SellingStyle;
  strengths: string[];
  gaps: string[];
  lenses: LensScore[];
  topActions: string[];
}

export interface CallMeta {
  source: string;
  title?: string;
  date?: string;
  analyzedAt?: string;
  model: string;
  pack: string;
  dealOutcome: DealOutcome;
}

export interface CallAnalysis {
  meta: CallMeta;
  classification: Classification;
  outcome: OutcomeAssessment;
  coaching: CoachingReport;
}

export interface PlaybookExemplar {
  quote: string;
  why: string;
  source: string;
}

export interface PlaybookBenchmark {
  lensId: string;
  dimensionId: string;
  label: string;
  avgScore: number;
}

export interface PlaybookCallTypeSection {
  callTypeId: string;
  label: string;
  motion: Motion;
  callsAnalyzed: number;
  whatGoodLooksLike: string[];
  commonGaps: string[];
  exemplars: PlaybookExemplar[];
  benchmarks: PlaybookBenchmark[];
}

export interface RecurringPain {
  pain: string;
  frequency: number;
  examples: string[];
}

export interface CommonObjection {
  objection: string;
  recommendedResponse: string;
  frequency: number;
}

export interface WinningQuestion {
  question: string;
  rationale: string;
  callTypeId: string;
}

export interface ValueNarrative {
  theme: string;
  framing: string;
  proofPoints: string[];
}

export interface PlaybookMeta {
  calls: number;
  sources: string[];
  pack: string;
  model: string;
  generatedAt?: string;
  outcomeBreakdown: Record<DealOutcome, number>;
}

export interface Playbook {
  meta: PlaybookMeta;
  summary: string;
  byCallType: PlaybookCallTypeSection[];
  recurringPains: RecurringPain[];
  commonObjections: CommonObjection[];
  winningQuestions: WinningQuestion[];
  valueNarratives: ValueNarrative[];
}
