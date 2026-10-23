import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startDevelopmentConsumer, loadDevelopmentBootstrap } from './dev-consumer.mjs';
import { adaptVerifiedBundle } from '../../src/content/adapter.js';
import { createEnvelope } from '../../src/storage/migrations.js';
import { upsertEntry, deleteEntry } from '../../src/storage/operations.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../../src/storage/constants.js';
import { DEVELOPMENT_STORAGE_PREFIX, LEDGER_KEY } from '../../src/dev/t02-storage.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = resolve(ROOT, '../../.t02-evidence/extended-2026-10-15/website');
const HASH_FILES = ['scripts/t02/consumer-vite-server.mjs', 'scripts/t02/dev-consumer.mjs', 'scripts/t02/dev-consumer-browser.mjs', 'src/dev/t02-consumer.jsx', 'src/dev/t02-consumer.css', 'src/dev/t02-session.js', 'src/dev/t02-storage.js', 'src/content/adapter.js', 'src/search.js', 'src/storage/constants.js', 'src/storage/migrations.js', 'src/storage/operations.js', 'src/storage/storage.js', 'src/storage/importExport.js', 'content-pack.lock', 'vendor/t02/provenance.json'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function runDevelopmentBrowser({ evidenceDir = join(EVIDENCE, 'react-browser'), playwrightModule = process.env.SYM_T02_PLAYWRIGHT_MODULE, onStage = () => {} } = {}) {
  if (process.versions.node.split('.')[0] !== '22') fail('DEV_BROWSER_NODE22_REQUIRED');
  if (!resolve(evidenceDir).startsWith(EVIDENCE + '/')) fail('DEV_BROWSER_EVIDENCE_OUTSIDE_GIT_REQUIRED');
  mkdirSync(EVIDENCE, { recursive: true });
  let component = EVIDENCE;
  for (const part of ['', ...resolve(evidenceDir).slice(EVIDENCE.length + 1).split('/')]) {
    if (part) component = join(component, part);
    if (!existsSync(component)) mkdirSync(component);
    if (!lstatSync(component).isDirectory() || lstatSync(component).isSymbolicLink()) fail('DEV_BROWSER_EVIDENCE_UNSAFE');
  }
  rmSync(join(evidenceDir, 'result.json'), { force: true });
  const bootstrap = await loadDevelopmentBootstrap();
  const candidate = bootstrap.packs.find((item) => item.contentVersion === bootstrap.candidateVersion);
  const seed = adaptVerifiedBundle(candidate.bundle, { allowSimulation: true }).seedData;
  let protectedEnvelope = createEnvelope(seed);
  protectedEnvelope = upsertEntry(protectedEnvelope, 'disorders', { ...seed.disorders[0], summary: '完全虚构的原应用受保护覆盖' }, { seedData: seed });
  protectedEnvelope = upsertEntry(protectedEnvelope, 'cases', { ...seed.cases[0], id: 'fictional-original-user-case', title: '完全虚构的原应用受保护案例' }, { seedData: seed });
  protectedEnvelope = deleteEntry(protectedEnvelope, 'resources', seed.resources[0].id, seed);
  const original = { [STORAGE_KEY]: JSON.stringify(protectedEnvelope), [`${BACKUP_KEY_PREFIX}fictional-protected`]: JSON.stringify(protectedEnvelope), 'fictional-unrelated-key': 'fictional-original-marker' };
  const originalDigest = sha256(JSON.stringify(original));
  const modulePath = playwrightModule ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const { chromium } = await import(pathToFileURL(modulePath));
  const playwrightVersion = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'))).version;
  onStage({ stage: 'start', consumer: 'development' });
  const server = await startDevelopmentConsumer({ enabled: true });
  let browser;
  let debugPage;
  let completedReport;
  let checks = 0;
  const check = (value, code) => { if (!value) fail(code); checks++; };
  try {
    onStage({ stage: 'ready', consumer: 'development', origin: new URL(server.url).origin });
    browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    const origin = new URL(server.url).origin;
    let externalRequests = 0;
    let pageErrors = 0;
    let consoleErrors = 0;
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== origin) { externalRequests++; return route.abort('blockedbyclient'); }
      return route.continue();
    });
    await context.addInitScript(({ original }) => {
      if (localStorage.getItem('fictional-guard-installed') !== 'true') {
        for (const [key, value] of Object.entries(original)) localStorage.setItem(key, value);
        localStorage.setItem('fictional-guard-installed', 'true');
      }
    }, { original });
    const page = await context.newPage();
    debugPage = page;
    page.on('domcontentloaded', () => onStage({ stage: 'domcontentloaded', consumer: 'development' }));
    page.on('pageerror', (cause) => { pageErrors++; onStage({ stage: 'pageerror', consumer: 'development', message: cause.message }); });
    page.on('response', (response) => { if (new URL(response.url()).pathname.endsWith('/bootstrap')) onStage({ stage: 'snapshot-fetch', consumer: 'development', status: response.status() }); });
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors++; });
    const state = async () => {
      await page.getByTestId('consumer-state').waitFor({ state: 'attached' });
      return JSON.parse(await page.getByTestId('consumer-state').textContent());
    };
    const protectedUnchanged = () => page.evaluate(({ original, prefix }) => {
      const keys = Object.keys(localStorage).filter((key) => !key.startsWith(prefix));
      return keys.length === Object.keys(original).length + 1
        && localStorage.getItem('fictional-guard-installed') === 'true'
        && Object.entries(original).every(([key, value]) => localStorage.getItem(key) === value);
    }, { original, prefix: DEVELOPMENT_STORAGE_PREFIX });
    await page.goto(server.url, { waitUntil: 'networkidle' });
    check(await page.getByRole('heading', { name: '内容包消费演练', exact: true }).count() === 1, 'DEV_BROWSER_REACT_NOT_MOUNTED');
    onStage({ stage: 'react-mount', consumer: 'development' });
    check(await page.evaluate(() => localStorage instanceof Storage && Object.getPrototypeOf(localStorage) === Storage.prototype), 'DEV_BROWSER_NATIVE_STORAGE_MISSING');
    check(Object.values((await state()).counts).every((count) => count === 0), 'DEV_BROWSER_UNTRUSTED_CONTENT_VISIBLE');
    check(await protectedUnchanged(), 'DEV_BROWSER_ORIGINAL_STORAGE_CHANGED');
    await page.getByRole('button', { name: '注入虚构可信状态', exact: true }).click();
    check((await state()).counts.disorders === 1, 'DEV_BROWSER_TRUSTED_POSITIVE_CONTROL_FAILED');
    await page.getByLabel('搜索虚构条目', { exact: true }).fill(seed.disorders[0].name);
    const search = page.getByTestId('search-results');
    await search.getByRole('button', { name: seed.disorders[0].name, exact: true }).click();
    check((await state()).detailVisible && (await state()).searchDisorders === 1, 'DEV_BROWSER_SEARCH_DETAILS_FAILED');
    await page.getByRole('button', { name: '写入虚构本地编辑', exact: true }).click();
    const edited = await state();
    check(edited.rawCounts.cases === 2 && edited.overrideCount > 0 && edited.tombstoneCount === 1, 'DEV_BROWSER_EDIT_METADATA_MISSING');
    await page.getByRole('button', { name: '创建隔离备份', exact: true }).click();
    check((await state()).backupCount >= 1, 'DEV_BROWSER_BACKUP_MISSING');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出虚构备份', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = []; for await (const bytes of stream) chunks.push(bytes);
    const exported = Buffer.concat(chunks);
    check(JSON.parse(exported).synthetic === true && JSON.parse(exported).schemaVersion === 4, 'DEV_BROWSER_EXPORT_INVALID');
    await page.reload({ waitUntil: 'networkidle' });
    const reloaded = await state();
    check(reloaded.overrideCount === edited.overrideCount && reloaded.tombstoneCount === 1 && reloaded.rawCounts.cases === 2 && reloaded.fresh, 'DEV_BROWSER_RELOAD_LOST_EDITS');
    await page.getByLabel('搜索虚构条目', { exact: true }).fill(seed.disorders[0].name);
    await page.getByTestId('search-results').getByRole('button', { name: seed.disorders[0].name, exact: true }).click();
    await page.getByRole('button', { name: '撤回虚构疾病', exact: true }).click();
    const withdrawn = await state();
    check(withdrawn.counts.disorders === 0 && withdrawn.counts.cases === 0 && !withdrawn.detailVisible && withdrawn.searchDisorders === 0 && withdrawn.searchCases === 0, 'DEV_BROWSER_WITHDRAWAL_REVIVED');
    check(withdrawn.rawCounts.disorders === 1 && withdrawn.rawCounts.cases === 2 && withdrawn.overrideCount > 0 && withdrawn.tombstoneCount === 1, 'DEV_BROWSER_WITHDRAWAL_ERASED_USER_DATA');
    await page.getByLabel('导入虚构备份', { exact: true }).setInputFiles({ name: 't02-synthetic-backup.json', mimeType: 'application/json', buffer: exported });
    await page.getByRole('button', { name: '确认导入虚构备份', exact: true }).waitFor();
    check((await state()).sequence === withdrawn.sequence, 'DEV_BROWSER_IMPORT_PREVIEW_MUTATED_SAFETY');
    await page.getByRole('button', { name: '确认导入虚构备份', exact: true }).click();
    check((await state()).counts.disorders === 0 && (await state()).sequence === withdrawn.sequence, 'DEV_BROWSER_IMPORT_REVIVED_WITHDRAWAL');
    const oldVersion = bootstrap.packs.find((item) => item.contentVersion !== bootstrap.candidateVersion).contentVersion;
    await page.getByLabel('已核验合成包', { exact: true }).selectOption(oldVersion);
    check((await state()).selected === oldVersion && (await state()).counts.disorders === 0, 'DEV_BROWSER_ROLLBACK_REVIVED_WITHDRAWAL');
    await page.getByRole('button', { name: '恢复最新隔离备份', exact: true }).click();
    check((await state()).counts.disorders === 0 && (await state()).sequence === withdrawn.sequence, 'DEV_BROWSER_RESTORE_REVIVED_WITHDRAWAL');
    await page.reload({ waitUntil: 'networkidle' });
    const rollbackReloaded = await state();
    check(rollbackReloaded.selected === oldVersion && rollbackReloaded.sequence === withdrawn.sequence && rollbackReloaded.counts.disorders === 0, 'DEV_BROWSER_ROLLBACK_RELOAD_REVIVED');
    const rawBeforeBadImport = await page.evaluate(({ prefix, key }) => localStorage.getItem(prefix + key), { prefix: DEVELOPMENT_STORAGE_PREFIX, key: STORAGE_KEY });
    await page.getByLabel('导入虚构备份', { exact: true }).setInputFiles({ name: 'fictional-invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.getByRole('alert').waitFor();
    check(await page.evaluate(({ prefix, key, raw }) => localStorage.getItem(prefix + key) === raw, { prefix: DEVELOPMENT_STORAGE_PREFIX, key: STORAGE_KEY, raw: rawBeforeBadImport }), 'DEV_BROWSER_BAD_IMPORT_OVERWROTE_DATA');
    const invalidEncodingValue = JSON.parse(exported);
    invalidEncodingValue.data.disorders[0].summary = 'fictional-utf8-slot';
    const invalidEncodingBytes = Buffer.from(JSON.stringify(invalidEncodingValue));
    invalidEncodingBytes[invalidEncodingBytes.indexOf('fictional-utf8-slot')] = 0xff;
    await page.getByLabel('导入虚构备份', { exact: true }).setInputFiles({ name: 'fictional-invalid-utf8.json', mimeType: 'application/json', buffer: invalidEncodingBytes });
    await page.getByRole('alert').filter({ hasText: 'DEV_IMPORT_UTF8_INVALID' }).waitFor();
    check(await page.getByRole('button', { name: '确认导入虚构备份', exact: true }).count() === 0, 'DEV_BROWSER_BAD_UTF8_IMPORT_PREVIEWED');
    check(await page.evaluate(({ prefix, key, raw }) => localStorage.getItem(prefix + key) === raw, { prefix: DEVELOPMENT_STORAGE_PREFIX, key: STORAGE_KEY, raw: rawBeforeBadImport }), 'DEV_BROWSER_BAD_UTF8_OVERWROTE_DATA');
    check(await protectedUnchanged(), 'DEV_BROWSER_ORIGINAL_STORAGE_CHANGED');
    const viewports = [];
    for (const width of [1920, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => ({ noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth, scrollable: document.documentElement.scrollHeight > innerHeight }));
      check(layout.noHorizontalOverflow, 'DEV_BROWSER_HORIZONTAL_OVERFLOW');
      await page.getByRole('heading', { name: '详情', exact: true }).scrollIntoViewIfNeeded();
      check(await page.getByRole('heading', { name: '详情', exact: true }).isVisible(), 'DEV_BROWSER_DETAIL_SCROLL_FAILED');
      await page.screenshot({ path: join(evidenceDir, `react-${width}.png`), fullPage: true });
      viewports.push({ width, ...layout });
    }
    await page.getByLabel('搜索虚构条目', { exact: true }).focus();
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement !== document.body), 'DEV_BROWSER_KEYBOARD_FOCUS_LOST');
    check(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'DEV_BROWSER_REDUCED_MOTION_FAILED');
    check((await state()).counts.drugs > 0, 'DEV_BROWSER_TIMER_POSITIVE_CONTROL_FAILED');
    // Shorten only this fictional context's own ledger expiry. This controlled
    // test is not a publisher signature or an authenticated emergency channel.
    await page.evaluate(({ prefix, key }) => {
      const value = JSON.parse(localStorage.getItem(prefix + key));
      value.ledger.expiresAt = new Date(Date.now() + 150).toISOString();
      localStorage.setItem(prefix + key, JSON.stringify(value));
    }, { prefix: DEVELOPMENT_STORAGE_PREFIX, key: LEDGER_KEY });
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid=consumer-state]').textContent).fresh === false);
    check(Object.values((await state()).counts).every((count) => count === 0), 'DEV_BROWSER_TIMER_EXPIRY_VISIBLE');
    await page.getByRole('button', { name: '模拟撤稿状态过期', exact: true }).click();
    check(!(await state()).fresh && Object.values((await state()).counts).every((count) => count === 0), 'DEV_BROWSER_EXPIRY_VISIBLE');
    await page.reload({ waitUntil: 'networkidle' });
    const expired = await state();
    check(!expired.fresh && expired.simulatedTimeOffsetMs > 0 && Object.values(expired.counts).every((count) => count === 0), 'DEV_BROWSER_EXPIRY_RELOAD_VISIBLE');
    check(await protectedUnchanged(), 'DEV_BROWSER_ORIGINAL_STORAGE_CHANGED');
    await page.screenshot({ path: join(evidenceDir, 'react-expired.png'), fullPage: true });
    await page.waitForTimeout(5100);
    check(pageErrors === 0 && consoleErrors === 0 && externalRequests === 0, 'DEV_BROWSER_RUNTIME_ERROR');
    await context.close();
    const rejected = await browser.newContext({ serviceWorkers: 'block' });
    await rejected.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== origin) { externalRequests++; return route.abort('blockedbyclient'); }
      if (new URL(route.request().url()).pathname.endsWith('/bootstrap')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ marker: 'fictional-incomplete-package' }) });
      return route.continue();
    });
    const badPage = await rejected.newPage();
    await badPage.goto(server.url, { waitUntil: 'networkidle' });
    await badPage.getByText('DEV_BOOTSTRAP_REJECTED', { exact: true }).waitFor();
    check(await badPage.evaluate(() => localStorage.length === 0), 'DEV_BROWSER_BAD_BOOTSTRAP_MUTATED_STORAGE');
    await rejected.close();
    const sourceHashes = HASH_FILES.map((path) => ({ path, sha256: sha256(readFileSync(join(ROOT, path))) }));
    const report = { code: 'DEV_REACT_BROWSER_PASS', scope: 'independent_react_development_app', production: 'legacy',
      sourceCommit: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim(),
      sourceState: 'working_tree_source_hashes_not_committed_acceptance', sourceHashes,
      runtime: { node: process.version, playwright: playwrightVersion, chromium: browser.version(), freshContext: true, nativeLocalStorage: true, storageMock: false },
      runtimeExpiryRefreshMs: 1000, controlledShortExpiryInjection: true,
      subpath: new URL(server.url).pathname, checks, viewports, network: { externalPageRequests: externalRequests, pageErrors, consoleErrors },
      originalStorage: { fixtureOnly: true, schemaVersion: 4, sha256: originalDigest, retained: true, override: true, tombstone: true, customCase: true, backup: true },
      export: { bytes: exported.length, sha256: sha256(exported), actualDownloadAndUpload: true },
      final: expired, screenshots: [...viewports.map(({ width }) => `react-${width}.png`), 'react-expired.png'].map((name) => ({ name, sha256: sha256(readFileSync(join(evidenceDir, name))) })),
      limits: ['synthetic_only', 'independent_development_ui_not_production_main', 'controlled_synthetic_trust_injection', 'simulated_clock_offset', 'no_personal_profiles', 'no_authenticated_production_retraction_channel', 'no_formal_human_acceptance'] };
    completedReport = report;
    return report;
  } catch (error) {
    if (debugPage && !debugPage.isClosed()) await debugPage.screenshot({ path: join(evidenceDir, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    const closed = await Promise.allSettled([browser?.close(), server.app.close()]);
    onStage({ stage: 'closed', consumer: 'development', serverClosed: !server.app.httpServer.listening });
    const errors = closed.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) {
      writeFileSync(join(evidenceDir, 'failure.json'), JSON.stringify({ status: 'FAIL', code: 'DEV_BROWSER_CLEANUP_FAILED', checks }, null, 2) + '\n');
      throw new AggregateError(errors, 'DEV_BROWSER_CLEANUP_FAILED');
    }
    if (completedReport) writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify(completedReport, null, 2) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--evidence-dir')) fail('DEV_BROWSER_ARGUMENT_INVALID');
    console.log(JSON.stringify(await runDevelopmentBrowser({ evidenceDir: args[1] }), null, 2));
  } catch (error) { console.error(JSON.stringify({ code: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'DEV_BROWSER_FAILED' })); process.exitCode = 1; }
}
