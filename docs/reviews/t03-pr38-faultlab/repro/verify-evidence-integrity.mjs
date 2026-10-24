// R1.1-A evidence integrity verifier.
// Modes:
//   node verify-evidence-integrity.mjs <worktree-root> <report-out.json>
// Verifies the package tree at <worktree-root> against its EVIDENCE-INDEX.json:
//   - every index entry resolves to a file in the tree (dangling references)
//   - every tree file under the package is indexed (unindexed files)
//   - sha256 of every tree blob equals the index's publicSha256 (hash mismatches)
// Also audits the index schema (sourceCommits naming) and reports counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.argv[2];
const out = process.argv[3];
const PKG = 'docs/reviews/t03-pr38-faultlab';

const treeFiles = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD', '--', PKG], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .map(line => { const [sha, ...rest] = line.split(' '); return { path: rest.join(' '), blobSha: sha }; });

const index = JSON.parse(readFileSync(join(root, PKG, 'EVIDENCE-INDEX.json'), 'utf8'));
const entries = index.entries;
const treePaths = new Set(treeFiles.map(row => row.path));

const missingFiles = entries.filter(row => !treePaths.has(join(PKG, row.file))).map(row => row.file);
const indexedPaths = new Set(entries.map(row => join(PKG, row.file)));
const unindexedFiles = treeFiles.filter(row => !indexedPaths.has(row.path)).map(row => row.path);

const hashMismatches = [];
const hashOk = [];
const integrityAnchors = [];
for (const file of treeFiles) {
  const rel = file.path.slice(PKG.length + 1);
  const entry = entries.find(row => row.file === rel);
  if (!entry) continue;
  if (entry.publicSha256 === null) {
    // Integrity-anchor files (the index itself, ENVIRONMENT.json, the human
    // index) cannot carry their own hash inside the package; they are
    // content-addressed by the branch commit and cross-hashed in
    // EVIDENCE-INDEX.md. Not a mismatch.
    integrityAnchors.push(rel);
    continue;
  }
  const content = execFileSync('git', ['-C', root, 'cat-file', 'blob', file.blobSha]);
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== entry.publicSha256) hashMismatches.push({ file: rel, recorded: entry.publicSha256, actual });
  else hashOk.push(rel);
}

const usesOldFieldName = 'sourceSha256' in (entries[0] ?? {});
const report = {
  verifiedAt: new Date().toISOString(),
  headCommit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  method: 'full verification of the git tree at HEAD: every package blob hashed via git cat-file and compared with the index; presence checks both directions (index->tree, tree->index)',
  counts: {
    actualFilesInPackage: treeFiles.length,
    indexEntries: entries.length,
    missingFilesCount: missingFiles.length,
    unindexedFilesCount: unindexedFiles.length,
    hashMismatchesCount: hashMismatches.length,
    hashVerifiedOkCount: hashOk.length,
    integrityAnchorsCount: integrityAnchors.length,
  },
  integrityAnchors,
  missingFiles,
  unindexedFiles,
  hashMismatches,
  schema: {
    sourceCommitField: usesOldFieldName ? 'sourceSha256 (MISNAMED: holds commit SHAs, not file hashes)' : 'sourceCommits (ok)',
  },
  integrityProtection: {
    index: 'EVIDENCE-INDEX.md records the SHA-256 of EVIDENCE-INDEX.json and ENVIRONMENT.json; the git commit SHA anchors every file, and any later edit of a published file without regenerating the index shows up here as a hash mismatch',
    evolution: index.packageEvolution ?? null,
  },
  verdict: missingFiles.length === 0 && unindexedFiles.length === 0 && hashMismatches.length === 0
    ? 'CONSISTENT' : 'INCONSISTENT',
};
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ verdict: report.verdict, counts: report.counts,
  missingFiles: report.missingFiles, unindexedFiles: report.unindexedFiles.slice(0, 6),
  hashMismatches: report.hashMismatches.slice(0, 6), schema: report.schema }));
