import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha256, validateBundle, validateManifest, schema } from './contract.mjs';
import { scanDirectory, safeRelativePath } from './scanner.mjs';

const PAYLOADS = ['bundle.json', 'content-v1.schema.json', 'redirects.json', 'retractions.json', 'reviews.json', 'rights.json', 'sources.json'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function bytes(value) { return Buffer.from(`${canonical(value)}\n`, 'utf8'); }
function parseJSON(data, code) { try { return JSON.parse(data); } catch { fail(code); } }
function digest(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function same(a, b) { return canonical(a) === canonical(b); }
function regularFile(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PACK_UNSAFE_FILE');
  if (stat.size > MAX_FILE_BYTES) fail('PACK_FILE_TOO_LARGE');
  return stat;
}

export function codeFingerprint() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [];
  function collect(relative) {
    // Compatibility code and held assets are outside the core producer inputs.
    // Exclude their canonical subtree before any metadata or content access.
    if (relative === 'src/legacy' || relative.startsWith('src/legacy/')) return;
    const target = path.join(root, relative);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) fail('PACK_CODE_SYMLINK');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) collect(`${relative}/${name}`);
    } else if (stat.isFile() && /\.(?:mjs|cjs|js|json)$/.test(relative)) {
      files.push({ path: relative, sha256: sha256(fs.readFileSync(target)) });
    }
  }
  for (const relative of ['src', 'schemas']) collect(relative);
  for (const relative of ['package.json', 'package-lock.json']) if (fs.existsSync(path.join(root, relative))) collect(relative);
  return sha256(canonical(files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)));
}

function inSchemaRange(version, range) {
  const tuple = value => /^\d+\.\d+\.\d+$/.test(value ?? '') ? value.split('.').map(Number) : null;
  const current = tuple(version);
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (!current) return false;
  if (typeof range === 'object' && range) {
    const minimum = tuple(range.min);
    const maximum = tuple(range.maxExclusive);
    return !!minimum && !!maximum && compare(current, minimum) >= 0 && compare(current, maximum) < 0;
  }
  if (typeof range !== 'string') return false;
  if (range.startsWith('^')) {
    const minimum = tuple(range.slice(1));
    return !!minimum && minimum[0] > 0 && current[0] === minimum[0] && compare(current, minimum) >= 0;
  }
  const interval = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range);
  if (interval) return compare(current, tuple(interval[1])) >= 0 && compare(current, tuple(interval[2])) < 0;
  const exact = tuple(range);
  return !!exact && compare(current, exact) === 0;
}

function payloads(bundle) {
  return {
    'bundle.json': bundle,
    'content-v1.schema.json': schema,
    'sources.json': bundle.entities.filter(entity => entity.type === 'source'),
    'rights.json': bundle.rights,
    'reviews.json': bundle.reviews,
    'redirects.json': bundle.redirects,
    'retractions.json': bundle.retractions,
  };
}

function checkedSummary(bundle, options) {
  const summary = validateBundle(bundle, {
    allowSimulation: options.allowSimulation === true,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.verifyReviewAuthority ? { verifyReviewAuthority: options.verifyReviewAuthority } : {}),
    ...(options.effectiveDenylist ? { effectiveDenylist: options.effectiveDenylist } : {}),
  });
  if (options.baselineCounts) {
    for (const [kind, minimum] of Object.entries(options.baselineCounts)) {
      if (!Number.isSafeInteger(minimum) || minimum < 0 || !(kind in summary.counts)) fail('PACK_COUNT_BASELINE_INVALID');
      if (summary.counts[kind] < minimum) fail('PACK_ABNORMAL_COUNT_DROP');
    }
  }
  return summary;
}

/** Immutable local artifact construction. Does not authenticate a publisher. */
export function buildPack(bundle, options = {}) {
  const { outputRoot, pipelineCommit = 'uncommitted', codeDigest = codeFingerprint() } = options;
  if (typeof outputRoot !== 'string' || !outputRoot) fail('PACK_OUTPUT_REQUIRED');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(bundle?.contentVersion ?? '')) fail('PACK_CONTENT_VERSION_INVALID');
  if (typeof pipelineCommit !== 'string' || !/^(?:uncommitted|[0-9a-f]{40}(?:-dirty)?)$/.test(pipelineCommit) || !digest(codeDigest)) fail('PACK_PROVENANCE_INVALID');
  if (pipelineCommit === 'uncommitted' && bundle.mode !== 'simulation') fail('PACK_COMMIT_REQUIRED');
  const summary = checkedSummary(bundle, options);
  const data = payloads(bundle);
  const files = PAYLOADS.map(name => ({ path: name, sha256: sha256(bytes(data[name])), bytes: bytes(data[name]).length }));
  const manifest = {
    documentType: 'release-manifest',
    manifestVersion: 1,
    schemaVersion: bundle.schemaVersion,
    contentVersion: bundle.contentVersion,
    mode: bundle.mode,
    reviewSetId: bundle.reviewSetId,
    pipelineCommit,
    codeDigest,
    files,
    counts: summary.counts,
    licenses: [...new Set(bundle.rights.map(item => item.licenseId))].sort(),
    reviewIds: bundle.reviews.map(item => item.id).sort(),
    retractionIds: bundle.retractions.map(item => item.id).sort(),
    retractionTargets: [...new Set(bundle.retractions.map(item => item.targetId))].sort(),
    retractionSequence: Math.max(0, ...bundle.retractions.map(item => item.sequence)),
    earliestExpiry: summary.earliestExpiry ?? null,
    publisherIdentity: { status: 'not_configured', authenticated: false },
    determinism: { encoding: 'utf-8', newline: 'LF', serialization: 'canonical-json+lf' },
  };
  validateManifest(manifest, { allowSimulation: options.allowSimulation === true, ...(options.now !== undefined ? { now: options.now } : {}) });
  const manifestBytes = bytes(manifest);
  const manifestSha256 = sha256(manifestBytes);
  const packageDigest = sha256(canonical(manifest));
  const version = bundle.contentVersion;
  fs.mkdirSync(outputRoot, { recursive: true });
  if (fs.lstatSync(outputRoot).isSymbolicLink()) fail('PACK_OUTPUT_SYMLINK');
  for (const name of fs.readdirSync(outputRoot)) {
    if (name.toLowerCase() === version.toLowerCase() && name !== version) fail('PACK_VERSION_CASE_COLLISION');
  }
  const lockPath = path.join(outputRoot, `.lock-${version}`);
  let handle;
  try { handle = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('PACK_VERSION_BUSY'); throw error; }
  const packDir = path.resolve(outputRoot, version);
  let temporary;
  try {
    fs.writeFileSync(handle, `${canonical({ pid: process.pid, contentVersion: version, codeDigest })}\n`);
    if (fs.existsSync(packDir)) {
      const existing = verifyPack(packDir, { ...options, manifestSha256, packageDigest, contentVersion: version });
      return { ...existing, replayed: true };
    }
    temporary = fs.mkdtempSync(path.join(outputRoot, `.build-${version}-`));
    for (const name of PAYLOADS) fs.writeFileSync(path.join(temporary, name), bytes(data[name]), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(temporary, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
    verifyPack(temporary, { ...options, manifestSha256, packageDigest, contentVersion: version });
    if (options.injectFailureAt === 'before-rename') fail('PACK_INJECTED_FAILURE');
    // Under the exclusive version lock, this is a single same-filesystem directory rename.
    fs.renameSync(temporary, packDir);
    temporary = undefined;
    const verified = verifyPack(packDir, { ...options, manifestSha256, packageDigest, contentVersion: version });
    return { ...verified, replayed: false };
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    fs.closeSync(handle);
    fs.unlinkSync(lockPath);
  }
}

/** All files are verified before returning any bundle to a consumer. */
export function verifyPack(packDir, options = {}) {
  const rootStat = fs.lstatSync(packDir);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('PACK_UNSAFE_DIRECTORY');
  const names = fs.readdirSync(packDir);
  if (new Set(names.map(name => name.normalize('NFC').toLowerCase())).size !== names.length) fail('PACK_CASE_COLLISION');
  const expectedNames = [...PAYLOADS, 'manifest.json'].sort();
  if (!same(names.sort(), expectedNames)) fail('PACK_FILE_SET_MISMATCH');
  const manifestFile = path.join(packDir, 'manifest.json');
  regularFile(manifestFile);
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifestSha256 = sha256(manifestBytes);
  if (options.manifestSha256 !== undefined && (!digest(options.manifestSha256) || manifestSha256 !== options.manifestSha256)) fail('PACK_MANIFEST_HASH_MISMATCH');
  const manifest = parseJSON(manifestBytes, 'PACK_MANIFEST_INVALID');
  if (!manifest || manifest.manifestVersion !== 1 || !Array.isArray(manifest.files)) fail('PACK_MANIFEST_INVALID');
  if (!manifestBytes.equals(bytes(manifest))) fail('PACK_NONCANONICAL_MANIFEST');
  const packageDigest = sha256(canonical(manifest));
  if (options.packageDigest !== undefined && (!digest(options.packageDigest) || packageDigest !== options.packageDigest)) fail('PACK_DIGEST_MISMATCH');
  if (options.contentVersion !== undefined && manifest.contentVersion !== options.contentVersion) fail('PACK_CONTENT_VERSION_MISMATCH');
  if (!inSchemaRange(manifest.schemaVersion, options.schemaRange ?? '^1.0.0')) fail('PACK_SCHEMA_INCOMPATIBLE');
  if (manifest.mode === 'simulation' && options.allowSimulation !== true) fail('PACK_SIMULATION_DENIED');
  if (!same(manifest.publisherIdentity, { status: 'not_configured', authenticated: false })) fail('PACK_IDENTITY_CLAIM_INVALID');
  if (!digest(manifest.codeDigest) || !/^(?:uncommitted|[0-9a-f]{40}(?:-dirty)?)$/.test(manifest.pipelineCommit ?? '')) fail('PACK_PROVENANCE_INVALID');
  if (manifest.files.length !== PAYLOADS.length) fail('PACK_FILE_SET_MISMATCH');
  const listed = new Set();
  const loaded = {};
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') fail('PACK_MANIFEST_INVALID');
    if (!safeRelativePath(file.path) || !PAYLOADS.includes(file.path)) fail('PACK_UNSAFE_PATH');
    if (listed.has(file.path)) fail('PACK_DUPLICATE_FILE');
    listed.add(file.path);
    if (!digest(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE_BYTES) fail('PACK_MANIFEST_INVALID');
    const target = path.join(packDir, file.path);
    const stat = regularFile(target);
    const contents = fs.readFileSync(target);
    if (stat.size !== file.bytes || sha256(contents) !== file.sha256) fail('PACK_FILE_HASH_MISMATCH');
    loaded[file.path] = parseJSON(contents, 'PACK_PAYLOAD_INVALID');
    if (!contents.equals(bytes(loaded[file.path]))) fail('PACK_NONCANONICAL_PAYLOAD');
  }
  const scan = scanDirectory(packDir, { pack: true });
  if (!scan.ok) { const error = new Error('PACK_LEAK_DETECTED'); error.code = 'PACK_LEAK_DETECTED'; error.findings = scan.findings; throw error; }
  const bundle = loaded['bundle.json'];
  if (!same(loaded['content-v1.schema.json'], schema)) fail('PACK_SCHEMA_SOURCE_MISMATCH');
  const summary = checkedSummary(bundle, options);
  if (bundle.schemaVersion !== manifest.schemaVersion || bundle.contentVersion !== manifest.contentVersion || bundle.mode !== manifest.mode || bundle.reviewSetId !== manifest.reviewSetId) fail('PACK_METADATA_MISMATCH');
  for (const [name, value] of Object.entries(payloads(bundle))) if (!same(value, loaded[name])) fail('PACK_INDEX_MISMATCH');
  if (!same(summary.counts, manifest.counts) || !same(summary.earliestExpiry ?? null, manifest.earliestExpiry)) fail('PACK_COUNTS_OR_EXPIRY_MISMATCH');
  const metadata = {
    licenses: [...new Set(bundle.rights.map(item => item.licenseId))].sort(),
    reviewIds: bundle.reviews.map(item => item.id).sort(),
    retractionIds: bundle.retractions.map(item => item.id).sort(),
    retractionTargets: [...new Set(bundle.retractions.map(item => item.targetId))].sort(),
    retractionSequence: Math.max(0, ...bundle.retractions.map(item => item.sequence)),
  };
  for (const [key, value] of Object.entries(metadata)) if (!same(value, manifest[key])) fail('PACK_METADATA_MISMATCH');
  validateManifest(manifest, { allowSimulation: options.allowSimulation === true, ...(options.now !== undefined ? { now: options.now } : {}) });
  return { packDir: path.resolve(packDir), bundle, manifest, manifestSha256, packageDigest, contentVersion: manifest.contentVersion, identityAuthenticated: false };
}
