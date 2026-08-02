// Renderer — deterministic execution, no scoring logic.
// Interface only. The real implementation lives in src/renderer/ (Phase 6).

import { RemixPlan } from './remixPlan';
import { MusicGraph } from './musicGraph';

export interface RenderOptions {
  readonly crossfadeCurve: 'linear' | 'equalPower';
  readonly normalizeLoudnessLufs: number;
}

export interface RenderedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  readonly filePath: string;
}

export interface Renderer {
  render(plan: RemixPlan, graph: MusicGraph, options: RenderOptions): Promise<RenderedAudio>;
}
