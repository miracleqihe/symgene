import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import knowledge from '../../src/content/knowledge.json' with { type: 'json' };
import profiles from '../../src/content/drugProfiles.json' with { type: 'json' };
import { professionalFor, professionalFields } from '../../src/content/professional.js';
import { medicalPoints } from '../../src/content/medicalText.js';
import { createEnvelope, validateEnvelope } from '../../src/storage/migrations.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../../src/storage/constants.js';
import { runRecoveryDrill } from './recovery-drill.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const out = join(ROOT, 'work/review-evidence'); mkdirSync(out, { recursive: true });
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const report = { status: 'RUNNING', sourceHead: process.env.REVIEW_SOURCE_HEAD || git('rev-parse', 'HEAD'),
  checkoutHead: git('rev-parse', 'HEAD'), worktreeDirty: Boolean(git('status', '--porcelain')),
  medicalApproval: 'not_asserted', rightsApproval: 'not_asserted',
  publicLanguageApproval: 'not_asserted', checks: [], screenshots: [],
  limitations: ['fresh browser context; fictional storage data only', 'reduced motion; external font CSS blocked',
    'copy uses instrumented browser Clipboard API; native OS clipboard not tested',
    'renders and source pointers are evidence for review, not clinical verification'] };
const highRisk = ['citalopram', 'escitalopram', 'clozapine', 'lithium'];
const comparisons = highRisk.map(id => {
  const base = knowledge.drugs.find(d => d.id === id); assert.ok(base, id);
  const display = professionalFor(base), profile = profiles[id];
  return { id, name: base.name, snapshotDigest: JSON.parse(readFileSync(join(ROOT, 'legacy-content.lock'))).digest,
    reviewer: null, medicalDecision: null, languageDecision: null, rightsDecision: null,
    note: 'Original project manuscript vs effective display; no source-book passages are reproduced.',
    fields: professionalFields.map(([field, label]) => ({ field, label, original: base[field] || '',
      effective: display[field] || '', semanticPoints: medicalPoints(display[field]).length,
      changeReasons: (profile.amendments || []).filter(a => a.field === field).map(a => a.reason),
      publicEvidence: [...(display.fieldEvidence?.[field] || []), ...(display.fieldAmendments?.[field]?.mappedEvidence || [])]
        .map(p => ({ pointIndex: p.pointIndex, scope: p.scope, sources: (p.sources || []).map(s =>
          ({ id: s.id, region: s.region, version: s.updated || null, url: s.url || null,
            locator: s.url?.startsWith('https://') ? s.locator : 'private locator retained in source profile; not republished here' })) })),
      regionalInformation: profile.regionalReview, qualifiedMedicalReview: null })) };
});
writeFileSync(join(out, 'content-comparison.json'), JSON.stringify(comparisons, null, 2) + '\n');
let browser, server;
const errors = [];
try {
  if (process.platform === 'linux') {
    // A generic language preference can pick a Latin default despite an
    // installed fallback. Require a font that actually covers U+4E2D (中).
    const family = execFileSync('fc-match', ['-f', '%{family}', ':charset=4e2d'], { encoding: 'utf8' });
    report.chineseFontCandidate = family;
    const charset = execFileSync('fc-match', ['-f', '%{charset}', ':charset=4e2d'], { encoding: 'utf8' });
    const hasChineseGlyph = charset.trim().split(/\s+/).some(range => {
      const [start, end = start] = range.split('-').map(value => Number.parseInt(value, 16));
      return start <= 0x4e2d && end >= 0x4e2d;
    });
    assert.ok(hasChineseGlyph, `A font covering U+4E2D must be installed before evidence capture; matched ${family}`);
    report.chineseFont = family;
    report.verifiedChineseGlyph = 'U+4E2D';
  } else report.chineseFont = 'Windows system Chinese fallback; visually inspect captured pages';
  server = await preview({ root: ROOT, preview: { host: '127.0.0.1', port: 4188, strictPort: true } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.REVIEW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.REVIEW_CHROMIUM_EXECUTABLE } : {}) });
  report.browser = browser.version();
  const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { async writeText(value) { window.__reviewClipboard = value; } } }));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const go = async () => { await page.goto('http://127.0.0.1:4188/', { waitUntil: 'networkidle' }); };
  async function screenshot(name) {
    await page.screenshot({ path: join(out, name), fullPage: true }); report.screenshots.push(name);
  }
  async function dialogCheck(name) {
    const dialog = page.getByRole('dialog'), text = dialog.getByLabel('完整教学材料');
    const value = await text.inputValue(); assert.ok(value.length > 1000);
    await dialog.getByRole('button', { name: '复制完整材料', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__reviewClipboard), value);
    const downloadEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载 Markdown', exact: true }).click();
    const download = await downloadEvent; await download.saveAs(join(out, name));
    assert.equal(readFileSync(join(out, name), 'utf8'), value);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
  }
  async function openLibrary(name) {
    const destination = page.getByRole('navigation', { name: '知识栏目' }).getByRole('button', { name, exact: true });
    const toggle = page.getByRole('button', { name: '栏目', exact: true });
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await destination.click();
  }
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 }); await go();
    const global = page.getByRole('button', { name: '全局 Agent · 一起读懂', exact: true });
    await global.click(); await dialogCheck(`global-${width}.md`);
    assert.ok(await global.evaluate(n => n === document.activeElement));
    for (const id of highRisk) {
      await go(); await page.getByRole('button', { name: '向下浏览药物页面', exact: true }).click();
      const name = knowledge.drugs.find(item => item.id === id).name;
      await page.locator('.drug-index button').filter({ hasText: name }).first().click();
      const detail = page.locator('.detail-article'); await detail.getByRole('heading', { name, exact: true }).waitFor();
      for (const label of ['禁忌与警示', '特殊人群', '随访与监测']) {
        const fact = detail.locator('.fact').filter({ has: page.getByText(label, { exact: true }) });
        assert.ok((await fact.locator('li').count()) > 0, `${id}/${label}`);
      }
      const tabs = page.getByRole('tab'); assert.equal(await tabs.count(), 5);
      const points = [];
      for (let i = 0; i < 5; i++) { await tabs.nth(i).click(); points.push(await page.getByRole('tabpanel').locator('li').count()); }
      assert.ok(points.every(n => n > 0)); await tabs.first().click();
      await detail.getByRole('heading', { name, exact: true }).scrollIntoViewIfNeeded();
      await screenshot(`${id}-${width}-overview.png`);
      await detail.getByText('随访与监测', { exact: true }).scrollIntoViewIfNeeded();
      await screenshot(`${id}-${width}-monitoring.png`);
      const trigger = page.getByRole('button', { name: /教学 Prompt/ }).first(); await trigger.click();
      await dialogCheck(`${id}-${width}.md`); assert.ok(await trigger.evaluate(n => n === document.activeElement));
      assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2));
      report.checks.push({ width, drug: id, tabs: 5, semanticPointCounts: points,
        warningsSpecialPopulationsMonitoringRendered: true, copyCallAndDownloadMatch: true, escapeFocus: true });
    }
    await go(); await openLibrary('疾病科普');
    const ocd = knowledge.disorders.find(d => d.id === 'ocd'); assert.ok(ocd);
    await page.locator('.disorder-index button').filter({ hasText: ocd.name }).first().click();
    const caseItem = knowledge.cases.find(c => c.disorderId === ocd.id); assert.ok(caseItem);
    const caseTrigger = page.locator('.reading-related button').filter({ hasText: caseItem.title });
    await caseTrigger.click();
    await page.getByRole('button', { name: '返回案例列表', exact: true }).waitFor();
    assert.ok((await page.locator('.case-detail').count()) > 0 || (await page.getByText('虚构教学案例', { exact: false }).count()) > 0);
    await screenshot(`case-${width}.png`);
    await page.getByRole('button', { name: '返回案例列表', exact: true }).click();
    const restored = page.locator('.case-index-item').filter({ hasText: caseItem.title }); await restored.waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('case-index-item'));
    assert.ok(await restored.evaluate(n => n === document.activeElement && n.isConnected));
    await go(); const search = page.getByRole('textbox', { name: '描述你正在经历的情况' });
    await search.fill('持续低落、早醒，工作效率下降');
    // The target comes from the existing public search UI, never a fabricated diagnosis.
    const searchButton = page.locator('.search-results button').first();
    await searchButton.waitFor(); await searchButton.click();
    await page.getByRole('button', { name: '返回列表', exact: true }).waitFor();
    await go(); await openLibrary('信息可视化');
    await page.getByRole('heading', { name: '精神疾病数据图谱', exact: true }).waitFor();
    await screenshot(`atlas-${width}.png`);
    await page.getByRole('tab', { name: '中国资源地图', exact: true }).click();
    await page.getByRole('heading', { name: '中国心理治疗资源地图', exact: true }).waitFor();
    assert.ok(await page.locator('.china-map-svg path').count() > 0);
    await screenshot(`china-atlas-${width}.png`);
    report.checks.push({ width, diseaseCaseRelatedNavigation: true, caseCloseVisibleFocus: true, searchNavigation: true, existingAtlasRenders: true, existingChinaMapRenders: true });
  }

  // A real v4 override, tombstone, custom entry and backups in a disposable profile.
  const saved = JSON.parse(JSON.stringify(knowledge));
  saved.drugs.find(d => d.id === 'citalopram').sideEffects = '虚构验收：保留的本地修改。';
  saved.resources.push({ id: 'example-review-resource', kind: '网站', title: '虚构自定义资源', description: '仅用于验收', url: 'https://example.org/resource', source: 'example' });
  saved.resources = saved.resources.filter(r => r.id !== knowledge.resources[0].id);
  const envelope = createEnvelope(saved, { savedAt: '2026-10-18T00:00:00.000Z',
    localOverrides: { drugs: { citalopram: ['sideEffects'] } },
    seedIds: Object.fromEntries(Object.entries(knowledge).map(([kind, entries]) => [kind, entries.map(item => item.id)])),
    deletedIds: { resources: [knowledge.resources[0].id] } });
  assert.deepEqual(validateEnvelope(envelope), []);
  const originalRaw = JSON.stringify(envelope), backupKey = BACKUP_KEY_PREFIX + 'example-review';
  await page.evaluate(({ key, raw, backup }) => { localStorage.setItem(key, raw); localStorage.setItem(backup, 'fictional-backup-marker'); localStorage.setItem('symgene-t02-development:example-review', 'fictional-isolated-marker'); },
    { key: STORAGE_KEY, raw: originalRaw, backup: backupKey });
  report.recoveryDrill = await runRecoveryDrill();
  await go();
  const retained = await page.evaluate(({ key, backup }) => ({ envelope: JSON.parse(localStorage.getItem(key)),
    backup: localStorage.getItem(backup), isolated: localStorage.getItem('symgene-t02-development:example-review') }), { key: STORAGE_KEY, backup: backupKey });
  assert.equal(retained.envelope.schemaVersion, 4);
  assert.equal(retained.envelope.data.drugs.find(d => d.id === 'citalopram').sideEffects, '虚构验收：保留的本地修改。');
  assert.ok(retained.envelope.data.resources.some(r => r.id === 'example-review-resource'));
  assert.ok(!retained.envelope.data.resources.some(r => r.id === knowledge.resources[0].id));
  assert.equal(retained.backup, 'fictional-backup-marker'); assert.equal(retained.isolated, 'fictional-isolated-marker');
  report.storageV4 = { overridePreserved: true, customEntryPreserved: true, tombstonePreserved: true,
    backupPreserved: true, syntheticNamespaceUnchanged: true, note: 'disposable content-recovery drill and real browser v4 reload; no active user data was read' };
  await context.close(); assert.deepEqual(errors, []); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message.replaceAll(ROOT, '<workspace>'); process.exitCode = 1;
} finally {
  report.pageErrors = errors; writeFileSync(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const body = ['<h1>心鉴：工程与内容审读证据</h1>', '<p>自动验收与原稿对照，不代表医学、公众表达或权利批准。原书与私人路径不在本包。</p>',
    `<pre>${escape(JSON.stringify(report, null, 2))}</pre>`, '<p><a href="content-comparison.json">四种高风险药物原稿／有效正文／公开逐点来源对照</a></p>',
    ...report.screenshots.map(path => `<figure><figcaption>${escape(path)}</figcaption><img loading="lazy" src="${path}" style="max-width:100%"></figure>`)].join('\n');
  writeFileSync(join(out, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>心鉴评审证据</title><body>' + body + '</body></html>');
  if (browser) await browser.close(); if (server) await new Promise(done => server.httpServer.close(done));
  console.log(JSON.stringify({ status: report.status, screenshots: report.screenshots.length, checks: report.checks.length, failure: report.failure || null }));
}
