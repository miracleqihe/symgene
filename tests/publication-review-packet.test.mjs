import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectPublicationReview, writePublicationReview } from '../scripts/local-content/export-publication-review.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'symgene-review-packet-'));
  const write = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  const json = (path, value) => write(path, JSON.stringify(value));
  const knowledge = { drugs: [{ id: 'fictional-drug', name: '虚构药物' }], disorders: [], cases: [], resources: [{ id: 'fictional-resource', title: '虚构资源' }] };
  json('src/content/knowledge.json', knowledge);
  for (const type of ['drug', 'disorder', 'case']) json(`src/content/${type}Profiles.json`, {});
  const input = readFileSync(join(root, 'src/content/knowledge.json'));
  json('legacy-content.lock', { version: 'fictional-version', digest: 'fictional-digest', counts: { drugs: 1, disorders: 0, cases: 0, resources: 1 },
    files: [{ path: 'src/content/knowledge.json', bytes: input.length, sha256: sha(input) }] });
  write('public/teaching/drugs/fictional-drug.md', '# 虚构正文\n');
  write('public/teaching/drugs/fictional-drug.prompt.md', '虚构讲解任务\n');
  json('public/teaching/manifest.json', { entries: [{ type: 'drugs', id: 'fictional-drug', material: 'teaching/drugs/fictional-drug.md', prompt: 'teaching/drugs/fictional-drug.prompt.md', sha256: sha('# 虚构正文\n') }] });
  write('public/agent/global.md', '虚构全局规范\n');
  json('public/agent/manifest.json', { guides: [{ id: 'global', title: '虚构指南', path: 'agent/global.md', sha256: sha('虚构全局规范\n') }] });
  write('public/llms.txt', '虚构入口\n'); write('public/skills/mental-health-reading/SKILL.md', '虚构 Skill\n');
  cpSync(join(root, 'public'), join(root, 'dist'), { recursive: true });
  write('dist/index.html', '<html lang="zh-CN">虚构页面</html>'); write('dist/assets/fictional.js', '// fictional bundle\n');
  return { root, write, json, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('review packet binds actual HTML/JS, materials, prompts, resources and guides without approvals', () => {
  const f = fixture();
  try {
    const first = collectPublicationReview(f.root, { commit: 'fictional-commit' });
    assert.equal(first.status, 'PREPARED_NOT_APPROVED');
    assert.deepEqual(first.entries[0].decisions, { medical: null, publicLanguage: null, rights: null });
    assert.notEqual(first.entries[0].material.sha256, first.entries[0].prompt.sha256);
    assert.equal(first.resources.length, 1); assert.equal(first.guides.length, 2);
    assert.equal(first.regionalCoverage.chineseProductVerified, 0);
    f.write('dist/assets/fictional.js', '// fictional changed runtime\n');
    assert.notEqual(collectPublicationReview(f.root).outputDigest, first.outputDigest);
    assert.equal(collectPublicationReview(f.root).snapshotDigest, first.snapshotDigest);
  } finally { f.close(); }
});

test('stale source, changed prompt and wrong material hash cannot produce a review baseline', () => {
  for (const mutation of [
    f => f.write('src/content/knowledge.json', '{}'),
    f => f.write('dist/teaching/drugs/fictional-drug.prompt.md', '被替换的 Prompt'),
    f => { const p = 'public/teaching/manifest.json'; const value = JSON.parse(readFileSync(join(f.root, p))); value.entries[0].sha256 = 'wrong'; f.json(p, value); cpSync(join(f.root, p), join(f.root, 'dist/teaching/manifest.json')); },
  ]) {
    const f = fixture();
    try { mutation(f); assert.throws(() => collectPublicationReview(f.root), /REVIEW_(SOURCE_DRIFT|GENERATED_OUTPUT_DRIFT|MATERIAL_DIGEST_MISMATCH)/); }
    finally { f.close(); }
  }
});

test('missing, duplicate and path-traversing entries and unindexed generated outputs fail closed', () => {
  for (const mutate of [entries => [], entries => [...entries, entries[0]], entries => [{ ...entries[0], prompt: '../outside.md' }]]) {
    const f = fixture();
    try {
      const path = 'public/teaching/manifest.json'; const value = JSON.parse(readFileSync(join(f.root, path)));
      value.entries = mutate(value.entries); f.json(path, value);
      assert.throws(() => collectPublicationReview(f.root), /REVIEW_(ENTRY_COVERAGE_MISMATCH|ENTRY_BINDING_REJECTED)/);
    } finally { f.close(); }
  }
  const f = fixture();
  try { f.write('dist/teaching/drugs/unindexed.md', '虚构旧材料'); assert.throws(() => collectPublicationReview(f.root), /REVIEW_UNINDEXED_GENERATED_FILE/); }
  finally { f.close(); }
});

test('export refuses a repository destination and never overwrites an existing packet', () => {
  const f = fixture(); const parent = mkdtempSync(join(tmpdir(), 'symgene-review-output-')); const out = join(parent, 'packet');
  try {
    assert.throws(() => writePublicationReview(f.root, join(f.root, 'private-review')), /OUTSIDE_REPOSITORY/);
    assert.throws(() => writePublicationReview(f.root, join(f.root, '..private-review')), /OUTSIDE_REPOSITORY/);
    assert.equal(existsSync(join(f.root, 'private-review')), false);
    const result = writePublicationReview(f.root, out, { commit: 'fictional-commit' });
    assert.equal(result.entries, 1);
    const bytes = readFileSync(join(out, 'review-packet.json'));
    assert.equal(readFileSync(join(out, 'review-packet.sha256'), 'utf8').trim(), sha(bytes));
    assert.equal(readFileSync(join(out, 'site/teaching/drugs/fictional-drug.prompt.md'), 'utf8'), '虚构讲解任务\n');
    assert.throws(() => writePublicationReview(f.root, out), /ALREADY_EXISTS/);
    assert.deepEqual(readFileSync(join(out, 'review-packet.json')), bytes);
  } finally { f.close(); rmSync(parent, { recursive: true, force: true }); }
});
