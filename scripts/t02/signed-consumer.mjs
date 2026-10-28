import { createConsumerViteServer } from './consumer-vite-server.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNED_MARKER, SIGNED_PATH } from '../../src/dev/t02-signed-session.js';
import { schema } from '../../vendor/t02/src/contract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function startSignedConsumer({ enabled = false, root = ROOT, port = 0, cacheDir, gatewayURL, versions, candidateVersion } = {}) {
  if (enabled !== true) fail('SIGNED_CONSUMER_DISABLED');
  if (process.versions.node.split('.')[0] !== '22') fail('SIGNED_CONSUMER_NODE22_REQUIRED');
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('SIGNED_CONSUMER_PORT_INVALID');
  let gateway;
  try { gateway = new URL(gatewayURL); } catch { fail('SIGNED_GATEWAY_URL_REJECTED'); }
  if (gateway.protocol !== 'http:' || gateway.hostname !== '127.0.0.1' || !gateway.port || gateway.username || gateway.password
    || gateway.search || gateway.hash || !['/', '/snapshot'].includes(gateway.pathname)) fail('SIGNED_GATEWAY_URL_REJECTED');
  if (!Array.isArray(versions) || versions.length < 2 || !versions.every((value) => typeof value === 'string' && new RegExp(schema.properties.contentVersion.pattern).test(value))
    || new Set(versions).size !== versions.length || !versions.includes(candidateVersion)) fail('SIGNED_CONFIGURATION_REJECTED');
  const configuration = { marker: SIGNED_MARKER, scope: 'local-test-only', production: 'legacy', versions, candidateVersion };
  const app = await createConsumerViteServer({ root, cacheDir, server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, plugins: [{
    name: 't02-signed-test-consumer',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith(SIGNED_PATH)) return next();
        response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.headers.host !== `127.0.0.1:${server.httpServer.address().port}`) { response.statusCode = 403; response.end('{}'); return; }
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) { response.statusCode = 403; response.end('{}'); return; }
        if (url.pathname === `${SIGNED_PATH}configuration`) { response.end(JSON.stringify(configuration)); return; }
        if (url.pathname === `${SIGNED_PATH}snapshot`) {
          const version = url.searchParams.get('version'); const action = url.searchParams.get('action');
          if (!versions.includes(version) || !['read', 'adopt', 'rollback'].includes(action)
            || [...url.searchParams.keys()].sort().join('|') !== 'action|version') { response.statusCode = 400; response.end('{}'); return; }
          try {
            const target = new URL('/snapshot', gateway); target.search = new URLSearchParams({ version, action }).toString();
            const upstream = await fetch(target, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(1200) });
            if (!upstream.ok || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(upstream.headers.get('cache-control') ?? '')) fail('SIGNED_GATEWAY_UNAVAILABLE');
            const body = await upstream.json();
            if (body.available !== true || body.scope !== 'local-test-only') fail('SIGNED_GATEWAY_UNAVAILABLE');
            response.end(JSON.stringify(body));
          } catch { response.statusCode = 503; response.end(JSON.stringify({ available: false, code: 'SIGNED_GATEWAY_UNAVAILABLE' })); }
          return;
        }
        if (url.pathname !== SIGNED_PATH || url.search) { response.statusCode = 404; response.end('{}'); return; }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T02 签名测试消费演练</title><body><div id="t02-signed-root"></div><script type="module" src="/src/dev/t02-signed-consumer.jsx"></script></body></html>';
        response.end(await server.transformIndexHtml(SIGNED_PATH, html));
      });
    }
  }] });
  try {
    // Vite's listen(0) substitutes its default port. Let the OS reserve an
    // ephemeral socket atomically through the public HTTP server instead.
    if (port === 0) await new Promise((ready, reject) => {
      const failed = (error) => reject(error);
      app.httpServer.once('error', failed);
      app.httpServer.listen(0, '127.0.0.1', () => { app.httpServer.off('error', failed); ready(); });
    });
    else await app.listen();
  } catch (cause) { await app.close(); throw cause; }
  return { app, url: `http://127.0.0.1:${app.httpServer.address().port}${SIGNED_PATH}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--enable-signed-test') fail('SIGNED_CONSUMER_DISABLED');
    const server = await startSignedConsumer({ enabled: true, gatewayURL: args[1], versions: args[2].split(','), candidateVersion: args[3] });
    console.log(JSON.stringify({ code: 'SIGNED_TEST_CONSUMER_STARTED', url: server.url, production: 'legacy', scope: 'local-test-only' }));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.app.close(); process.exit(0); });
  } catch (cause) { console.error(JSON.stringify({ code: /^[A-Z0-9_]+$/.test(cause.code ?? '') ? cause.code : 'SIGNED_CONSUMER_FAILED' })); process.exitCode = 1; }
}
