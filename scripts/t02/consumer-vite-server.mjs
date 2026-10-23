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
  let viteClosing;
  const closeVite = () => viteClosing ??= close();
  const drainOptimizers = async () => {
    await Promise.all(Object.values(app.environments).map(async ({ depsOptimizer }) => {
      if (!depsOptimizer) return;
      const observed = new Set();
      for (;;) {
        await depsOptimizer.scanProcessing;
        const pending = Object.values(depsOptimizer.metadata.discovered)
          .map(info => info.processing).filter(promise => promise && !observed.has(promise));
        if (!pending.length) return;
        pending.forEach(promise => observed.add(promise));
        depsOptimizer.run();
        await Promise.all(pending);
      }
    }));
  };
  const stopAndDrain = async () => {
    // Stop new module requests and file discovery before observing optimizer work.
    const stopped = app.httpServer?.listening ? new Promise((resolve, reject) => {
      app.httpServer.close(error => error ? reject(error) : resolve());
    }) : Promise.resolve();
    await Promise.all([stopped, app.watcher.close(), drainOptimizers()]);
    // Requests already accepted before close can discover another dependency batch.
    await drainOptimizers();
  };
  const shutdownWithDeadline = async work => {
    let timer;
    try {
      await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('T02_CONSUMER_SHUTDOWN_TIMEOUT'), { code: 'T02_CONSUMER_SHUTDOWN_TIMEOUT' })), 15000);
      })]);
    } finally { clearTimeout(timer); }
  };
  let closing;
  // Repeated/simultaneous cleanup shares one drain and removal operation.
  app.close = () => closing ??= (async () => {
    try { await shutdownWithDeadline(stopAndDrain().then(closeVite)); }
    catch (error) {
      // Cancellation cannot join a writer that missed the drain deadline. Start
      // Vite's remaining shutdown, but neither wait without a bound nor delete
      // an unjoined writer's cache. The caller must record incomplete cleanup.
      try { Promise.resolve(closeVite()).catch(() => {}); } catch {}
      Object.assign(error, { cleanupIncomplete: true, cacheDir: app.config.cacheDir });
      throw error;
    }
    await removeOwnedCache();
  })();
  return app;
}
