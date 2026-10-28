import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync, existsSync, rmSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { checkLegacyRuntime } from './legacy-runtime.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Run only after installing the lockfile's Chromium. Missing browser, startup
// errors, absent runtime assertion, non-legacy data and network adoption fail.
export async function verifyProductionRuntime(root = ROOT, { distDir = resolve(root, 'dist') } = {}) {
  rmSync(resolve(distDir, '.symgene-runtime-browser.json'), { force: true });
  const build = checkLegacyRuntime(root, { distDir });
  const outputs = Object.keys(JSON.parse(readFileSync(resolve(distDir, '.symgene-runtime.json'))).outputs);
  const seed = JSON.parse(readFileSync(resolve(root, 'src/content/knowledge.json')));
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const target = resolve(distDir, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(resolve(distDir) + '/')) { response.writeHead(403); response.end(); return; }
    try { const body = readFileSync(target); response.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream'); response.end(body); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  let browser, receipt;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.REVIEW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.REVIEW_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ reducedMotion: 'reduce', serviceWorkers: 'block', viewport: { width: 1366, height: 900 } });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const requests = [], errors = [], unexpected = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`request failed: ${request.url()}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && !url.search && (url.pathname === '/' || outputs.includes(url.pathname.slice(1)))) return route.continue();
      // The sole external stylesheet already used by the app is intentionally
      // stubbed for deterministic typography; gateway/data traffic is rejected.
      if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
        && route.request().resourceType() === 'stylesheet') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 20_000 });
    const runtime = await page.evaluate(() => ({ value: globalThis.__SYMGENE_PRODUCTION_RUNTIME__,
      frozen: Object.isFrozen(globalThis.__SYMGENE_PRODUCTION_RUNTIME__), descriptor: Object.getOwnPropertyDescriptor(globalThis, '__SYMGENE_PRODUCTION_RUNTIME__') }));
    assert.deepEqual(runtime.value, build.runtime);
    assert.equal(runtime.frozen, true); assert.equal(runtime.descriptor.writable, false); assert.equal(runtime.descriptor.configurable, false);
    await page.getByRole('navigation', { name: '知识栏目' }).getByRole('button', { name: '精神药物', exact: true }).click();
    const nav = page.getByRole('navigation', { name: '主导航' });
    for (const [label, collection] of [['药物', 'drugs'], ['疾病科普', 'disorders'], ['案例分析', 'cases'], ['网络资源', 'resources']]) {
      const button = nav.getByRole('button', { name: new RegExp(`^${label}\\s*${seed[collection].length}$`) });
      await button.click({ timeout: 10_000 });
      await page.locator('.count-label').filter({ hasText: new RegExp(`^${seed[collection].length} `) }).waitFor({ timeout: 10_000 });
    }
    assert.equal(await page.locator('.local-add-button, .editor-modal').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    assert.ok(requests.some(url => /\/assets\/index-.*\.js$/.test(url)));
    const t02Requests = requests.filter(url => /\/symgene\/t02-|\/snapshot(?:\?|$)|\/content-packs\//.test(url));
    assert.equal(t02Requests.length, 0);
    // Rehash after execution; the receipt binds exactly what was served.
    const after = checkLegacyRuntime(root, { distDir });
    assert.equal(after.artifactDigest, build.artifactDigest); assert.equal(after.sourceEvidenceDigest, build.sourceEvidenceDigest);
    receipt = { format: 'symgene-legacy-browser-execution/1', status: 'LEGACY_RUNTIME_EXECUTED',
      artifactDigest: build.artifactDigest, sourceEvidenceDigest: build.sourceEvidenceDigest,
      runtime: runtime.value, browserVersion: browser.version(), readOnly: true, t02Requests: 0, unexpectedRequests: 0, runtimeErrors: 0,
      counts: Object.fromEntries(['drugs', 'disorders', 'cases', 'resources'].map(key => [key, seed[key].length])),
      medicalApproval: 'not_asserted', rightsApproval: 'not_asserted', productionDeployment: 'not_authorized' };
  } finally {
    const cleanup = await Promise.allSettled([
      Promise.resolve().then(() => browser?.close()),
      new Promise((done, reject) => server.close(error => error ? reject(error) : done())),
    ]);
    if (cleanup.some(result => result.status === 'rejected')) throw Object.assign(new Error('PRODUCTION_RUNTIME_CLEANUP_FAILED'), { code: 'PRODUCTION_RUNTIME_CLEANUP_FAILED' });
  }
  // A receipt is consumable only after all browser and server cleanup succeeds.
  writeFileSync(resolve(distDir, '.symgene-runtime-browser.json'), JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('RUNTIME_VERIFICATION_ARGUMENTS_REJECTED');
    console.log(JSON.stringify(await verifyProductionRuntime()));
  } catch (error) {
    console.error(JSON.stringify({ status: 'BLOCKED', code: error.code || 'PRODUCTION_RUNTIME_EXECUTION_FAILED' })); process.exitCode = 1;
  }
}
