// Small pure helpers — no domain orchestration of their own.

// Equal-power crossfade curve (constant perceived loudness through the
// fade, unlike a linear fade which dips in the middle) — design.md §10's
// default crossfade curve.
export function equalPowerFadeOut(t: number): number {
  return Math.cos((t * Math.PI) / 2);
}
export function equalPowerFadeIn(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

// Linear-interpolation resampling — a simple, dependency-free time-stretch.
// Changes pitch along with speed (not a phase-vocoder), which is an
// accepted simplification for the bounded correction described in
// docs/implementation.md §10 ("apply a small time-stretch... bounded").
export function resampleLinear(samples: Float32Array, ratio: number): Float32Array {
  const outputLength = Math.max(Math.round(samples.length / ratio), 1);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = samples[srcIndex] ?? 0;
    const b = samples[srcIndex + 1] ?? a;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

// Bounds a raw bpmDelta-implied stretch ratio to design.md §10's tolerance:
// reject/heavily discount edges requiring >8% tempo stretch or >2 semitones
// of pitch correction. Renderer-side enforcement is a safety net — the
// primary control is Phase 3's edge feasibility scoring.
const MAX_STRETCH_RATIO = 0.08;

export function boundedStretchRatio(fromBpm: number, toBpm: number): number {
  const rawRatio = toBpm / fromBpm;
  const clamped = Math.min(Math.max(rawRatio, 1 - MAX_STRETCH_RATIO), 1 + MAX_STRETCH_RATIO);
  return clamped;
}

export function computeRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / Math.max(samples.length, 1));
}

// Rough RMS-to-LUFS approximation (true EBU R128 integrated loudness needs
// gated windowing, which is out of scope for this simplified renderer pass)
// — good enough to drive a single final gain-normalization step.
export function approximateLufs(samples: Float32Array): number {
  const rms = computeRms(samples);
  if (rms <= 0) return -70;
  return 20 * Math.log10(rms) - 0.691; // -0.691 dB K-weighting offset approximation
}
