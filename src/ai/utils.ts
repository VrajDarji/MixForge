// Small pure helper — no domain orchestration of its own.
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
