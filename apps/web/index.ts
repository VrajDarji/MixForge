#!/usr/bin/env node
import { createApp } from './server';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`mixforge-web: listening on http://localhost:${PORT}`);
  });
}
