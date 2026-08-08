import * as fs from 'fs';
import * as path from 'path';
import type { Server } from 'http';
import { createApp } from '../server';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

describe('web server /api/remix', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
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
    expect(chunkIdsHeader).not.toBeNull();
    expect(decodeURIComponent(chunkIdsHeader!)).toContain('->');

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF'); // WAV file signature
  }, 60000);
});
