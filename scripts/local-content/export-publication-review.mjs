import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLegacy } from './check-legacy.mjs';
import { auditRegionalCoverage } from '../../src/content/regionalAudit.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fail = code => { throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const text = value => JSON.stringify(value, null, 2) + '\n';
const safePath = value => typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value)
  && !value.split('/').some(part => !part || part === '.' || part === '..') && !isAbsolute(value);

function regular(root, path) {
  if (!safePath(path)) fail('REVIEW_PATH_REJECTED');
  let target = root;
  for (const part of path.split('/')) {
    target = join(target, part);
    if (lstatSync(target).isSymbolicLink()) fail('REVIEW_SYMLINK_REJECTED');
  }
  if (!lstatSync(target).isFile()) fail('REVIEW_FILE_REQUIRED');
  return readFileSync(target);
}

function inventory(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail('REVIEW_SYMLINK_REJECTED');
    if (entry.isDirectory()) return inventory(root, path);
    const bytes = regular(root, path);
    return [{ path, bytes: bytes.length, sha256: sha(bytes) }];
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

// This prepares evidence, never an approval or a production gate decision.
export function collectPublicationReview(root = ROOT, sourceIdentity = {}) {
  const lock = json(join(root, 'legacy-content.lock'));
  for (const file of lock.files) {
    const bytes = regular(root, file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('REVIEW_SOURCE_DRIFT');
  }
  const knowledge = json(join(root, 'src/content/knowledge.json'));
  const profiles = Object.fromEntries(['drugs', 'disorders', 'cases'].map((type, index) =>
    [type, json(join(root, `src/content/${['drug', 'disorder', 'case'][index]}Profiles.json`))]));
  const teaching = json(join(root, 'public/teaching/manifest.json'));
  const guides = json(join(root, 'public/agent/manifest.json'));
  const output = inventory(join(root, 'dist'));
  if (!output.some(file => file.path === 'index.html') || !output.some(file => file.path.startsWith('assets/') && file.path.endsWith('.js'))) fail('REVIEW_BUILD_REQUIRED');
  const generated = new Set(['teaching/manifest.json', 'agent/manifest.json', 'llms.txt', 'skills/mental-health-reading/SKILL.md']);
  const entries = [];
  const pending = () => ({ medical: null, publicLanguage: null, rights: null });
  const artifact = path => {
    const bytes = regular(join(root, 'public'), path);
    const built = regular(join(root, 'dist'), path);
    if (!bytes.equals(built)) fail('REVIEW_GENERATED_OUTPUT_DRIFT');
    generated.add(path);
    return { path: `site/${path}`, bytes: bytes.length, sha256: sha(bytes) };
  };
  const seen = new Set();
  for (const entry of teaching.entries) {
    if (!['drugs', 'disorders', 'cases'].includes(entry.type)) fail('REVIEW_ENTRY_TYPE_REJECTED');
    const seed = knowledge[entry.type].find(item => item.id === entry.id);
    const key = `${entry.type}/${entry.id}`;
    if (!seed || seen.has(key) || !/^[a-z0-9-]+$/.test(entry.id)
      || entry.material !== `teaching/${key}.md` || entry.prompt !== `teaching/${key}.prompt.md`) fail('REVIEW_ENTRY_BINDING_REJECTED');
    seen.add(key);
    const material = artifact(entry.material), prompt = artifact(entry.prompt);
    if (material.sha256 !== entry.sha256) fail('REVIEW_MATERIAL_DIGEST_MISMATCH');
    entries.push({ type: entry.type, id: entry.id, title: seed.name || seed.title,
      recordDigest: sha(canonical({ seed, profile: profiles[entry.type][entry.id] || null })),
      material, prompt, assignedTo: pending(), decisions: pending() });
  }
  const expected = ['drugs', 'disorders', 'cases'].reduce((count, type) => count + knowledge[type].length, 0);
  if (entries.length !== expected) fail('REVIEW_ENTRY_COVERAGE_MISMATCH');
  const guideRecords = guides.guides.map(guide => {
    const file = artifact(guide.path);
    if (file.sha256 !== guide.sha256) fail('REVIEW_GUIDE_DIGEST_MISMATCH');
    return { id: guide.id, title: guide.title, artifact: file, assignedTo: pending(), decisions: pending() };
  });
  guideRecords.push({ id: 'mental-health-reading-skill', artifact: artifact('skills/mental-health-reading/SKILL.md'), assignedTo: pending(), decisions: pending() });
  for (const path of generated) artifact(path);
  for (const file of output.filter(item => /^(teaching\/|agent\/|skills\/|llms\.txt$)/.test(item.path))) {
    if (!generated.has(file.path)) fail('REVIEW_UNINDEXED_GENERATED_FILE');
  }
  const regional = auditRegionalCoverage(knowledge.drugs, profiles.drugs);
  const sourceCatalog = [];
  for (const type of ['drugs', 'disorders', 'cases']) for (const entry of knowledge[type]) {
    for (const source of profiles[type][entry.id]?.sources || []) sourceCatalog.push({
      entry: `${type}/${entry.id}`, sourceId: source.id, title: source.title || null,
      kind: source.kind || null, region: source.region || null,
      publicURL: /^https?:\/\//.test(source.url || '') ? source.url : null,
      updated: source.updated || null, checkedAt: source.checkedAt || null,
      sourceFileSha256: source.fileSha256 || source.sourceFileSha256 || null,
      rightsDecision: null, rightsEvidence: null,
    });
  }
  return { format: 'symgene-publication-review-packet/1', status: 'PREPARED_NOT_APPROVED',
    sourceIdentity, snapshotVersion: lock.version, snapshotDigest: lock.digest,
    outputDigest: sha(canonical(output)), outputDigestMethod: 'SHA256 of recursively key-sorted compact JSON output inventory; paths relative to site/',
    output, sourceFiles: lock.files, counts: { ...lock.counts, entryReviews: entries.length, guideReviews: guideRecords.length },
    entries, resources: knowledge.resources.map(item => ({ id: item.id, title: item.name || item.title,
      recordDigest: sha(canonical(item)), assignedTo: pending(), decisions: pending() })),
    guides: guideRecords, sourceCatalog, regionalCoverage: regional,
    requiredDecisions: ['medical', 'publicLanguage', 'rights'],
    approvalAuthority: 'none; null decisions and file hashes confer no authority',
    limitations: ['The build is for restricted local review, not publication.',
      'An actual authenticated approval path is still required; this packet cannot open check:publication.',
      'A cn_product_verified record is metadata, not independent source or clinical approval.',
      'If source or output changes, collect a new packet and review its differences.'] };
}

export function writePublicationReview(root, destination, sourceIdentity = {}) {
  const out = resolve(destination);
  const inside = relative(resolve(root), out);
  if (!inside || !(inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))) fail('REVIEW_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  if (existsSync(out)) fail('REVIEW_OUTPUT_ALREADY_EXISTS');
  // Reject other checkouts and symlinked parents; private packets never become tracked files.
  try {
    execFileSync('git', ['-C', dirname(out), 'rev-parse', '--show-toplevel'], { stdio: 'ignore' });
    fail('REVIEW_OUTPUT_IN_GIT_REPOSITORY');
  } catch (error) { if (error.message === 'REVIEW_OUTPUT_IN_GIT_REPOSITORY') throw error; }
  for (let path = dirname(out); ; path = dirname(path)) {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) fail('REVIEW_OUTPUT_PARENT_REJECTED');
    if (dirname(path) === path) break;
  }
  const packet = collectPublicationReview(root, sourceIdentity);
  mkdirSync(out);
  for (const file of packet.output) {
    const bytes = regular(join(root, 'dist'), file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) fail('REVIEW_BUILD_CHANGED_DURING_EXPORT');
    const target = join(out, 'site', file.path);
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  }
  const gaps = packet.regionalCoverage.entries.filter(entry => !entry.chineseProductVerified);
  writeFileSync(join(out, '中国具体产品资料待核对.md'), ['# 中国具体产品资料待核对', '',
    `药物 ${packet.regionalCoverage.total} 项；中国具体产品元数据通过 ${packet.regionalCoverage.chineseProductVerified} 项；其余 ${gaps.length} 项列于下表。`, '',
    '元数据完整不等于医学正确或已取得现行批准；没有产品依据不推断国内未上市。逐项核对成分、剂型、规格、持有人、批准标识、修订时间和原文对应结论。', '',
    '| ID | 药物 | 当前内部地区记录 |', '| --- | --- | --- |',
    ...gaps.map(entry => `| ${entry.id} | ${entry.name} | ${entry.status} |`), ''].join('\n'), 'utf8');
  writeFileSync(join(out, 'README.md'), ['# 当前版本内容审读包', '',
    `内容版本：${packet.snapshotVersion}`, `内容摘要：${packet.snapshotDigest}`, `实际构建输出摘要：${packet.outputDigest}`, '',
    '此包只供本地团队审读，不是发布批准。site 中包含本次实际构建的页面、JS、材料、Prompt、全局/模块指南与 Skill；不包含原书、全文转换稿或取材数据库。', '',
    'review-packet.json 为登记底稿：每个词条分别绑定正文和 Prompt 的文件摘要；资源及指南另列。所有负责人和决定均为空，不继承旧版模板的批准。', '',
    '医学审读由适当专业能力者逐项核对中国适用性、重要风险与结论；公众表达审读核对清楚、尊重和不诱导自我诊断/选药；权利审读核对实际来源、用途与再发布依据。', '',
    '每个真实决定应另记录审读者身份及职责依据、决定、适用范围、上述精确摘要、证据、时间和有效期；有条件或不适用须写明理由。程序不代签。', '',
    '原有来源位置可在本机数据生产仓的 src/content 对应 profile 及获准取材工具中核对；不要把原书、患者资料、身份凭据或密钥附进公开 PR。', '',
    'check:publication 当前仍固定阻断。审读完成后还须另经工程审核实现认证审批绑定；填写本包、修改 JSON 或设置环境变量均不能放行。', '',
    'review-packet.json 及其 SHA-256 在全部文件复制完成后最后写入。输出目录已存在时拒绝覆盖；内容改变后另生成新目录。', ''].join('\n'), 'utf8');
  const bytes = text(packet);
  writeFileSync(join(out, 'review-packet.json'), bytes, 'utf8');
  writeFileSync(join(out, 'review-packet.sha256'), sha(bytes) + '\n', 'utf8');
  return { outputDigest: packet.outputDigest, files: packet.output.length, entries: packet.entries.length,
    guides: packet.guides.length, chineseProductVerified: packet.regionalCoverage.chineseProductVerified,
    chineseProductGaps: gaps.length, status: packet.status };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--output') fail('USAGE: node scripts/local-content/export-publication-review.mjs --output <new-directory-outside-git>');
    checkLegacy(ROOT);
    const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
    if (git('status', '--porcelain')) fail('REVIEW_CLEAN_COMMITTED_SOURCE_REQUIRED');
    if (process.versions.node.split('.')[0] !== '22') fail('REVIEW_NODE22_REQUIRED');
    // Rebuild from this clean source so an old dist cannot claim a new commit.
    // This is a restricted review build, not build:release or publication.
    execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'],
      { cwd: ROOT, stdio: 'inherit' });
    if (git('status', '--porcelain')) fail('REVIEW_BUILD_CHANGED_TRACKED_SOURCE');
    const sourceIdentity = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
      originDev: git('rev-parse', 'origin/dev'), productionApproval: 'not_asserted' };
    console.log(JSON.stringify(writePublicationReview(ROOT, process.argv[3], sourceIdentity)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
