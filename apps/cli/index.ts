#!/usr/bin/env node
import { parseArgs, runMix } from './lib';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runMix(options);

  if (result.usedFallbackPartialPlan) {
    console.warn('mixforge: no target-duration match found — rendered the best partial plan instead.');
  }
  if (options.prompt.trim().length > 0) {
    console.log(`mixforge: prompt interpreted via ${result.usedGemini ? 'Gemini' : 'the built-in keyword rules'}.`);
  }
  console.log(`mixforge: rendered ${result.chunkIds.length} chunks (${result.durationSec.toFixed(1)}s) -> ${result.outputPath}`);
  if (options.targetDurationSec !== undefined) {
    // The planner's internal duration accounting sums raw chunk lengths;
    // the final render is always somewhat shorter because crossfades
    // overlap consecutive chunks. Surfacing both numbers here so the gap
    // is visible rather than silently surprising.
    console.log(`mixforge: requested ~${options.targetDurationSec}s — rendered output is ${result.durationSec.toFixed(1)}s (crossfade overlap always shortens the final render somewhat vs. the target).`);
  }
  console.log(`mixforge: chunk sequence: ${result.chunkIds.join(' -> ')}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
