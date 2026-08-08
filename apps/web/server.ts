import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Express } from 'express';
import multer from 'multer';
import { runMix } from '../cli/lib';
import { CliOptions } from '../cli/types';

const uploadDir = path.join(os.tmpdir(), 'mixforge-web-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function cleanupFiles(filePaths: readonly string[]): void {
  for (const filePath of filePaths) {
    fs.rm(filePath, { force: true }, () => {
      /* best-effort cleanup — a leftover temp file is not worth failing the request over */
    });
  }
}

export function createApp(): Express {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  app.post('/api/remix', upload.array('songs'), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const uploadedPaths = files.map((f) => f.path);

    if (files.length === 0) {
      cleanupFiles(uploadedPaths);
      res.status(400).json({ error: 'At least one song file is required.' });
      return;
    }

    const outputPath = path.join(uploadDir, `remix-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    const options: CliOptions = {
      songFiles: uploadedPaths,
      prompt: typeof req.body.prompt === 'string' ? req.body.prompt : '',
      outputPath,
      targetDurationSec: parseOptionalNumber(req.body.duration),
      durationToleranceSec: parseOptionalNumber(req.body.durationTolerance),
      beamWidth: parseOptionalNumber(req.body.beamWidth) ?? 6,
      maxSteps: parseOptionalNumber(req.body.maxSteps) ?? 30,
    };

    try {
      const result = await runMix(options);
      res.setHeader('X-Mixforge-Chunk-Ids', encodeURIComponent(result.chunkIds.join(' -> ')));
      res.setHeader('X-Mixforge-Duration-Sec', result.durationSec.toFixed(1));
      res.setHeader('X-Mixforge-Used-Fallback', String(result.usedFallbackPartialPlan));
      res.download(outputPath, 'remix.wav', (err) => {
        if (err) console.error('mixforge-web: error sending remix file:', err);
        cleanupFiles([...uploadedPaths, outputPath]);
      });
    } catch (err) {
      cleanupFiles(uploadedPaths);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return app;
}
