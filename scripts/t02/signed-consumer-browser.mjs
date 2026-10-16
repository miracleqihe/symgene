import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startSignedConsumer } from './signed-consumer.mjs';
import { adaptVerifiedBundle } from '../../src/content/adapter.js';
import { createEnvelope } from '../../src/storage/migrations.js';
import { upsertEntry, deleteEntry } from '../../src/storage/operations.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../../src/storage/constants.js';
import { SIGNED_STORAGE_PREFIX, SIGNED_SAFETY_KEY } from '../../src/dev/t02-signed-session.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = resolve(ROOT, '../../.t02-evidence/m4-m5-gated-2026-10-15/website');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const HASH_FILES = ['scripts/t02/signed-consumer.mjs', 'scripts/t02/signed-consumer-browser.mjs', 'src/dev/t02-signed-consumer.jsx', 'src/dev/t02-signed-session.js', 'src/content/adapter.js', 'src/search.js', 'src/storage/storage.js', 'content-pack.lock'];

/** Real Chromium reads the opt-in React application through the signed gateway. */
export async function runSignedBrowser({ producerRoot = resolve(ROOT, '../symgene-data-delivery'),
  evidenceDir = join(EVIDENCE, 'signed-browser'), playwrightModule, fixtureOptions = {} } = {}) {
  if (process.versions.node.split('.')[0] !== '22') fail('SIGNED_BROWSER_NODE22_REQUIRED');
  const target = resolve(evidenceDir);
  if (!target.startsWith(EVIDENCE + '/')) fail('SIGNED_BROWSER_EVIDENCE_OUTSIDE_GIT_REQUIRED');
  mkdirSync(EVIDENCE, { recursive: true });
  let component = EVIDENCE;
  for (const part of ['', ...target.slice(EVIDENCE.length + 1).split('/')]) {
    if (part) component = join(component, part);
    if (!existsSync(component)) mkdirSync(component);
    if (!lstatSync(component).isDirectory() || lstatSync(component).isSymbolicLink()) fail('SIGNED_BROWSER_EVIDENCE_UNSAFE');
  }
  const { createReleaseTestFixture } = await import(pathToFileURL(join(producerRoot, 'src/release-test-fixture.mjs')));
  const { startReleaseGateway } = await import(pathToFileURL(join(producerRoot, 'src/release-gateway.mjs')));
  const { verifyPack } = await import(pathToFileURL(join(producerRoot, 'src/pack.mjs')));
  const fixture = await createReleaseTestFixture({ ...fixtureOptions, root: mkdtempSync(join(target, 'runtime-')) });
  const runtime = { snapshot: (request) => fixture.runtime.snapshot(request) };
  let gateway = await startReleaseGateway({ runtime });
  const gatewayPort = Number(new URL(gateway.url).port);
  const server = await startSignedConsumer({ enabled: true, gatewayURL: gateway.url, versions: fixture.versions, candidateVersion: fixture.candidateVersion });
  const modulePath = playwrightModule ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const { chromium } = await import(pathToFileURL(modulePath));
  let browser; let page;
  let checks = 0; let pageErrors = 0; let externalRequests = 0;
  const drills = []; const responses = [];
  const check = (value, code) => { if (!value) fail(code); checks++; };
  const drill = (scenario, initial, action, expected, observed, recovery) => drills.push({ scenario, initial, action, expected, observed, recovery });
  try {
    const initial = verifyPack(fixture.packages.get(fixture.candidateVersion).packDir, { allowSimulation: true });
    const seed = adaptVerifiedBundle(initial.bundle, { allowSimulation: true }).seedData;
    let protectedEnvelope = createEnvelope(seed);
    protectedEnvelope = upsertEntry(protectedEnvelope, 'disorders', { ...seed.disorders[0], summary: '完全虚构的原应用受保护覆盖' }, { seedData: seed });
    protectedEnvelope = upsertEntry(protectedEnvelope, 'cases', { ...seed.cases[0], id: 'fictional-protected-case', title: '完全虚构的原应用受保护案例' }, { seedData: seed });
    protectedEnvelope = deleteEntry(protectedEnvelope, 'resources', seed.resources[0].id, seed);
    const original = { [STORAGE_KEY]: JSON.stringify(protectedEnvelope), [`${BACKUP_KEY_PREFIX}fictional-protected`]: JSON.stringify(protectedEnvelope), 'fictional-unrelated': 'fictional-original-marker' };
    const originalDigest = sha256(JSON.stringify(original));
    browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    const origin = new URL(server.url).origin;
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', (route) => { if (new URL(route.request().url()).origin !== origin) { externalRequests++; return route.abort('blockedbyclient'); } return route.continue(); });
    await context.addInitScript(({ original }) => {
      if (!localStorage.getItem('fictional-signed-guard')) {
        for (const [key, value] of Object.entries(original)) localStorage.setItem(key, value);
        localStorage.setItem('fictional-signed-guard', 'true');
      }
    }, { original });
    page = await context.newPage();
    page.on('pageerror', () => pageErrors++);
    page.on('response', (response) => {
      if (response.url().includes('/t02-signed/snapshot?')) responses.push({ path: new URL(response.url()).pathname,
        version: new URL(response.url()).searchParams.get('version'), action: new URL(response.url()).searchParams.get('action'), status: response.status(), cacheControl: response.headers()['cache-control'] });
    });
    const state = async () => JSON.parse(await page.getByTestId('signed-consumer-state').textContent());
    const waitState = async (predicate) => {
      await page.waitForFunction(predicate, undefined, { timeout: 15000 }); return state();
    };
    const fresh = () => waitState(() => JSON.parse(document.querySelector('[data-testid=signed-consumer-state]')?.textContent ?? '{}').fresh === true);
    const hidden = () => waitState(() => {
      const value = JSON.parse(document.querySelector('[data-testid=signed-consumer-state]')?.textContent ?? '{}');
      return value.fresh === false && value.counts && Object.values(value.counts).every((count) => count === 0) && !value.detailVisible;
    });
    const unchanged = () => page.evaluate(({ original, prefix }) => Object.entries(original).every(([key, value]) => localStorage.getItem(key) === value)
      && Object.keys(localStorage).filter((key) => !key.startsWith(prefix)).length === Object.keys(original).length + 1, { original, prefix: SIGNED_STORAGE_PREFIX });
    // This application continuously polls. Wait for the asserted React state,
    // rather than requiring an unrelated period of network silence.
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await hidden();
    check(fixture.controls.adoptionRequestCount() === 0 && JSON.parse(readFileSync(join(fixture.paths.auditDirectory, 'operations.json'))).entries.length === 0,
      'SIGNED_BROWSER_STARTUP_CREATED_ADOPTION');
    await page.getByRole('button', { name: '签名采用所选测试版本', exact: true }).click();
    await fresh();
    check(await page.getByRole('heading', { name: '签名发布消费演练', exact: true }).count() === 1, 'SIGNED_BROWSER_REACT_MISSING');
    check(await page.getByRole('button', { name: /注入虚构可信状态|撤回虚构疾病|模拟撤稿状态过期/ }).count() === 0, 'SIGNED_BROWSER_SYNTHETIC_TRUST_CONTROL');
    check(await page.evaluate(() => localStorage instanceof Storage && Object.getPrototypeOf(localStorage) === Storage.prototype), 'SIGNED_BROWSER_NATIVE_STORAGE_MISSING');
    check((await state()).proof.publisherKeyId !== (await state()).proof.adopterKeyId, 'SIGNED_BROWSER_INDEPENDENT_ADOPTER_MISSING');
    const auditFile = join(fixture.paths.auditDirectory, 'operations.json');
    const auditBeforePolling = readFileSync(auditFile);
    for (let poll = 0; poll < 3; poll++) await page.waitForResponse(response => response.url().includes('/t02-signed/snapshot?')
      && new URL(response.url()).searchParams.get('action') === 'read' && response.status() === 200);
    check(readFileSync(auditFile).equals(auditBeforePolling) && fixture.controls.adoptionRequestCount() === 1, 'SIGNED_BROWSER_POLLING_CREATED_ADOPTION');
    await page.getByRole('button', { name: '签名采用所选测试版本', exact: true }).click();
    await waitState(() => JSON.parse(document.querySelector('[data-testid=signed-consumer-state]').textContent).proof?.audit.sequence === 2);
    check(fixture.controls.adoptionRequestCount() === 2, 'SIGNED_BROWSER_EXPLICIT_ADOPTION_MISSING');
    await page.getByLabel('搜索虚构条目', { exact: true }).fill(seed.disorders[0].name);
    await page.getByTestId('signed-search-results').getByRole('button', { name: seed.disorders[0].name, exact: true }).click();
    check((await state()).detailVisible && (await state()).searchDisorders === 1, 'SIGNED_BROWSER_SEARCH_DETAILS_MISSING');
    await page.getByRole('button', { name: '写入虚构本地编辑', exact: true }).click();
    await page.getByRole('button', { name: '创建隔离备份', exact: true }).click();
    const edited = await state();
    check(edited.overrideCount > 0 && edited.tombstoneCount === 1 && edited.backupCount >= 1 && edited.rawCounts.cases === 2, 'SIGNED_BROWSER_V4_METADATA_MISSING');
    check(await unchanged(), 'SIGNED_BROWSER_ORIGINAL_STORAGE_CHANGED');

    await context.setOffline(true); const offline = await hidden();
    check(!offline.proof && offline.rawCounts.cases === 2 && offline.backupCount === edited.backupCount, 'SIGNED_BROWSER_OFFLINE_CACHE_AUTHORIZED');
    const cached = await page.evaluate(({ prefix, key }) => JSON.parse(localStorage.getItem(prefix + key)), { prefix: SIGNED_STORAGE_PREFIX, key: SIGNED_SAFETY_KEY });
    check(!Object.hasOwn(cached, 'trusted') && !Object.hasOwn(cached, 'bundle') && cached.scope === 'denial-only-no-offline-authority', 'SIGNED_BROWSER_CACHE_CONTAINS_AUTHORITY');
    await context.setOffline(false); await fresh();
    drill('network-interruption-and-cache', 'Signed release visible with details and v4 edits', 'Chromium network goes offline', 'All rendered/search/detail content hidden; original edits retained', { fresh: offline.fresh, counts: offline.counts, detailVisible: offline.detailVisible, cacheScope: cached.scope }, 'Network restored; gateway reread restores verified visibility');

    for (const [name, operation] of [['checkpoint-unavailable', fixture.controls.checkpointUnavailable], ['checkpoint-stale', fixture.controls.checkpointStale]]) {
      await operation(true); const failed = await hidden();
      check(failed.rawCounts.cases === 2 && !failed.proof, 'SIGNED_BROWSER_CHECKPOINT_FAILURE_VISIBLE');
      await operation(false); await fresh();
      drill(name, 'Signed release visible', 'Independent checkpoint HTTP service fails or serves stale signed checkpoint', '503 no-store and React hides all content', { fresh: failed.fresh, counts: failed.counts, error: failed.error }, 'Independent latest checkpoint restored; gateway reread succeeds');
    }

    const targetIdentity = adaptVerifiedBundle(initial.bundle, { allowSimulation: true }).identities.find((item) => item.collection === 'disorders');
    await fixture.controls.retract(targetIdentity.canonicalId);
    await waitState(() => { const value = JSON.parse(document.querySelector('[data-testid=signed-consumer-state]').textContent); return value.fresh && value.sequence > 1 && value.counts.disorders === 0 && value.counts.cases === 0 && !value.detailVisible && value.searchDisorders === 0; });
    const withdrawn = await state();
    check(withdrawn.searchCases === 0 && withdrawn.rawCounts.cases === 2 && withdrawn.overrideCount > 0 && withdrawn.tombstoneCount === 1, 'SIGNED_BROWSER_DEPENDENCY_RETRACTION_FAILED');
    await page.screenshot({ path: join(target, 'signed-retracted.png'), fullPage: true });
    const oldVersion = fixture.versions.find((version) => version !== fixture.candidateVersion);
    await page.getByLabel('已配置测试版本', { exact: true }).selectOption(oldVersion); await fresh();
    const rolledBack = await state();
    check(rolledBack.selected === oldVersion && rolledBack.sequence === withdrawn.sequence && rolledBack.counts.disorders === 0 && rolledBack.counts.cases === 0, 'SIGNED_BROWSER_ROLLBACK_REVIVED');
    await page.getByRole('button', { name: '恢复最新隔离备份', exact: true }).click();
    check((await state()).counts.disorders === 0 && (await state()).sequence === withdrawn.sequence, 'SIGNED_BROWSER_BACKUP_RESTORE_REVIVED');
    await page.reload({ waitUntil: 'domcontentloaded' }); await fresh();
    check((await state()).selected === oldVersion && (await state()).counts.cases === 0 && (await state()).sequence === withdrawn.sequence, 'SIGNED_BROWSER_REFRESH_REVIVED');
    drill('signed-retraction-dependency-and-rollback', 'Disease, dependent seed and custom cases displayed before signed retraction', 'Retraction operator signs next event and independent checkpoint; website rolls back archive and restores backup', 'Disease/dependencies/search/detail remain hidden; user overrides/tombstone/backups retained', { withdrawn: { sequence: withdrawn.sequence, counts: withdrawn.counts, rawCounts: withdrawn.rawCounts }, rollback: { version: rolledBack.selected, counts: rolledBack.counts, sequence: rolledBack.sequence } }, 'Refresh verifies the latest ledger and retains rejection history across the configured archive versions');

    await fixture.controls.checkpointRollback(true); const rollbackCheckpoint = await hidden();
    await fixture.controls.checkpointRollback(false); await fresh();
    drill('checkpoint-regression', 'Sequence after retraction accepted', 'Independent service returns earlier signed checkpoint', 'Gateway rejects regression and React hides all content', { fresh: rollbackCheckpoint.fresh, sequence: rollbackCheckpoint.sequence, counts: rollbackCheckpoint.counts }, 'Latest checkpoint restored');

    await gateway.close(); gateway = null; const stopped = await hidden();
    await fixture.controls.restartRuntime();
    gateway = await startReleaseGateway({ runtime, port: gatewayPort }); await fresh();
    check((await state()).sequence === withdrawn.sequence && (await state()).counts.disorders === 0, 'SIGNED_BROWSER_SERVICE_RESTART_REVIVED');
    await fixture.controls.restartCheckpointService(); await fresh();
    await page.reload({ waitUntil: 'domcontentloaded' }); await fresh();
    check((await state()).sequence === withdrawn.sequence && (await state()).counts.cases === 0, 'SIGNED_BROWSER_RESTART_REFRESH_REVIVED');
    drill('service-restart-and-durable-recovery', 'Withdrawn content hidden after rollback', 'Stop gateway, recreate runtime from same ledger/archive/audit directories, restart gateway and independent checkpoint service', 'Failure hides content; recovery retains highest retraction and hidden dependencies', { unavailable: stopped.fresh, recoveredSequence: (await state()).sequence, recoveredCounts: (await state()).counts }, 'Browser refresh reconfirms persisted state');

    await fixture.controls.expireState(); const expired = await hidden();
    check(expired.rawCounts.cases === 2 && expired.overrideCount > 0 && expired.tombstoneCount === 1, 'SIGNED_BROWSER_EXPIRY_ERASED_EDITS');
    await fixture.controls.restoreFreshState(); await fresh();
    const afterExpiryRecovery = await state();
    check(afterExpiryRecovery.counts.disorders === 0 && afterExpiryRecovery.counts.cases === 0 && afterExpiryRecovery.sequence > withdrawn.sequence, 'SIGNED_BROWSER_EXPIRY_RECOVERY_REVIVED');
    drill('signed-event-expiry-and-recovery', 'Valid signed retraction retains hidden dependencies', 'Sign a short-lived next event and observe actual wall-clock expiry', 'Gateway refuses expired event; browser hides everything and preserves storage', { fresh: expired.fresh, counts: expired.counts, recoveredSequence: afterExpiryRecovery.sequence, recoveredCounts: afterExpiryRecovery.counts }, 'Operator signs a fresh next event and independent checkpoint; prior retractions remain effective');

    await fixture.controls.closeEmergency(); const emergency = await hidden();
    check(!emergency.proof && emergency.counts.disorders === 0, 'SIGNED_BROWSER_EMERGENCY_CLOSE_VISIBLE');
    await fixture.controls.restartRuntime(); await hidden();
    check(await unchanged(), 'SIGNED_BROWSER_ORIGINAL_STORAGE_CHANGED');
    drill('emergency-close-survives-restart', 'Withdrawn release still available for remaining safe content', 'Signed emergency shutdown and runtime restart', 'All content hidden across restart', { fresh: emergency.fresh, counts: emergency.counts, sequence: emergency.sequence }, 'Signed operator recovery is required; runtime restart alone does not reopen');
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'SIGNED_BROWSER_HORIZONTAL_OVERFLOW');
      await page.screenshot({ path: join(target, `signed-closed-${width}.png`), fullPage: true });
    }
    check(pageErrors === 0 && externalRequests === 0, 'SIGNED_BROWSER_PAGE_OR_EXTERNAL_ERROR');
    check(responses.some((response) => response.status === 200) && responses.some((response) => response.status === 503)
      && responses.every((response) => response.cacheControl === 'no-store'), 'SIGNED_BROWSER_NETWORK_CACHE_PROOF_MISSING');
    check(await page.evaluate(() => caches.keys().then((keys) => keys.length === 0)), 'SIGNED_BROWSER_CACHE_STORAGE_POPULATED');
    check(JSON.parse(readFileSync(auditFile)).entries.length === 3 && fixture.controls.adoptionRequestCount() === 3, 'SIGNED_BROWSER_AUDIT_GREW_WITH_READS');
    const report = { status: 'SIGNED_REACT_BROWSER_LOCAL_PASS', formalAdoption: 'BLOCKED', production: 'legacy',
      identities: 'local-test-only', reviews: 'simulation-only', checks, browser: await browser.version(),
      playwrightVersion: JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'))).version,
      originalStorageDigest: originalDigest, originalStoragePreserved: true, cacheAuthority: 'none-denial-only',
      pageErrors, externalRequests, responses, drills,
      implementation: HASH_FILES.map((file) => ({ file, sha256: sha256(readFileSync(join(ROOT, file))) })) };
    writeFileSync(join(target, 'signed-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } catch (cause) {
    if (page) { try { await page.screenshot({ path: join(target, 'signed-failure.png'), fullPage: true }); } catch { /* Browser may be unavailable. */ } }
    writeFileSync(join(target, 'signed-browser-failure.json'), JSON.stringify({ status: 'FAIL', code: cause.code ?? cause.name, checks, pageErrors, externalRequests, responses, drills }, null, 2) + '\n');
    throw cause;
  } finally { await browser?.close(); await server.app.close(); if (gateway) await gateway.close(); await fixture.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail('SIGNED_BROWSER_ARGUMENT_INVALID');
    const report = await runSignedBrowser();
    console.log(JSON.stringify({ status: report.status, checks: report.checks, drills: report.drills.length, production: report.production }));
  } catch (cause) { console.error(JSON.stringify({ status: 'FAIL', code: /^[A-Z0-9_]+$/.test(cause.code ?? '') ? cause.code : cause.name })); process.exitCode = 1; }
}
