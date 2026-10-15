import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPack } from '../../vendor/t02/src/pack.mjs';
import { verifyVendorProvenance } from './check-content-pack.mjs';
import { createAdoptionState, loadLockedCandidate, readContentLock, resolveLockedDirectory, simulateAdoption } from './adoption.mjs';
import { adaptVerifiedBundle } from '../../src/content/adapter.js';
import { validateData } from '../../src/validation/dataValidation.js';
import { DEVELOPMENT_MARKER } from '../../src/dev/t02-session.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEVELOPMENT_PATH = '/symgene/t02-dev/';
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function loadDevelopmentBootstrap(root = ROOT, { now = Date.now() } = {}) {
  verifyVendorProvenance(root);
  const lock = readContentLock(root);
  const candidate = await loadLockedCandidate(root, { verifyPack, allowSimulation: true, now });
  const descriptors = [...lock.simulationArchives.filter((item) => item.contentVersion !== lock.candidate.contentVersion), lock.candidate];
  const exact = (descriptor) => verifyPack(resolveLockedDirectory(root, descriptor), { ...descriptor, baselineCounts: lock.policy.minimumCounts, allowSimulation: true, now });
  const websiteGate = async (pack) => {
    const adapter = adaptVerifiedBundle(pack.bundle, { allowSimulation: true });
    return validateData(adapter.seedData, { requireDrugSideEffects: true }).length === 0
      && Object.entries(lock.policy.minimumLegacyCounts).every(([type, floor]) => (type === 'institutions' ? adapter.institutions.length : adapter.seedData[type].length) >= floor);
  };
  const packs = [];
  let state = createAdoptionState();
  for (const descriptor of descriptors) {
    const adopted = await simulateAdoption(state, descriptor, { verifyCandidate: exact, verifyWebsite: websiteGate, websiteReviewApproved: true });
    if (!adopted.ok || adopted.state.active.bundle.mode !== 'simulation') fail(adopted.code ?? 'DEV_PACK_REJECTED');
    state = adopted.state;
    packs.push({ contentVersion: state.active.bundle.contentVersion, packageDigest: state.active.packageDigest, bundle: state.active.bundle });
  }
  return { marker: DEVELOPMENT_MARKER, scope: 'local_simulation_only', production: 'legacy',
    candidateVersion: candidate.candidate.bundle.contentVersion, packs, policy: lock.policy,
    trust: 'controlled_synthetic_injection_only', publisherIdentity: 'not_configured' };
}

export async function startDevelopmentConsumer({ enabled = false, root = ROOT, port = 0 } = {}) {
  // Explicit opt-in precedes reading lock, packages, or creating a server.
  if (enabled !== true) fail('DEV_CONSUMER_DISABLED');
  if (process.versions.node.split('.')[0] !== '22') fail('DEV_CONSUMER_NODE22_REQUIRED');
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('DEV_CONSUMER_PORT_INVALID');
  await loadDevelopmentBootstrap(root);
  const app = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, plugins: [{
    name: 't02-explicit-development-consumer',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (!path.startsWith(DEVELOPMENT_PATH)) return next();
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
        if (path === `${DEVELOPMENT_PATH}bootstrap`) {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          try { response.end(JSON.stringify(await loadDevelopmentBootstrap(root))); }
          catch (error) { response.statusCode = 503; response.end(JSON.stringify({ code: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'DEV_BOOTSTRAP_FAILED' })); }
          return;
        }
        if (path !== DEVELOPMENT_PATH) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T02 虚构开发消费演练</title><body><div id="t02-dev-root"></div><script type="module" src="/src/dev/t02-consumer.jsx"></script></body></html>';
        response.end(await server.transformIndexHtml(DEVELOPMENT_PATH, html));
      });
    }
  }] });
  await app.listen();
  return { app, url: `http://127.0.0.1:${app.httpServer.address().port}${DEVELOPMENT_PATH}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 1 || args[0] !== '--enable-synthetic') fail('DEV_CONSUMER_DISABLED');
    const server = await startDevelopmentConsumer({ enabled: true });
    console.log(JSON.stringify({ code: 'DEV_CONSUMER_STARTED', url: server.url, production: 'legacy', scope: 'local_simulation_only' }));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.app.close(); process.exit(0); });
  } catch (error) { console.error(JSON.stringify({ code: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'DEV_CONSUMER_FAILED' })); process.exitCode = 1; }
}
