import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertT02Path, checkRepository, inspectGitChanges, inspectRepositoryBytes, verifyDependencyLock
} from '../scripts/t02/check-repository.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const manifest = read('package.json');
const lock = read('package-lock.json');
const entryName = 'node_modules/react';
const rejects = (operation, code) => assert.throws(operation, error => error.code === code);
const encodedSyntheticSecret = () => [...['gh', 'p_', 'A'.repeat(34)].join('')]
  .map(character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' }
  }).trim();
}

function commit(root) {
  git(root, ['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.org',
    'commit', '--quiet', '--allow-empty', '-m', 'Fictional engineering fixture']);
}

function withGitFixture(operation) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symgen-t02-gate-test-'));
  try {
    git(root, ['init', '--quiet']);
    commit(root);
    const base = git(root, ['rev-parse', 'HEAD']);
    const write = (relative, value) => {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value);
    };
    return operation({ root, base, write });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('trusted locked dependencies retain explicit custom-license human review', () => {
  const result = verifyDependencyLock(manifest, lock);
  assert.ok(result.packages > 0);
  assert.deepEqual(result.customLicensePackages, ['node_modules/@remotion/player', 'node_modules/remotion']);
  assert.equal(result.licenseDeclarations, 'present-not-eligibility');
  assert.equal(result.customLicenseDecision, 'HUMAN_REVIEW_REQUIRED_NOT_APPROVED');
});

test('registry gate rejects alternate hosts, credentials, explicit default ports and URL suffixes', () => {
  const addresses = [
    'http://registry.npmjs.org/react/-/react.tgz',
    'https://example.org/react/-/react.tgz',
    ['https:', '//', 'fixture-only', '@', 'registry.npmjs.org/react/-/react.tgz'].join(''),
    'https://registry.npmjs.org:443/react/-/react.tgz',
    'https://registry.npmjs.org/react/-/react.tgz?',
    'https://registry.npmjs.org/react/-/react.tgz#',
    'https://registry.npmjs.org/react/-/react.zip'
  ];
  for (const resolved of addresses) {
    const changed = clone(lock);
    changed.packages[entryName].resolved = resolved;
    rejects(() => verifyDependencyLock(manifest, changed), 'DEPENDENCY_REGISTRY_REJECTED');
  }
});

test('integrity and license gates reject missing or noncanonical declarations', () => {
  for (const integrity of [undefined, 'sha1-AAAA', `sha512-${Buffer.alloc(32).toString('base64')}`,
    `sha256-${Buffer.alloc(32).toString('base64').replace(/=+$/, '')}`]) {
    const changed = clone(lock);
    changed.packages[entryName].integrity = integrity;
    rejects(() => verifyDependencyLock(manifest, changed), 'DEPENDENCY_INTEGRITY_INVALID');
  }
  const changed = clone(lock);
  delete changed.packages[entryName].license;
  rejects(() => verifyDependencyLock(manifest, changed), 'DEPENDENCY_LICENSE_DECLARATION_MISSING');
  const validSha256 = clone(lock);
  validSha256.packages[entryName].integrity = `sha256-${Buffer.alloc(32, 1).toString('base64')}`;
  assert.ok(verifyDependencyLock(manifest, validSha256).packages > 0);
});

test('dependency roots and exact direct versions cannot drift independently', () => {
  const changedRoot = clone(lock);
  changedRoot.packages[''].dependencies.react = '0.0.1';
  rejects(() => verifyDependencyLock(manifest, changedRoot), 'DEPENDENCY_ROOT_MISMATCH');
  const changedVersion = clone(lock);
  changedVersion.packages[entryName].version = '0.0.1';
  rejects(() => verifyDependencyLock(manifest, changedVersion), 'DEPENDENCY_DIRECT_LOCK_MISMATCH');
  const missingPackage = clone(lock);
  delete missingPackage.packages[entryName];
  rejects(() => verifyDependencyLock(manifest, missingPackage), 'DEPENDENCY_DIRECT_LOCK_MISMATCH');
});

test('only scoped T02 paths are eligible, including when old simulations become tracked', () => {
  assert.equal(assertT02Path('scripts/t02/check-repository.mjs'), true);
  assert.equal(assertT02Path('content-packs/sim-4/manifest.json'), true);
  for (const relative of ['src/dev/t02-consumer.jsx', 'src/dev/t02-consumer.css',
    'src/dev/t02-session.js', 'src/dev/t02-storage.js', 'tests/ui/t02-consumer.test.jsx',
    'src/dev/t02-signed-consumer.jsx', 'src/dev/t02-signed-session.js',
    'scripts/t02/signed-consumer.mjs', 'scripts/t02/signed-consumer-browser.mjs',
    'tests/content-signed-consumer.test.mjs'])
    assert.equal(assertT02Path(relative), true);
  for (const relative of ['src/dev/unrelated.jsx', 'src/storage/storage.js', 'src/search.js'])
    rejects(() => assertT02Path(relative), 'REPOSITORY_PATH_OUTSIDE_T02');
  for (const relative of ['src/main.jsx', '.github/workflows/deploy-pages.yml', 'raw/input.json',
    'work/input.json', '.env', '../outside.json', 'content-packs/sim-1/manifest.json',
    'content-packs/sim-2/manifest.json']) rejects(() => assertT02Path(relative), 'REPOSITORY_PATH_OUTSIDE_T02');
});

test('repository byte checks reject encoded secrets, invalid UTF8, NUL and oversized blobs', () => {
  rejects(() => inspectRepositoryBytes(Buffer.from(encodedSyntheticSecret())), 'REPOSITORY_SENSITIVE_CONTENT');
  const fictionalPath = '/' + ['Users', 'fictional-fixture', 'input'].join('/');
  rejects(() => inspectRepositoryBytes(Buffer.from(encodeURIComponent(encodeURIComponent(fictionalPath)))), 'REPOSITORY_SENSITIVE_CONTENT');
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.from([65, 0, 66])]) {
    rejects(() => inspectRepositoryBytes(bytes), 'REPOSITORY_BLOB_ENCODING_INVALID');
  }
  rejects(() => inspectRepositoryBytes(Buffer.alloc(20 * 1024 * 1024 + 1, 65)), 'REPOSITORY_BLOB_TOO_LARGE');
});

test('staged sensitive bytes cannot hide behind a clean current file', () => {
  withGitFixture(({ root, base, write }) => {
    const relative = 'docs/t02/fictional-fixture.md';
    write(relative, encodedSyntheticSecret());
    git(root, ['add', '--', relative]);
    write(relative, 'Entirely fictional engineering content.\n');
    rejects(() => inspectGitChanges(root, { base }), 'REPOSITORY_SENSITIVE_CONTENT');
  });
});

test('deleting a sensitive tip file preserves its rejected T02 ancestor blob', () => {
  withGitFixture(({ root, base, write }) => {
    const relative = 'docs/t02/fictional-fixture.md';
    write(relative, encodedSyntheticSecret());
    git(root, ['add', '--', relative]);
    commit(root);
    git(root, ['rm', '--quiet', '--', relative]);
    commit(root);
    assert.equal(git(root, ['diff', '--name-only', base, 'HEAD']), '');
    rejects(() => inspectGitChanges(root, { base }), 'REPOSITORY_SENSITIVE_CONTENT');
  });
});

test('untracked user simulations are excluded but staged simulations are rejected', () => {
  withGitFixture(({ root, base, write }) => {
    const relative = 'content-packs/sim-1/bundle.json';
    write(relative, Buffer.from([0xc3, 0x28]));
    assert.equal(inspectGitChanges(root, { base }).excludedUntrackedSimulationFiles, 1);
    git(root, ['add', '--', relative]);
    rejects(() => inspectGitChanges(root, { base }), 'REPOSITORY_PATH_OUTSIDE_T02');
  });
});

test('scope checks retain production changes even if later reverted', () => {
  withGitFixture(({ root, base, write }) => {
    const relative = 'src/main.jsx';
    write(relative, 'Entirely fictional production-path probe.\n');
    git(root, ['add', '--', relative]);
    commit(root);
    git(root, ['rm', '--quiet', '--', relative]);
    commit(root);
    rejects(() => inspectGitChanges(root, { base }), 'REPOSITORY_PATH_OUTSIDE_T02');
  });
});

test('archive checks ignore parent Git and keep push authorization blocked', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'symgen-t02-archive-gate-'));
  const root = path.join(parent, 'archive');
  try {
    git(parent, ['init', '--quiet']);
    fs.mkdirSync(root);
    fs.mkdirSync(path.join(root, 'tests'));
    for (const relative of ['package.json', 'package-lock.json', 'content-pack.lock', 'vendor/t02', 'content-packs/sim-4']) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(ROOT, relative), target, { recursive: true });
    }
    const result = await checkRepository(root);
    assert.equal(result.engineering, 'PASS');
    assert.equal(result.repository.mode, 'archive-without-local-git-marker');
    assert.equal(result.repository.parentGitDiscovery, 'disabled');
    assert.equal(result.pushReady, false);
    await assert.rejects(checkRepository(root, { requirePushReady: true }), error => error.code === 'PUSH_BLOCKED_AUTHORIZATION');
    fs.writeFileSync(path.join(root, '.git'), 'invalid fictional marker\n');
    await assert.rejects(checkRepository(root), error => error.code === 'REPOSITORY_GIT_CHECK_FAILED');
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
