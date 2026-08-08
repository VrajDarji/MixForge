#!/usr/bin/env node
import { parseArgs, runMix } from './lib';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runMix(options);

  if (result.usedFallbackPartialPlan) {
    console.warn('mixforge: no target-duration match found — rendered the best partial plan instead.');
  }
  console.log(`mixforge: rendered ${result.chunkIds.length} chunks (${result.durationSec.toFixed(1)}s) -> ${result.outputPath}`);
  console.log(`mixforge: chunk sequence: ${result.chunkIds.join(' -> ')}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
