import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical, CONTRACT_VERSION, schema } from '../../vendor/t02/src/contract.mjs';
import { safeRelativePath, scanText } from '../../vendor/t02/src/scanner.mjs';
import { checkContentPack, verifyVendorProvenance } from './check-content-pack.mjs';
import { readContentLock } from './adoption.mjs';
import { readLocalConfig, requireLocalPath } from './read-local-config.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const T02_BASE = '20ec83d9b0bed138299010da6d2cf9c4418f1cfc';
const LIMIT = 20 * 1024 * 1024;
const PACK_FILES = '(?:bundle|manifest|redirects|retractions|reviews|rights|sources)\\.json|content-v1\\.schema\\.json';
const EXACT_PATHS = new Set([
  '.nvmrc', 'package.json', 'package-lock.json', 'content-pack.lock',
  'scripts/t02-golden.mjs', 'src/content/adapter.js',
  '.github/workflows/t02-verification.yml',
  'vendor/t02/provenance.json', 'vendor/t02/src/contract.mjs',
  'vendor/t02/src/pack.mjs', 'vendor/t02/src/scanner.mjs',
  'vendor/t02/schemas/content-v1.schema.json'
]);
const PACK_PATH = new RegExp(`^content-packs/sim-[34]/(?:${PACK_FILES})$`);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const clone = value => JSON.parse(JSON.stringify(value));

/** Declaration and integrity checks do not establish dependency license eligibility. */
export function verifyDependencyLock(manifest, lock) {
  if (lock?.lockfileVersion !== 3 || !lock.packages || Array.isArray(lock.packages)
    || !Object.hasOwn(lock.packages, '') || lock.name !== manifest.name || lock.version !== manifest.version) fail('DEPENDENCY_LOCK_INVALID');
  const root = lock.packages[''];
  if (root?.name !== manifest.name || root?.version !== manifest.version) fail('DEPENDENCY_ROOT_MISMATCH');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (canonical(manifest[section] ?? {}) !== canonical(root[section] ?? {})) fail('DEPENDENCY_ROOT_MISMATCH');
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)
        || lock.packages[`node_modules/${name}`]?.version !== version) fail('DEPENDENCY_DIRECT_LOCK_MISMATCH');
    }
  }
  let packages = 0;
  const customLicensePackages = [];
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative) continue;
    if (!safeRelativePath(relative) || !relative.startsWith('node_modules/') || !entry || entry.link
      || typeof entry.version !== 'string' || !entry.version) fail('DEPENDENCY_ENTRY_INVALID');
    const resolved = entry.resolved;
    if (typeof resolved !== 'string' || !/^https:\/\/registry\.npmjs\.org\/[^?#\s]+\.tgz$/.test(resolved)
      || /[\\\x00-\x20]/.test(resolved)) fail('DEPENDENCY_REGISTRY_REJECTED');
    let url;
    try { url = new URL(resolved); } catch { fail('DEPENDENCY_REGISTRY_REJECTED'); }
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.port
      || url.search || url.hash || url.href !== resolved) fail('DEPENDENCY_REGISTRY_REJECTED');
    const integrity = /^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(entry.integrity ?? '');
    if (!integrity) fail('DEPENDENCY_INTEGRITY_INVALID');
    const digest = Buffer.from(integrity[2], 'base64');
    if (digest.length !== (integrity[1] === 'sha512' ? 64 : 32)
      || digest.toString('base64') !== integrity[2]) fail('DEPENDENCY_INTEGRITY_INVALID');
    if (typeof entry.license !== 'string' || !entry.license.trim()) fail('DEPENDENCY_LICENSE_DECLARATION_MISSING');
    if (/SEE LICENSE|LicenseRef|UNLICENSED/i.test(entry.license)
      || /(?:^|\/)node_modules\/(?:@remotion\/[^/]+|remotion)$/.test(relative)) customLicensePackages.push(relative);
    packages++;
  }
  if (!packages) fail('DEPENDENCY_LOCK_EMPTY');
  return { packages, integrity: 'registry-https-canonical-sri', licenseDeclarations: 'present-not-eligibility',
    customLicensePackages: customLicensePackages.sort(), customLicenseDecision: 'HUMAN_REVIEW_REQUIRED_NOT_APPROVED' };
}

export function assertT02Path(relative) {
  if (!safeRelativePath(relative) || !(EXACT_PATHS.has(relative)
    || /^scripts\/t02\/[a-z0-9-]+\.mjs$/.test(relative)
    || /^tests\/content-[a-z0-9-]+\.test\.mjs$/.test(relative)
    || /^docs\/t02\/[a-z0-9-]+\.(?:md|json)$/.test(relative)
    || PACK_PATH.test(relative))) fail('REPOSITORY_PATH_OUTSIDE_T02');
  return true;
}

/** Only codes/counts escape; neither offending bytes nor source excerpts do. */
export function inspectRepositoryBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('REPOSITORY_BYTES_REQUIRED');
  if (bytes.length > LIMIT) fail('REPOSITORY_BLOB_TOO_LARGE');
  if (bytes.includes(0)) fail('REPOSITORY_BLOB_ENCODING_INVALID');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('REPOSITORY_BLOB_ENCODING_INVALID'); }
  const findings = scanText(text, '<t02-repository-blob>');
  if (findings.length) fail('REPOSITORY_SENSITIVE_CONTENT');
  return { bytes: bytes.length, findings: 0 };
}

function git(root, args, { bytes = false } = {}) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
  try {
    return execFileSync('git', ['-C', root, ...args], {
      env, encoding: bytes ? undefined : 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch { fail('REPOSITORY_GIT_CHECK_FAILED'); }
}

const nulPaths = value => value.split('\0').filter(Boolean);
const ownUntrackedSimulation = relative => /^content-packs\/sim-[12]\//.test(relative);
function inspectWorktree(root, relative) {
  let file;
  try { file = requireLocalPath(root, relative, 'REPOSITORY_UNSAFE_PATH'); }
  catch (error) {
    if (error.code === 'ENOENT') return false; // A tracked deletion has no worktree bytes.
    throw error;
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) fail('REPOSITORY_ENTRY_MODE_INVALID');
  if (stat.size > LIMIT) fail('REPOSITORY_BLOB_TOO_LARGE');
  inspectRepositoryBytes(fs.readFileSync(file));
  return true;
}

export function inspectGitChanges(root, { base = T02_BASE } = {}) {
  if (fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !== fs.realpathSync(root)) fail('REPOSITORY_GIT_ROOT_MISMATCH');
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') fail('REPOSITORY_HISTORY_INCOMPLETE');
  git(root, ['merge-base', '--is-ancestor', base, 'HEAD']);
  const committed = nulPaths(git(root, ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']));
  const indexChanged = nulPaths(git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD']));
  const worktreeChanged = nulPaths(git(root, ['diff', '--name-only', '--no-renames', '-z']));
  const untracked = nulPaths(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  const excluded = untracked.filter(ownUntrackedSimulation);
  const branchCommits = git(root, ['rev-list', `${base}..HEAD`]).trim().split('\n').filter(Boolean);
  const historyPaths = branchCommits.flatMap(commit => nulPaths(git(root,
    ['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-m', '-z', commit])));
  const changed = [...new Set([...committed, ...indexChanged, ...worktreeChanged, ...historyPaths,
    ...untracked.filter(relative => !ownUntrackedSimulation(relative))])].sort();
  changed.forEach(assertT02Path);

  let headBlobs = 0;
  let indexBlobs = 0;
  let historicalBlobs = 0;
  let workingFiles = 0;
  const inspectObject = oid => inspectRepositoryBytes(git(root, ['cat-file', 'blob', oid], { bytes: true }));
  if (changed.length) {
    for (const entry of nulPaths(git(root, ['ls-tree', '-r', '-z', 'HEAD', '--', ...changed]))) {
      const separator = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, separator).split(' ');
      if (!['100644', '100755'].includes(mode) || type !== 'blob') fail('REPOSITORY_ENTRY_MODE_INVALID');
      assertT02Path(entry.slice(separator + 1));
      inspectObject(oid);
      headBlobs++;
    }
    for (const entry of nulPaths(git(root, ['ls-files', '--stage', '-z', '--', ...changed]))) {
      const separator = entry.indexOf('\t');
      const [mode, oid, stage] = entry.slice(0, separator).split(' ');
      if (!['100644', '100755'].includes(mode) || stage !== '0') fail('REPOSITORY_ENTRY_MODE_INVALID');
      assertT02Path(entry.slice(separator + 1));
      inspectObject(oid);
      indexBlobs++;
    }
  }
  // Include versions deleted or replaced before HEAD, within the T02 range.
  const newObjects = git(root, ['rev-list', '--objects', '--no-object-names', `${base}..HEAD`]).trim().split('\n').filter(Boolean);
  for (const oid of new Set(newObjects)) {
    if (git(root, ['cat-file', '-t', oid]).trim() === 'blob') { inspectObject(oid); historicalBlobs++; }
  }
  for (const relative of changed) if (inspectWorktree(root, relative)) workingFiles++;
  return { mode: 'local-git', baseVerifiedAncestor: true, branchCommits: branchCommits.length,
    changedPaths: changed.length, headBlobs, indexBlobs, historicalBlobs, workingFiles,
    excludedUntrackedSimulationFiles: excluded.length,
    scope: 'T02-base-to-HEAD-paths-and-new-blob-versions-plus-index-and-worktree' };
}

function inspectArchive(root) {
  let files = 0;
  const visit = relative => {
    const file = requireLocalPath(root, relative, 'REPOSITORY_UNSAFE_PATH');
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(`${relative}/${name}`);
    } else { assertT02Path(relative); inspectWorktree(root, relative); files++; }
  };
  for (const relative of [...EXACT_PATHS, 'scripts/t02', 'docs/t02', 'content-packs/sim-3', 'content-packs/sim-4']) {
    try { fs.lstatSync(path.join(root, relative)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    visit(relative);
  }
  for (const name of fs.readdirSync(requireLocalPath(root, 'tests', 'REPOSITORY_UNSAFE_PATH'))) {
    if (/^content-[a-z0-9-]+\.test\.mjs$/.test(name)) visit(`tests/${name}`);
  }
  return { mode: 'archive-without-local-git-marker', scannedFiles: files,
    history: 'UNVERIFIED_NO_LOCAL_GIT', parentGitDiscovery: 'disabled', untrackedSimulations: 'not-read' };
}

export async function checkRepository(root = ROOT, { requirePushReady = false, now } = {}) {
  if (Number(process.versions.node.split('.')[0]) !== 22) fail('NODE_22_REQUIRED');
  const dependencies = verifyDependencyLock(readLocalConfig(root, 'package.json'), readLocalConfig(root, 'package-lock.json'));
  const vendor = verifyVendorProvenance(root);
  const provenance = readLocalConfig(root, 'vendor/t02/provenance.json');
  if (provenance.producer !== 'symgene-data-pipeline' || provenance.schemaVersion !== CONTRACT_VERSION
    || schema.properties.schemaVersion.const !== CONTRACT_VERSION) fail('VENDOR_SCHEMA_VERSION_MISMATCH');
  const lock = readContentLock(root);
  if (lock.publisherIdentity !== 'not_configured') fail('LOCK_PUBLISHER_IDENTITY_UNVERIFIED');
  const candidate = await checkContentPack(root, { now });
  let hasGit = false;
  try { fs.lstatSync(path.join(root, '.git')); hasGit = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const repository = hasGit ? inspectGitChanges(root) : inspectArchive(root);
  const result = { engineering: 'PASS', productionAdoption: 'legacy', candidateStatus: candidate.status,
    candidateContentVersion: candidate.contentVersion, vendor, schemaVersion: CONTRACT_VERSION,
    dependencies, repository, pushReady: false, pushStatus: 'PUSH_BLOCKED_AUTHORIZATION',
    authorization: 'No push, PR, deployment or production adoption is authorized by engineering checks.',
    dependencyRights: 'DECLARATIONS_ONLY_HUMAN_ELIGIBILITY_REVIEW_PENDING' };
  if (requirePushReady) fail('PUSH_BLOCKED_AUTHORIZATION');
  return clone(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--require-push-ready') || args.length > 1) fail('REPOSITORY_ARGUMENT_INVALID');
    console.log(JSON.stringify(await checkRepository(ROOT, { requirePushReady: args.includes('--require-push-ready') }), null, 2));
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'REPOSITORY_GATE_FAILED';
    console.error(JSON.stringify({ engineering: 'REJECTED', code, pushReady: false }));
    process.exitCode = 1;
  }
}
