import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { arch, homedir, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SUBPATH = '/symgene/t02-smoke/';
const NOW = Date.parse('2026-10-14T12:00:00Z');
const BROWSER_FILES = [
  'src/content/adapter.js', 'src/storage/constants.js', 'src/storage/migrations.js',
  'src/storage/operations.js', 'src/storage/storage.js', 'src/validation/dataValidation.js', 'src/search.js'
];
const NODE_FILES = [
  'content-pack.lock', 'scripts/t02/adoption.mjs', 'scripts/t02/read-local-config.mjs',
  'vendor/t02/provenance.json', 'vendor/t02/src/contract.mjs', 'vendor/t02/src/pack.mjs',
  'vendor/t02/src/scanner.mjs', 'vendor/t02/schemas/content-v1.schema.json'
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

async function installHarness(page, inputs) {
  await page.evaluate(async ({ fixtures, history, subpath, now }) => {
    const adapterModule = await import(`${subpath}src/content/adapter.js`);
    const { createEnvelope } = await import(`${subpath}src/storage/migrations.js`);
    const { upsertEntry, deleteEntry } = await import(`${subpath}src/storage/operations.js`);
    const { writeKnowledge, readKnowledge, createBackup, restoreBackup, readBackupRaw } = await import(`${subpath}src/storage/storage.js`);
    const { STORAGE_KEY } = await import(`${subpath}src/storage/constants.js`);
    const { validateData } = await import(`${subpath}src/validation/dataValidation.js`);
    const { matchKnowledge } = await import(`${subpath}src/search.js`);
    const SAFETY = 'symgene-t02-smoke-safety';
    const SELECTED = 'symgene-t02-smoke-selected';
    const BACKUP = 'symgene-t02-smoke-backup';
    const adapterFor = (name) => {
      const adapter = adapterModule.adaptVerifiedBundle(fixtures[name], { allowSimulation: true });
      adapter.identities.push(...history.identities);
      adapter.redirects.push(...history.redirects);
      adapter.dependencies.push(...history.dependencies);
      adapter.retractions.push(...history.retractions);
      return adapter;
    };
    const ledger = () => JSON.parse(localStorage.getItem(SAFETY) ?? 'null') ?? adapterModule.createRetractionLedger();
    const storageDigest = async () => {
      const bytes = new TextEncoder().encode(JSON.stringify(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const inspect = async (at = now, code = 'INSPECTED') => {
      const selected = localStorage.getItem(SELECTED) ?? 'candidate';
      const adapter = adapterFor(selected);
      const seed = adapter.seedData;
      const read = readKnowledge(localStorage, seed, { now: new Date(at) });
      if (read.error) throw Object.assign(new Error(), { code: 'BROWSER_STORAGE_READ_FAILED' });
      const before = await storageDigest();
      const dataBefore = JSON.stringify(read.envelope.data);
      const safety = ledger();
      const visible = adapterModule.projectVisibleKnowledge(read.envelope.data, adapter, safety, { now: at });
      const after = await storageDigest();
      const disease = seed.disorders[0];
      const search = matchKnowledge(disease.name, visible.data);
      const result = {
        code, selected, nativeStorage: localStorage instanceof Storage && Object.getPrototypeOf(localStorage) === Storage.prototype,
        nativeKeyCount: localStorage.length, sequence: safety.sequence, fresh: visible.fresh, contentFresh: visible.contentFresh,
        counts: Object.fromEntries(Object.entries(visible.data).map(([kind, rows]) => [kind, rows.length])),
        detailsHidden: !visible.data.disorders.some((item) => item.id === disease.id),
        searchHidden: search.disorders.length + search.cases.length === 0,
        rawDiseaseRetained: read.envelope.data.disorders.some((item) => item.id === disease.id),
        overrideRetained: read.envelope.data.disorders.some((item) => item.summary === '完全虚构的浏览器本地覆盖'),
        customCaseRetained: read.envelope.data.cases.some((item) => item.id === 'browser-synthetic-custom-case'),
        tombstoneRetained: read.envelope.deletedIds.resources.includes(seed.resources[0].id),
        projectionPreservedStorage: before === after && JSON.stringify(read.envelope.data) === dataBefore,
        storageSha256: after
      };
      document.querySelector('#result').textContent = JSON.stringify(result, null, 2);
      return result;
    };
    window.t02Smoke = {
      storageDigest, inspect,
      async initialize() {
        const adapter = adapterFor('candidate');
        const seed = adapter.seedData;
        if (validateData(seed, { requireDrugSideEffects: true }).length) throw Object.assign(new Error(), { code: 'BROWSER_DATA_INVALID' });
        let envelope = createEnvelope(seed, { savedAt: new Date(now).toISOString() });
        envelope = upsertEntry(envelope, 'disorders', { ...seed.disorders[0], summary: '完全虚构的浏览器本地覆盖' }, { seedData: seed, now: new Date(now) });
        envelope = upsertEntry(envelope, 'cases', { ...seed.cases[0], id: 'browser-synthetic-custom-case', title: '完全虚构的浏览器案例' }, { seedData: seed, now: new Date(now) });
        envelope = deleteEntry(envelope, 'resources', seed.resources[0].id, seed, { now: new Date(now) });
        writeKnowledge(localStorage, envelope);
        const backup = createBackup(localStorage, localStorage.getItem(STORAGE_KEY), { now: new Date(now) });
        localStorage.setItem(BACKUP, backup);
        localStorage.setItem(SELECTED, 'candidate');
        const fresh = adapterModule.acceptEmergencyRetractions(adapterModule.createRetractionLedger(), {
          sequence: 1, targetIds: [], issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString()
        }, { trusted: true, now });
        localStorage.setItem(SAFETY, JSON.stringify(fresh));
        return inspect(now, 'NATIVE_STORAGE_INITIALIZED');
      },
      async withdraw() {
        const adapter = adapterFor('candidate');
        const disease = adapter.identities.find((item) => item.collection === 'disorders');
        const next = adapterModule.acceptEmergencyRetractions(ledger(), {
          sequence: 10, targetIds: [disease.canonicalId], issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString()
        }, { trusted: true, now });
        localStorage.setItem(SAFETY, JSON.stringify(next));
        return inspect(now, 'WITHDRAWAL_HIDDEN');
      },
      lowerSequence() {
        try {
          adapterModule.acceptEmergencyRetractions(ledger(), {
            sequence: 9, targetIds: [], issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString()
          }, { trusted: true, now });
          return 'LOWER_SEQUENCE_ACCEPTED';
        } catch (error) { return error.code ?? 'LOWER_SEQUENCE_ERROR'; }
      },
      async restore() {
        const safetyBefore = localStorage.getItem(SAFETY);
        const seed = adapterFor(localStorage.getItem(SELECTED)).seedData;
        const backup = localStorage.getItem(BACKUP);
        const backupHadDisease = JSON.parse(readBackupRaw(localStorage, backup)).data.disorders.some((item) => item.id === seed.disorders[0].id);
        restoreBackup(localStorage, backup, seed, { now: new Date(now + 1000) });
        return { ...(await inspect(now, 'BACKUP_RESTORED_STILL_HIDDEN')), backupHadDisease, safetyPreserved: localStorage.getItem(SAFETY) === safetyBefore };
      },
      async select(name, at = now) {
        if (!Object.hasOwn(fixtures, name)) throw Object.assign(new Error(), { code: 'BROWSER_FIXTURE_SELECTION_INVALID' });
        localStorage.setItem(SELECTED, name);
        return inspect(at, name === 'archive' ? 'OLD_PACKAGE_STILL_HIDDEN' : 'FIXTURE_SELECTED');
      },
      async untrusted() {
        const current = ledger();
        localStorage.setItem(SAFETY, JSON.stringify({ ...current, trusted: false }));
        return inspect(now, 'UNTRUSTED_STATE_HIDDEN');
      }
    };
  }, inputs);
}

export async function runBrowserSmoke({ sourceCommit, evidenceDir, playwrightModule = process.env.SYM_T02_PLAYWRIGHT_MODULE } = {}) {
  if (process.versions.node.split('.')[0] !== '22') fail('BROWSER_SMOKE_NODE22_REQUIRED');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) fail('BROWSER_SOURCE_COMMIT_REQUIRED');
  if (!evidenceDir || !resolve(evidenceDir).startsWith(resolve(ROOT, '../../.t02-evidence') + '/')) fail('BROWSER_EVIDENCE_OUTSIDE_GIT_REQUIRED');
  let evidenceComponent = resolve(ROOT, '../../.t02-evidence');
  for (const part of ['', ...resolve(evidenceDir).slice(evidenceComponent.length + 1).split('/')]) {
    if (part) evidenceComponent = join(evidenceComponent, part);
    if (existsSync(evidenceComponent)) {
      if (!lstatSync(evidenceComponent).isDirectory() || lstatSync(evidenceComponent).isSymbolicLink()) fail('BROWSER_EVIDENCE_UNSAFE_PATH');
    } else mkdirSync(evidenceComponent);
  }
  const external = mkdtempSync(join(tmpdir(), 'symgene-browser-clean-'));
  const checkout = join(external, 'checkout');
  mkdirSync(checkout);
  let browser;
  let server;
  let checks = 0;
  const check = (condition, code) => { if (!condition) fail(code); checks++; };
  try {
    const archive = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', sourceCommit], { maxBuffer: 128 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    execFileSync('tar', ['-xf', '-', '-C', checkout], { input: archive });
    check(!existsSync(join(checkout, '.git')) && !existsSync(join(checkout, 'content-packs/sim-1')) && !existsSync(join(checkout, 'content-packs/sim-2')), 'BROWSER_ARCHIVE_NOT_CLEAN');
    check(existsSync(join(checkout, 'content-packs/sim-3/manifest.json')) && existsSync(join(checkout, 'content-packs/sim-4/manifest.json')), 'BROWSER_ARCHIVE_INPUT_MISSING');
    // Existing dependencies are only read. No install or package mutation runs.
    symlinkSync(join(ROOT, 'node_modules'), join(checkout, 'node_modules'));
    const importSource = (relative) => import(pathToFileURL(join(checkout, relative)));
    const { buildPack, verifyPack } = await importSource('vendor/t02/src/pack.mjs');
    const { subjectDigest } = await importSource('vendor/t02/src/contract.mjs');
    const { createAdoptionState, readContentLock, resolveLockedDirectory, simulateAdoption } = await importSource('scripts/t02/adoption.mjs');
    const { readLocalConfig } = await importSource('scripts/t02/read-local-config.mjs');
    const producer = readLocalConfig(checkout, 'vendor/t02/provenance.json');
    const expectedVendorFiles = NODE_FILES.filter((path) => path.startsWith('vendor/t02/') && path !== 'vendor/t02/provenance.json');
    if (!Array.isArray(producer.files) || producer.files.length !== expectedVendorFiles.length
      || new Set(producer.files.map((file) => file.path)).size !== expectedVendorFiles.length) fail('BROWSER_VENDOR_PROVENANCE_MISMATCH');
    for (const file of producer.files) {
      if (!NODE_FILES.includes(`vendor/t02/${file.path}`) || digest(readFileSync(join(checkout, 'vendor/t02', file.path))) !== file.sha256) fail('BROWSER_VENDOR_PROVENANCE_MISMATCH');
    }
    const { validateData } = await importSource('src/validation/dataValidation.js');
    const { adaptVerifiedBundle } = await importSource('src/content/adapter.js');
    const lock = readContentLock(checkout);
    check(lock.adoption === 'legacy' && lock.scope === 'local_simulation_only', 'BROWSER_PRODUCTION_SCOPE_CHANGED');
    const exactDescriptor = (descriptor) => verifyPack(resolveLockedDirectory(checkout, descriptor), { ...descriptor, baselineCounts: lock.policy.minimumCounts, allowSimulation: true, now: NOW });
    const candidate = exactDescriptor(lock.candidate);
    const oldDescriptor = lock.simulationArchives.find((item) => item.contentVersion !== lock.candidate.contentVersion);
    check(!!oldDescriptor, 'BROWSER_OLD_PACKAGE_REQUIRED');
    const old = exactDescriptor(oldDescriptor);
    const websiteGate = async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { requireDrugSideEffects: true }).length === 0;
    const first = await simulateAdoption(createAdoptionState(), oldDescriptor, { verifyCandidate: exactDescriptor, websiteReviewApproved: true, verifyWebsite: websiteGate });
    const adopted = await simulateAdoption(first.state, lock.candidate, { verifyCandidate: exactDescriptor, websiteReviewApproved: true, verifyWebsite: websiteGate });
    check(first.ok && adopted.ok, 'BROWSER_NODE_ADOPTION_FAILED');
    const expiryBundle = JSON.parse(JSON.stringify(candidate.bundle));
    expiryBundle.contentVersion = 'browser-synthetic-expiry';
    expiryBundle.rights[0].expiresAt = new Date(NOW + 300000).toISOString();
    expiryBundle.reviews = expiryBundle.reviews.map((review) => ({
      ...review, id: `review:browser-expiry:${review.gate}:${review.subjectId}`,
      subjectDigest: subjectDigest(expiryBundle, review.subjectId)
    }));
    const expiry = buildPack(expiryBundle, { outputRoot: join(external, 'synthetic-pack'), pipelineCommit: producer.pipelineCommit, codeDigest: producer.codeDigest, allowSimulation: true, now: NOW });
    check(await websiteGate(expiry), 'BROWSER_EXPIRY_FIXTURE_INVALID');
    const inputs = {
      now: NOW, subpath: SUBPATH,
      fixtures: { candidate: candidate.bundle, archive: old.bundle, expiry: expiry.bundle },
      history: { identities: adopted.state.retainedIdentities, redirects: adopted.state.retainedRedirects, dependencies: adopted.state.retainedDependencies, retractions: adopted.state.retainedPackRetractions }
    };
    const sources = [...new Set([...BROWSER_FILES, ...NODE_FILES])].map((path) => {
      check(lstatSync(join(checkout, path)).isFile(), 'BROWSER_SOURCE_NOT_REGULAR');
      return { path, sha256: digest(readFileSync(join(checkout, path))) };
    });
    const served = new Set();
    let deniedRoutes = 0;
    server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'");
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
      if (pathname === SUBPATH) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>T02 synthetic consumer smoke</title><link rel="icon" href="./favicon.svg"><h1>T02 synthetic consumer smoke</h1><p>Local consumer harness; production remains legacy.</p><pre id="result">Fresh isolated context</pre></html>');
        return;
      }
      if (pathname === `${SUBPATH}favicon.svg`) {
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#8FD1E1"/></svg>');
        return;
      }
      const file = BROWSER_FILES.find((path) => pathname === `${SUBPATH}${path}`);
      if (!file) { deniedRoutes++; response.writeHead(404); response.end(); return; }
      served.add(file);
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(readFileSync(join(checkout, file)));
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const modulePath = playwrightModule ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
    const { chromium } = await import(pathToFileURL(modulePath));
    const playwrightVersion = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'))).version;
    browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    let externalRequests = 0;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || !url.pathname.startsWith(SUBPATH)) {
        externalRequests++;
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    let pageErrors = 0;
    let consoleErrors = 0;
    page.on('pageerror', () => { pageErrors++; });
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors++; });
    await page.goto(`${origin}${SUBPATH}`, { waitUntil: 'load' });
    check(await page.evaluate(() => localStorage.length === 0 && localStorage instanceof Storage), 'BROWSER_CONTEXT_NOT_FRESH');
    check((await context.cookies()).length === 0, 'BROWSER_CONTEXT_COOKIES_INHERITED');
    await installHarness(page, inputs);
    const results = [];
    const native = await page.evaluate(() => window.t02Smoke.initialize());
    check(native.nativeStorage && native.counts.disorders === 1 && native.counts.cases === 2 && !native.detailsHidden && !native.searchHidden, 'BROWSER_INITIAL_CONTENT_MISSING');
    results.push(native);
    const withdrawn = await page.evaluate(() => window.t02Smoke.withdraw());
    const checkHidden = (result) => {
      check(result.detailsHidden && result.searchHidden && result.counts.disorders === 0 && result.counts.cases === 0, 'BROWSER_WITHDRAWAL_REVIVED');
      check(result.rawDiseaseRetained && result.overrideRetained && result.customCaseRetained && result.tombstoneRetained && result.projectionPreservedStorage, 'BROWSER_USER_BYTES_NOT_PRESERVED');
    };
    checkHidden(withdrawn);
    results.push(withdrawn);
    const beforeReload = await page.evaluate(() => window.t02Smoke.storageDigest());
    await page.reload({ waitUntil: 'load' });
    await installHarness(page, inputs);
    check(await page.evaluate(() => window.t02Smoke.storageDigest()) === beforeReload, 'BROWSER_RELOAD_STORAGE_CHANGED');
    const reloaded = await page.evaluate(() => window.t02Smoke.inspect(undefined, 'RELOADED_STILL_HIDDEN'));
    checkHidden(reloaded);
    check(reloaded.sequence === 10 && await page.evaluate(() => window.t02Smoke.lowerSequence()) === 'RETRACTION_DOWNGRADE', 'BROWSER_SEQUENCE_DOWNGRADE');
    results.push(reloaded);
    const restored = await page.evaluate(() => window.t02Smoke.restore());
    checkHidden(restored);
    check(restored.backupHadDisease && restored.safetyPreserved, 'BROWSER_BACKUP_OVERWROTE_SAFETY');
    results.push(restored);
    const rollback = await page.evaluate(() => window.t02Smoke.select('archive'));
    checkHidden(rollback);
    check(rollback.sequence === 10 && rollback.selected === 'archive', 'BROWSER_ROLLBACK_LOST_SEQUENCE');
    results.push(rollback);
    await page.reload({ waitUntil: 'load' });
    await installHarness(page, inputs);
    const oldReload = await page.evaluate(() => window.t02Smoke.inspect(undefined, 'OLD_PACKAGE_RELOADED_STILL_HIDDEN'));
    checkHidden(oldReload);
    check(oldReload.selected === 'archive' && oldReload.sequence === 10, 'BROWSER_ROLLBACK_RELOAD_FAILED');
    results.push(oldReload);
    const expiryBefore = await page.evaluate(() => window.t02Smoke.select('expiry'));
    check(expiryBefore.fresh && expiryBefore.counts.drugs === 1, 'BROWSER_EXPIRY_POSITIVE_CONTROL_FAILED');
    const expired = await page.evaluate((at) => window.t02Smoke.inspect(at, 'RIGHTS_EXPIRED_HIDDEN'), NOW + 360000);
    check(!expired.contentFresh && !expired.fresh && Object.values(expired.counts).every((count) => count === 0), 'BROWSER_EXPIRED_RIGHTS_VISIBLE');
    checkHidden(expired);
    results.push(expired);
    await page.screenshot({ path: join(evidenceDir, 'rights-expiry.png'), fullPage: true });
    const stale = await page.evaluate((at) => window.t02Smoke.select('candidate', at), NOW + 7200000);
    check(stale.contentFresh && !stale.fresh && Object.values(stale.counts).every((count) => count === 0), 'BROWSER_STALE_EMERGENCY_VISIBLE');
    results.push({ ...stale, code: 'STALE_EMERGENCY_HIDDEN' });
    const untrusted = await page.evaluate(() => window.t02Smoke.untrusted());
    check(!untrusted.fresh && Object.values(untrusted.counts).every((count) => count === 0), 'BROWSER_UNTRUSTED_EMERGENCY_VISIBLE');
    results.push(untrusted);
    check((await fetch(`${origin}${SUBPATH}src/data.js`)).status === 404 && (await fetch(`${origin}${SUBPATH}src/atlas/institutions.json`)).status === 404, 'BROWSER_SERVER_EXPOSED_LEGACY_DATA');
    check(externalRequests === 0 && pageErrors === 0 && consoleErrors === 0 && served.size === BROWSER_FILES.length, 'BROWSER_RUNTIME_OR_NETWORK_ERROR');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const navigatorPlatform = await page.evaluate(() => navigator.platform);
    await context.close();
    const isolated = await browser.newContext({ serviceWorkers: 'block' });
    await isolated.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
    const isolatedPage = await isolated.newPage();
    await isolatedPage.goto(`${origin}${SUBPATH}`, { waitUntil: 'load' });
    check(await isolatedPage.evaluate(() => localStorage.length === 0), 'BROWSER_CONTEXT_STORAGE_LEAK');
    await isolated.close();
    const report = {
      code: 'BROWSER_SYNTHETIC_SMOKE_PASS', scope: 'consumer_harness_only', production: 'legacy', sourceCommit,
      driverSha256: digest(readFileSync(fileURLToPath(import.meta.url))), sourceArchiveSha256: digest(archive), sources,
      runtime: { node: process.version, playwright: playwrightVersion, chromium: browser.version(), platform: platform(), arch: arch(), release: release(), navigatorPlatform, userAgent, headless: true, freshContext: true },
      server: { host: '127.0.0.1', port, subpath: SUBPATH, noStore: true, servedModuleCount: served.size, deniedLegacyRoutes: deniedRoutes },
      network: { externalPageRequests: externalRequests, pageErrors, consoleErrors, serviceWorkers: 'blocked' },
      inputs: { candidateManifestSha256: candidate.manifestSha256, candidatePackageDigest: candidate.packageDigest, archiveManifestSha256: old.manifestSha256, archivePackageDigest: old.packageDigest, expiryManifestSha256: expiry.manifestSha256, expiryProducerCodeDigest: producer.codeDigest, expiryProducerPipelineCommit: producer.pipelineCommit },
      nativeLocalStorage: true, storageMock: false, oldUntrackedSimulationsIncluded: false, checks, results,
      screenshot: { name: 'rights-expiry.png', sha256: digest(readFileSync(join(evidenceDir, 'rights-expiry.png'))) },
      limits: ['synthetic_only', 'no_personal_profile', 'controlled_trust_injection', 'fixed_test_clock', 'no_production_ui_acceptance', 'no_authenticated_production_retraction_channel', 'reload_is_same_origin_not_a_durable_trusted_store']
    };
    writeFileSync(join(evidenceDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(external, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  try {
    console.log(JSON.stringify(await runBrowserSmoke({ sourceCommit: option('--source-commit'), evidenceDir: option('--evidence-dir') }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'BROWSER_SMOKE_FAILED' }));
    process.exitCode = 1;
  }
}
