import { PlannerConfig } from '../core';

// A single keyword->weight-delta rule. Rules are applied in order over the
// base config; multiple matching rules in one prompt compose additively.
export interface PromptRule {
  readonly pattern: RegExp;
  readonly apply: (config: PlannerConfig) => PlannerConfig;
  readonly description: string;
}

// Gemini's structured output, ALREADY validated and clamped to these exact
// ranges (see validateGeminiIntent in lib.ts) — never the raw, untrusted
// model response. Deliberately a small set of bounded, named intents rather
// than raw PlannerConfig fields: the LLM's job is understanding nuanced
// language, not picking safe numeric weights — that logic stays in
// applyGeminiIntent(), reusing the same bounded transforms PROMPT_RULES use.
export interface GeminiIntent {
  readonly guitarPresence: number; // -1 (avoid) .. 1 (favor strongly)
  readonly vocalPresence: number; // -1 .. 1
  readonly danceability: number; // -1 .. 1
  readonly energyLevel: number; // -1 (chill) .. 1 (energetic)
  readonly smoothness: number; // 0 .. 1, how much to prioritize smooth transitions
  readonly diversity: number; // 0 .. 1, how much to favor pulling from different songs
  readonly targetDurationSec: number | null; // explicit duration if the prompt implies one
}

export interface GeminiOptions {
  /** Falls back to process.env.GEMINI_API_KEY. If neither is set, interpretPromptWithGemini() degrades to the deterministic interpretPrompt(). */
  readonly apiKey?: string;
  readonly model?: string;
  /**
   * Test seam: inject a fake content-generation call instead of hitting the
   * real Gemini API. Production callers should never need this — the real
   * implementation is the default when omitted.
   */
  readonly generateContentFn?: (args: { apiKey: string; model: string; prompt: string }) => Promise<string | undefined>;
}
