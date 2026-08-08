import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Express, Request } from 'express';
import multer from 'multer';
import { runMix } from '../cli/lib';
import { CliOptions } from '../cli/types';

const uploadDir = path.join(os.tmpdir(), 'mixforge-web-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

type RequestWithUploadDir = Request & { uploadSubDir?: string };

// path.basename() strips any directory components from the client-supplied
// originalname (prevents path traversal via "../" segments); the character
// filter keeps filesystem-unfriendly characters out while preserving the
// spaces/parens real song filenames commonly have.
function sanitizeFilename(originalName: string): string {
  const base = path.basename(originalName);
  const cleaned = base.replace(/[^a-zA-Z0-9._ \-()]/g, '_');
  return cleaned || 'upload';
}

// Each request gets its own subdirectory holding files under their
// (sanitized) ORIGINAL names — not multer's default random hex filename.
// runMix() derives each song's id from its file path's basename (matching
// the CLI's behavior with real file paths), so preserving the real name
// here is what keeps chunk ids/song ids human-readable instead of showing
// up as opaque hashes in the UI.
const storage = multer.diskStorage({
  destination: (req: RequestWithUploadDir, _file, cb) => {
    if (!req.uploadSubDir) {
      req.uploadSubDir = path.join(uploadDir, `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(req.uploadSubDir, { recursive: true });
    }
    cb(null, req.uploadSubDir);
  },
  filename: (req: RequestWithUploadDir, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    let candidate = sanitized;
    let counter = 1;
    // Guard against two uploaded files sharing the same original name.
    while (fs.existsSync(path.join(req.uploadSubDir!, candidate))) {
      candidate = `${base}-${counter}${ext}`;
      counter++;
    }
    cb(null, candidate);
  },
});
const upload = multer({ storage });

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function cleanupPaths(paths: readonly string[]): void {
  for (const p of paths) {
    fs.rm(p, { force: true, recursive: true }, () => {
      /* best-effort cleanup — a leftover temp file/dir is not worth failing the request over */
    });
  }
}

export function createApp(): Express {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  app.post('/api/remix', upload.array('songs'), async (req: RequestWithUploadDir, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const uploadedPaths = files.map((f) => f.path);
    const cleanupTargets = req.uploadSubDir ? [req.uploadSubDir] : uploadedPaths;

    if (files.length === 0) {
      cleanupPaths(cleanupTargets);
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
      geminiApiKey: typeof req.body.geminiApiKey === 'string' && req.body.geminiApiKey.trim() !== '' ? req.body.geminiApiKey : undefined,
    };

    try {
      const result = await runMix(options);
      res.setHeader('X-Mixforge-Chunk-Ids', encodeURIComponent(result.chunkIds.join(' -> ')));
      res.setHeader('X-Mixforge-Duration-Sec', result.durationSec.toFixed(1));
      res.setHeader('X-Mixforge-Used-Fallback', String(result.usedFallbackPartialPlan));
      res.setHeader('X-Mixforge-Used-Gemini', String(result.usedGemini));
      res.download(outputPath, 'remix.wav', (err) => {
        if (err) console.error('mixforge-web: error sending remix file:', err);
        cleanupPaths([...cleanupTargets, outputPath]);
      });
    } catch (err) {
      cleanupPaths(cleanupTargets);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return app;
}
