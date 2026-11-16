import type { Locale } from '../../i18n';
import type { INTENTS, REASON_CODES, STATUSES, TOPICS } from './assistant.config';
import type { ReadPlan } from './plan';

export type Intent = typeof INTENTS[number];
export type TutorTopic = typeof TOPICS[number];
export type ReasonCode = typeof REASON_CODES[number];
export type Status = typeof STATUSES[number];
export interface TokenUsage { readonly input_tokens: number | null; readonly output_tokens: number | null; readonly total_tokens: number | null }
export interface TextPolicy { readonly version: string; readonly provider: string; readonly terms_url: string; readonly max_text_characters: number; readonly max_output_tokens: number }
export interface Consent { readonly version: string; readonly accepted: true }

interface BaseQuestion { readonly intent: Intent; readonly locale: Locale; readonly tz: string; readonly limit: number }
interface Period { readonly since: string | null; readonly until: string | null }
interface Cursor { readonly before: string | null; readonly after_id: string | null }
export type Question =
  | (BaseQuestion & Period & Cursor & { readonly intent: 'detections'; readonly species: string | null; readonly review: 'all' | 'pending' })
  | (BaseQuestion & Period & { readonly intent: 'species'; readonly species: string | null; readonly after_species: string | null })
  | (BaseQuestion & Period & Cursor & { readonly intent: 'outings' })
  | (BaseQuestion & Period & Cursor & { readonly intent: 'observations'; readonly species: string | null; readonly outing_id: string | null })
  | (BaseQuestion & Cursor & { readonly intent: 'collections' })
  | (BaseQuestion & { readonly intent: 'wishlist'; readonly species: string | null; readonly after_species: string | null })
  | CompareQuestion;

export interface ComparedPeriod { readonly since: string; readonly until: string }
export interface CompareQuestion {
  readonly intent: 'compare'; readonly locale: Locale; readonly tz: string; readonly limit: number;
  readonly species: string | null; readonly first: ComparedPeriod; readonly second: ComparedPeriod;
}
export interface PeriodSummary extends ComparedPeriod { readonly detections: number; readonly species: number; readonly observations: number; readonly observedSpecies: number }
/** Two periods side by side, every figure computed by the API (ADR-47). */
export interface CompareAnswer {
  readonly intent: 'compare'; readonly species: string | null; readonly first: PeriodSummary; readonly second: PeriodSummary;
  readonly onlyFirst: readonly string[]; readonly onlySecond: readonly string[]; readonly hasMore: boolean;
}

export type ResultRow =
  | { readonly kind: 'detection'; readonly id: string; readonly species: string; readonly at: string; readonly confidence: number; readonly status: Status; readonly hasRecording: boolean }
  | { readonly kind: 'species'; readonly species: string; readonly detections: number; readonly bestConfidence: number; readonly firstAt: string; readonly lastAt: string }
  | { readonly kind: 'outing'; readonly id: string; readonly version: number; readonly title: string | null; readonly outingKind: 'stationary' | 'walk' | 'import'; readonly at: string; readonly endedAt: string | null; readonly detections: number; readonly observations: number; readonly species: number }
  | { readonly kind: 'observation'; readonly id: string; readonly version: number; readonly source: 'manual'; readonly species: string; readonly at: string; readonly individuals: number | null; readonly outingId: string | null }
  | { readonly kind: 'collection'; readonly id: string; readonly version: number; readonly name: string; readonly at: string; readonly updatedAt: string; readonly items: number }
  | { readonly kind: 'wish'; readonly species: string; readonly at: string };
export interface QueryAnswer { readonly intent: Intent; readonly filters: Readonly<Record<string, string | null>>; readonly totals: Readonly<Record<string, number>>; readonly rows: readonly ResultRow[]; readonly hasMore: boolean }
export interface Source { readonly name: string; readonly url: string | null; readonly license: string | null }
export interface TutorAnswer { readonly topic: TutorTopic; readonly species: string | null; readonly locale: Locale; readonly paragraphs: readonly string[]; readonly sources: readonly Source[]; readonly model: string; readonly generatedAt: string; readonly usage: TokenUsage }
export interface Measurement { readonly model: string; readonly generatedAt: string; readonly usage: TokenUsage }
export type JournalAnswer = QueryAnswer | CompareAnswer;
export type Interpretation = (Measurement & { readonly status: 'ready'; readonly query: Question; readonly plan: ReadPlan }) |
  (Measurement & { readonly status: 'clarification' | 'rejected'; readonly reasonCode: ReasonCode });
export type TutorResponse = { readonly status: 'answered'; readonly answer: TutorAnswer } |
  (Measurement & { readonly status: 'rejected'; readonly topic: TutorTopic; readonly species: string | null; readonly locale: Locale; readonly reasonCode: ReasonCode });
export type Failure = 'network' | 'timeout' | 'auth' | 'secondStep' | 'quota' | 'unavailable' | 'source' | 'invalid' | 'policyChanged' | 'consent' | 'storage';
