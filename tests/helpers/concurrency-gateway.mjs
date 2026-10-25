// Website-only synthetic gateway for Chromium startup CI. This does not verify
// producer signatures and never supplies medical/publication authority.
import { createServer } from 'node:http';
import { loadDevelopmentBootstrap } from '../../scripts/t02/dev-consumer.mjs';

export async function createReleaseTestFixture() {
  const bootstrap = await loadDevelopmentBootstrap();
  const now = Date.now();
  const runtime = { snapshot(version) {
    const pack = bootstrap.packs.find(row => row.contentVersion === version);
    if (!pack) throw new Error('SYNTHETIC_VERSION_UNKNOWN');
    return { available: true, scope: 'local-test-only', bundle: pack.bundle,
      emergencyEvent: { sequence: 1, targetIds: [], issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 120000).toISOString() },
      proof: { packageDigest: pack.packageDigest, manifestSha256: '1'.repeat(64), headDigest: '2'.repeat(64),
        publisherKeyId: 'fictional-startup-publisher', adopterKeyId: 'fictional-startup-adopter', checkpointKeyId: 'fictional-startup-checkpoint',
        trustRevision: 1, validUntil: new Date(now + 120000).toISOString() } };
  } };
  return { runtime, checkpointURL: null, versions: bootstrap.packs.map(row => row.contentVersion), candidateVersion: bootstrap.candidateVersion, close: async () => {} };
}
export async function startReleaseGateway({ runtime }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'GET' || url.pathname !== '/snapshot' || !['read', 'adopt', 'rollback'].includes(url.searchParams.get('action'))) {
      response.writeHead(400); response.end('{}'); return;
    }
    try { response.end(JSON.stringify(runtime.snapshot(url.searchParams.get('version')))); }
    catch { response.writeHead(503); response.end('{}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
