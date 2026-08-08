// Small pure helpers — no domain orchestration of their own.

interface ParsedCamelot {
  readonly num: number;
  readonly letter: 'A' | 'B';
}

function parseCamelot(code: string): ParsedCamelot {
  const match = /^(\d{1,2})([AB])$/.exec(code);
  if (!match) return { num: 8, letter: 'B' }; // malformed input: neutral fallback, never throw
  return { num: Number(match[1]), letter: match[2] as 'A' | 'B' };
}

// Standard Camelot wheel compatibility: identical code, adjacent number on
// the same letter (wrapping 12<->1), or the same number on the other letter
// (relative major/minor).
export function areCamelotKeysCompatible(a: string, b: string): boolean {
  const ka = parseCamelot(a);
  const kb = parseCamelot(b);
  if (ka.letter === kb.letter) {
    const diff = Math.abs(ka.num - kb.num);
    return diff === 0 || diff === 1 || diff === 11;
  }
  return ka.num === kb.num;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
