import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSnapshot, sha256 } from '../../vendor/local-content/legacy-snapshot.mjs';
import { importLegacy } from './import-legacy.mjs';
import { checkLegacy } from './check-legacy.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function pack(source, output) {
  const snapshot = createSnapshot(source);
  for (const [path, bytes] of snapshot.files) {
    mkdirSync(join(output, path, '..'), { recursive: true }); writeFileSync(join(output, path), bytes);
  }
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(snapshot.manifest, null, 2) + '\n');
  return snapshot;
}
function consumer(root) {
  mkdirSync(join(root, 'vendor/local-content'), { recursive: true });
  cpSync(join(ROOT, 'vendor/local-content/legacy-snapshot.mjs'), join(root, 'vendor/local-content/legacy-snapshot.mjs'));
  cpSync(join(ROOT, 'content-pack.lock'), join(root, 'content-pack.lock'));
}

export async function runRecoveryDrill() {
  const folder = mkdtempSync(join(tmpdir(), 'symgen-recovery-review-'));
  try {
    const first = join(folder, 'verified-original'), second = join(folder, 'fixture-next'), target = join(folder, 'consumer');
    const original = pack(ROOT, first); pack(ROOT, second); consumer(target);
    const changed = join(second, 'scripts/build-teaching-materials.mjs');
    writeFileSync(changed, readFileSync(changed, 'utf8') + '\n// fictional interrupted-import fixture\n');
    const next = createSnapshot(second); writeFileSync(join(second, 'manifest.json'), JSON.stringify(next.manifest));
    importLegacy(first, target, { expectedDigest: original.manifest.digest });
    const lockBefore = readFileSync(join(target, 'legacy-content.lock'));
    assert.deepEqual(lockBefore, readFileSync(join(ROOT, 'legacy-content.lock')));
    const adoptionBefore = readFileSync(join(target, 'content-pack.lock'));
    const child = fork(fileURLToPath(import.meta.url), ['--interrupted-writer', second, target, next.manifest.digest],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const [code, signal] = await once(child, 'exit');
    assert.ok(code !== 0 || signal === 'SIGKILL');
    assert.equal(JSON.parse(readFileSync(join(target, 'interruption-marker.json'))).completedWrites, 4);
    assert.throws(() => checkLegacy(target), { code: 'LEGACY_VENDOR_DRIFT' });
    assert.throws(() => importLegacy(first, target, { expectedDigest: original.manifest.digest }), { code: 'IMPORT_LOCAL_EDIT' });
    // Preserve the interrupted directory, then reconstruct from the verified
    // snapshot in a new empty consumer. Never use a force-overwrite switch.
    renameSync(target, join(folder, 'quarantined-interrupted-consumer')); consumer(target);
    importLegacy(first, target, { expectedDigest: original.manifest.digest });
    const result = checkLegacy(target);
    for (const [path, bytes] of original.files) assert.deepEqual(readFileSync(join(target, path)), bytes);
    assert.deepEqual(readFileSync(join(target, 'legacy-content.lock')), lockBefore);
    assert.deepEqual(readFileSync(join(target, 'content-pack.lock')), adoptionBefore);
    return { status: 'PASS', environment: 'disposable clone; original worktrees untouched',
      forcedTerminationAfterWrites: 4, termination: signal || `exit-${code}`,
      mixedSnapshotRejected: true, ordinaryImportRefusedMixedEdits: true,
      recovery: 'quarantine interrupted consumer; restore verified snapshot and exact lock into new directory',
      restoredPinnedFiles: original.files.size, digest: result.version,
      versionLockSha256: sha256(lockBefore), formalAdoptionBytesUnchanged: true,
      restoredLockMatchesCurrentWebsite: true,
      scope: 'real killed process, not a power-loss durability or filesystem atomicity guarantee' };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

if (process.argv[2] === '--interrupted-writer') {
  let writes = 0;
  importLegacy(process.argv[3], process.argv[4], { expectedDigest: process.argv[5], write(path, bytes) {
    writeFileSync(path, bytes);
    if (++writes === 4) {
      writeFileSync(join(process.argv[4], 'interruption-marker.json'), JSON.stringify({ completedWrites: writes }));
      process.kill(process.pid, 'SIGKILL');
    }
  } });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runRecoveryDrill(), null, 2));
}
