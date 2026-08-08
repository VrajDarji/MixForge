import { GoogleGenAI, Type } from '@google/genai';
import { HardConstraint, PlannerConfig } from '../core';
import { GeminiIntent, GeminiOptions, PromptRule } from './types';
import { clamp } from './utils';

// SearchResources.history already records every chunk visited (ADR-007
// Class C) — checking it here is enough to guarantee no chunk plays twice
// in one remix, without any new planner/scorer plumbing. This substitutes
// for PlannerConfig.pathObjectiveWeights.repetitionPenalty, which remains
// unimplemented (see below) — a hard "never repeat" rule is simpler and
// more predictable than a soft, tunable penalty, and was cheap to verify
// against real usage (a real remix was visibly repeating chunks 2-3x with
// no repetition guard at all).
//
// `resources` here is the state AFTER traversing `edge` (per HardConstraint's
// contract), so `resources.currentNodeId` is `edge.to` and already appears
// once in `resources.history` — a length > 1 means it appeared before this
// occurrence too, i.e. a genuine repeat.
export const NO_REPEAT_CHUNK_CONSTRAINT: HardConstraint = {
  name: 'no-repeat-chunk',
  check: (_edge, resources) => resources.history.filter((id) => id === resources.currentNodeId).length <= 1,
};

// A sensible, mostly-neutral baseline. AI only ever produces a *diff* from
// this via interpretPrompt() — it never touches the graph or planner
// algorithm (design.md §18).
export function defaultPlannerConfig(): PlannerConfig {
  return {
    hardConstraints: [NO_REPEAT_CHUNK_CONSTRAINT],
    nodeWeights: {
      bpm: 0, key: 0, energy: 0.5, loudnessLufs: 0, guitarPresence: 0,
      vocalPresence: 0, danceability: 0.5, sectionType: 0, embedding: 0, genreDistribution: 0,
    },
    edgeWeights: {
      bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
      embeddingSimilarity: 1, loudnessDelta: 1, estimatedCrossfadeSec: 0, // unused by evaluateEdge — see src/scorer/lib.ts
    },
    // repetitionPenalty is currently unimplemented anywhere in the scorer or
    // planner (see src/scorer/lib.ts's evaluatePath comment) — defaulting
    // it to 0 rather than implying it does something.
    pathObjectiveWeights: { energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 0 },
    targetDurationSec: 1800,
    targetEnergyCurve: [0.3, 0.5, 0.7, 0.9, 0.7, 0.5],
    durationToleranceSec: 60,
  };
}

function scaleEnergyCurve(config: PlannerConfig, factor: number): PlannerConfig {
  return {
    ...config,
    targetEnergyCurve: config.targetEnergyCurve.map((v) => clamp(v * factor, 0, 1)),
    pathObjectiveWeights: {
      ...config.pathObjectiveWeights,
      energyCurveAdherence: Math.max(config.pathObjectiveWeights.energyCurveAdherence, 1),
    },
  };
}

// Keyword -> PlannerConfig-diff rules. Only touches levers the scorer (Phase
// 3) and planner (Phase 4) actually consume — e.g. nodeWeights.sectionType
// is deliberately never targeted here, since Phase 3's evaluateNode() only
// scores numeric signals (bpm/energy/loudnessLufs/guitarPresence/
// vocalPresence/danceability); a sectionType weight would be a silent no-op.
export const PROMPT_RULES: readonly PromptRule[] = [
  {
    pattern: /guitar/i,
    description: 'more guitar-forward chunks',
    apply: (c) => ({ ...c, nodeWeights: { ...c.nodeWeights, guitarPresence: c.nodeWeights.guitarPresence + 1.5 } }),
  },
  {
    pattern: /vocal/i,
    description: 'more vocal-forward chunks',
    apply: (c) => ({ ...c, nodeWeights: { ...c.nodeWeights, vocalPresence: c.nodeWeights.vocalPresence + 1.5 } }),
  },
  {
    pattern: /danceable|dance/i,
    description: 'favor danceable chunks',
    apply: (c) => ({ ...c, nodeWeights: { ...c.nodeWeights, danceability: c.nodeWeights.danceability + 1.0 } }),
  },
  {
    pattern: /energetic|high[- ]energy|upbeat|pump/i,
    description: 'raise the target energy curve',
    apply: (c) => scaleEnergyCurve(c, 1.3),
  },
  {
    pattern: /chill|calm|mellow|low[- ]energy|relax/i,
    description: 'lower the target energy curve',
    apply: (c) => scaleEnergyCurve(c, 0.6),
  },
  {
    pattern: /smooth|seamless/i,
    description: 'weight transition smoothness (beat alignment + embedding similarity) more heavily',
    apply: (c) => ({
      ...c,
      edgeWeights: { ...c.edgeWeights, beatAlignment: c.edgeWeights.beatAlignment + 1, embeddingSimilarity: c.edgeWeights.embeddingSimilarity + 1 },
    }),
  },
  {
    pattern: /variety|diverse|mix it up|different songs/i,
    description: 'favor song diversity',
    apply: (c) => ({ ...c, pathObjectiveWeights: { ...c.pathObjectiveWeights, diversity: c.pathObjectiveWeights.diversity + 1 } }),
  },
  {
    pattern: /short (mix|set)|quick (mix|set)/i,
    description: 'target a shorter duration',
    apply: (c) => ({ ...c, targetDurationSec: Math.min(c.targetDurationSec, 600) }),
  },
  {
    pattern: /long (mix|set)|extended (mix|set)|marathon/i,
    description: 'target a longer duration',
    apply: (c) => ({ ...c, targetDurationSec: Math.max(c.targetDurationSec, 3600) }),
  },
];

// Malformed/unsupported prompts degrade gracefully to the base config
// rather than throwing — per docs/implementation.md §11's acceptance bar.
export function interpretPrompt(prompt: unknown, base: PlannerConfig = defaultPlannerConfig()): PlannerConfig {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return base;

  let config = base;
  for (const rule of PROMPT_RULES) {
    if (rule.pattern.test(prompt)) config = rule.apply(config);
  }
  return config;
}

// ============================================================================
// Gemini — optional, richer prompt interpretation (design.md §18: "AI
// configures preferences only", "swap in an LLM-based interpreter later...
// with zero changes to the graph or planner"). This is exactly that swap.
//
// Gemini is asked for a small set of BOUNDED, NAMED intents (see
// GeminiIntent in types.ts) — never raw PlannerConfig numbers. The model's
// job is understanding nuanced language ("something moody for a rainy
// drive"); translating an intent into safe, bounded weight deltas is
// deterministic code (applyGeminiIntent, below), reusing the same
// magnitudes PROMPT_RULES already uses. Schema-constrained JSON output
// guarantees shape; validateGeminiIntent() still clamps every value,
// because a schema guarantees types, not that a NUMBER field actually
// landed in the range its description asked for.
// ============================================================================

const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';

const GEMINI_SYSTEM_INSTRUCTION =
  'You configure music remix preferences for MixForge, an automatic DJ mix generator. ' +
  'Given a free-text description of the desired mix, output your best estimate of the ' +
  "user's preferences on the given normalized scales. Use 0 (or null for targetDurationSec) " +
  "for any dimension the prompt does not express an opinion on — do not invent preferences " +
  'the prompt does not imply.';

const GEMINI_INTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    guitarPresence: { type: Type.NUMBER, description: '-1 (avoid guitars) to 1 (strongly favor guitar-forward chunks), 0 = no preference' },
    vocalPresence: { type: Type.NUMBER, description: '-1 to 1, vocal-forward preference, 0 = no preference' },
    danceability: { type: Type.NUMBER, description: '-1 to 1, danceability preference, 0 = no preference' },
    energyLevel: { type: Type.NUMBER, description: '-1 (calm/chill) to 1 (high energy/upbeat), 0 = no preference' },
    smoothness: { type: Type.NUMBER, description: '0 to 1, how much to prioritize smooth/seamless transitions' },
    diversity: { type: Type.NUMBER, description: '0 to 1, how much to favor pulling chunks from different songs rather than staying on one' },
    targetDurationSec: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Explicit target mix duration in seconds if the prompt states or implies one (e.g. "5 minutes" -> 300); null if not mentioned',
    },
  },
  required: ['guitarPresence', 'vocalPresence', 'danceability', 'energyLevel', 'smoothness', 'diversity'],
};

// The real Gemini call — the default for GeminiOptions.generateContentFn.
// Kept as a separate, replaceable function specifically so tests can inject
// a fake implementation instead of hitting the network (see GeminiOptions's
// doc comment in types.ts).
async function defaultGenerateContent(args: { apiKey: string; model: string; prompt: string }): Promise<string | undefined> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const response = await ai.models.generateContent({
    model: args.model,
    contents: args.prompt,
    config: {
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_INTENT_SCHEMA,
    },
  });
  return response.text;
}

// Never trusts the parsed JSON's value ranges just because the schema
// constrained its shape — every field is independently clamped.
function validateGeminiIntent(raw: unknown): GeminiIntent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const boundedNumber = (value: unknown, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : 0;

  const durationSec = obj.targetDurationSec;
  const validDuration = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;

  return {
    guitarPresence: boundedNumber(obj.guitarPresence, -1, 1),
    vocalPresence: boundedNumber(obj.vocalPresence, -1, 1),
    danceability: boundedNumber(obj.danceability, -1, 1),
    energyLevel: boundedNumber(obj.energyLevel, -1, 1),
    smoothness: boundedNumber(obj.smoothness, 0, 1),
    diversity: boundedNumber(obj.diversity, 0, 1),
    targetDurationSec: validDuration,
  };
}

// Applies a validated intent using the exact same bounded magnitudes
// PROMPT_RULES uses (e.g. +/-1.5 on a presence weight, 1.3x/0.6x on the
// energy curve at full intensity) — Gemini only ever picks a *fraction* of
// an already-vetted, already-tested transform, never an arbitrary value.
function applyGeminiIntent(config: PlannerConfig, intent: GeminiIntent): PlannerConfig {
  let result = config;

  if (intent.guitarPresence !== 0) {
    result = { ...result, nodeWeights: { ...result.nodeWeights, guitarPresence: result.nodeWeights.guitarPresence + intent.guitarPresence * 1.5 } };
  }
  if (intent.vocalPresence !== 0) {
    result = { ...result, nodeWeights: { ...result.nodeWeights, vocalPresence: result.nodeWeights.vocalPresence + intent.vocalPresence * 1.5 } };
  }
  if (intent.danceability !== 0) {
    result = { ...result, nodeWeights: { ...result.nodeWeights, danceability: result.nodeWeights.danceability + intent.danceability * 1.0 } };
  }
  if (intent.energyLevel > 0) {
    result = scaleEnergyCurve(result, 1 + intent.energyLevel * 0.3); // up to 1.3x at intensity 1, matching the "energetic" prompt rule
  } else if (intent.energyLevel < 0) {
    result = scaleEnergyCurve(result, 1 + intent.energyLevel * 0.4); // down to 0.6x at intensity -1, matching the "chill" prompt rule
  }
  if (intent.smoothness > 0) {
    result = {
      ...result,
      edgeWeights: {
        ...result.edgeWeights,
        beatAlignment: result.edgeWeights.beatAlignment + intent.smoothness,
        embeddingSimilarity: result.edgeWeights.embeddingSimilarity + intent.smoothness,
      },
    };
  }
  if (intent.diversity > 0) {
    result = { ...result, pathObjectiveWeights: { ...result.pathObjectiveWeights, diversity: result.pathObjectiveWeights.diversity + intent.diversity } };
  }
  if (intent.targetDurationSec !== null) {
    result = { ...result, targetDurationSec: intent.targetDurationSec };
  }

  return result;
}

// Richer prompt interpretation via Gemini, with the exact same
// fail-gracefully contract as interpretPrompt(): no API key configured, a
// network/API error, or a response that doesn't parse/validate all degrade
// to the deterministic interpretPrompt() rather than throwing or producing
// an unbounded config. This makes it safe to call unconditionally — callers
// don't need to branch on whether Gemini is configured.
//
// Returns `usedGemini` alongside the config so callers (CLI/web) can tell
// their user whether Gemini actually ran or silently fell back — a fallback
// is never a failure from this function's contract, but it IS something a
// caller who explicitly configured a key would want to know about.
export interface PromptInterpretationResult {
  readonly config: PlannerConfig;
  readonly usedGemini: boolean;
}

export async function interpretPromptWithGemini(
  prompt: unknown,
  options: GeminiOptions = {},
  base: PlannerConfig = defaultPlannerConfig()
): Promise<PromptInterpretationResult> {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return { config: base, usedGemini: false };

  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return { config: interpretPrompt(prompt, base), usedGemini: false };

  const generateContentFn = options.generateContentFn ?? defaultGenerateContent;
  const model = options.model ?? GEMINI_MODEL_DEFAULT;

  try {
    const text = await generateContentFn({ apiKey, model, prompt });
    if (!text) return { config: interpretPrompt(prompt, base), usedGemini: false };

    const parsed: unknown = JSON.parse(text);
    const intent = validateGeminiIntent(parsed);
    if (!intent) return { config: interpretPrompt(prompt, base), usedGemini: false };

    return { config: applyGeminiIntent(base, intent), usedGemini: true };
  } catch {
    return { config: interpretPrompt(prompt, base), usedGemini: false };
  }
}
