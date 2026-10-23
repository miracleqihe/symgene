import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

/** Separate each live optimizer, including two instances of the same consumer. */
export async function createConsumerViteServer(options) {
  // An explicit cache opts out of isolation and belongs to the caller, solely
  // for controlled cold/warm comparisons. Never share it across live servers.
  const ownedCache = options.cacheDir === undefined ? mkdtempSync(join(tmpdir(), 'symgene-t02-vite-')) : null;
  // Rolldown may finish a filesystem operation while Vite cancels optimization.
  // Use five linear retries for transient deletion failures; exhaustion fails.
  const removeOwnedCache = () => ownedCache ? rm(ownedCache, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 }) : undefined;
  let app;
  try { app = await createServer({ ...options, cacheDir: ownedCache ?? options.cacheDir }); }
  catch (error) { await removeOwnedCache(); throw error; }
  const close = app.close.bind(app);
  let closing;
  // Repeated/simultaneous cleanup shares one cancellation and removal operation.
  app.close = () => closing ??= (async () => {
    try { await close(); } finally { await removeOwnedCache(); }
  })();
  return app;
}
