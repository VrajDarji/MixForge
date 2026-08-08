import * as fs from 'fs';
import * as path from 'path';
import { parseArgs, runMix } from '../lib';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

describe('parseArgs()', () => {
  it('parses song files, prompt, output, and numeric flags', () => {
    const options = parseArgs(['--prompt', 'high energy', '--output', 'out.wav', '--duration', '60', '--beam-width', '8', '--max-steps', '10', 'a.wav', 'b.wav']);
    expect(options.songFiles).toEqual(['a.wav', 'b.wav']);
    expect(options.prompt).toBe('high energy');
    expect(options.outputPath).toBe('out.wav');
    expect(options.targetDurationSec).toBe(60);
    expect(options.beamWidth).toBe(8);
    expect(options.maxSteps).toBe(10);
  });

  it('defaults beamWidth/maxSteps and allows an empty prompt', () => {
    const options = parseArgs(['--output', 'out.wav', 'a.wav']);
    expect(options.prompt).toBe('');
    expect(options.beamWidth).toBeGreaterThan(0);
    expect(options.maxSteps).toBeGreaterThan(0);
  });

  it('throws a clear error when no song files are given', () => {
    expect(() => parseArgs(['--output', 'out.wav'])).toThrow(/song file/);
  });

  it('throws a clear error when --output is missing', () => {
    expect(() => parseArgs(['a.wav'])).toThrow(/--output/);
  });

  it('parses --duration-tolerance', () => {
    const options = parseArgs(['--output', 'out.wav', '--duration', '180', '--duration-tolerance', '20', 'a.wav']);
    expect(options.durationToleranceSec).toBe(20);
  });

  it('parses --gemini-api-key', () => {
    const options = parseArgs(['--output', 'out.wav', '--gemini-api-key', 'my-key', 'a.wav']);
    expect(options.geminiApiKey).toBe('my-key');
  });
});

describe('runMix() end-to-end against real (synthetic) audio', () => {
  // interpretPromptWithGemini() falls back to process.env.GEMINI_API_KEY when
  // options.geminiApiKey isn't given — clear it for this suite so a key set
  // in the ambient shell/CI environment can never turn this into a real,
  // network-dependent test.
  const originalEnvKey = process.env.GEMINI_API_KEY;
  beforeEach(() => delete process.env.GEMINI_API_KEY);
  afterAll(() => {
    if (originalEnvKey !== undefined) process.env.GEMINI_API_KEY = originalEnvKey;
  });

  it('produces a rendered output file from real song files and a prompt', async () => {
    const outputPath = path.join(__dirname, `../../../test-data/audio/.cli-test-output-${Date.now()}.wav`);
    try {
      const result = await runMix({
        songFiles: [FIXTURE_A, FIXTURE_B],
        prompt: 'high energy dance mix',
        outputPath,
        targetDurationSec: 20,
        beamWidth: 6,
        maxSteps: 20,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(result.chunkIds.length).toBeGreaterThan(0);
      expect(result.durationSec).toBeGreaterThan(0);
      expect(result.outputPath).toBe(outputPath);
      expect(result.usedGemini).toBe(false); // no key configured in this test
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }, 60000);
});
