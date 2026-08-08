import { HardConstraint, PlannerConfig } from '../core';
import { PromptRule } from './types';
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
