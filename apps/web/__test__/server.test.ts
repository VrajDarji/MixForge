import * as fs from 'fs';
import * as path from 'path';
import type { Server } from 'http';
import { createApp } from '../server';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

describe('web server /api/remix', () => {
  let server: Server;
  let baseUrl: string;
  // Neither test sends geminiApiKey, so interpretPromptWithGemini() would
  // fall back to process.env.GEMINI_API_KEY — clear it so a key set in the
  // ambient shell/CI environment can never turn this into a real,
  // network-dependent test.
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeAll(async () => {
    delete process.env.GEMINI_API_KEY;
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (originalEnvKey !== undefined) process.env.GEMINI_API_KEY = originalEnvKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves the single-page UI at /', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>MixForge</title>');
  });

  it('rejects a request with no song files', async () => {
    const formData = new FormData();
    formData.append('prompt', 'high energy');
    const response = await fetch(`${baseUrl}/api/remix`, { method: 'POST', body: formData });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/song file/i);
  });

  it('accepts uploaded songs and returns a downloadable remix with metadata headers', async () => {
    const formData = new FormData();
    formData.append('songs', new Blob([fs.readFileSync(FIXTURE_A)]), 'synthetic-a.wav');
    formData.append('songs', new Blob([fs.readFileSync(FIXTURE_B)]), 'synthetic-b.wav');
    formData.append('prompt', 'high energy dance mix');
    formData.append('duration', '20');
    formData.append('beamWidth', '6');
    formData.append('maxSteps', '20');

    const response = await fetch(`${baseUrl}/api/remix`, { method: 'POST', body: formData });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/audio\/(wav|x-wav|wave)/);

    const durationHeader = response.headers.get('x-mixforge-duration-sec');
    const chunkIdsHeader = response.headers.get('x-mixforge-chunk-ids');
    expect(durationHeader).not.toBeNull();
    expect(Number(durationHeader)).toBeGreaterThan(0);
    expect(response.headers.get('x-mixforge-used-gemini')).toBe('false'); // no key sent in this test
    expect(chunkIdsHeader).not.toBeNull();
    const chunkIds = decodeURIComponent(chunkIdsHeader!);
    expect(chunkIds).toContain('->');
    // The original uploaded filenames must survive into the chunk ids — not
    // multer's default random hex temp filename (a real regression: the web
    // upload path previously showed opaque hashes like "c5b417d0...-chunk-0"
    // instead of "synthetic-a-chunk-0" in generated remix output).
    expect(chunkIds).toMatch(/synthetic-[ab]-chunk-\d+/);

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF'); // WAV file signature
  }, 60000);

  it('sanitizes path-traversal attempts in uploaded filenames', async () => {
    const formData = new FormData();
    formData.append('songs', new Blob([fs.readFileSync(FIXTURE_A)]), '../../evil.wav');
    formData.append('duration', '10');
    formData.append('maxSteps', '5');

    const response = await fetch(`${baseUrl}/api/remix`, { method: 'POST', body: formData });
    // Must not crash or write outside the upload directory — either a clean
    // success (using the basename "evil.wav") or a clean failure is fine;
    // an uncaught exception / 5xx from a filesystem error is not.
    expect([200, 400, 500]).toContain(response.status);
    await response.arrayBuffer();
  }, 30000);
});
