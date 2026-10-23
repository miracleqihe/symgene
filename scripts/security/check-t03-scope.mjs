import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { scanText } from '../../vendor/t02/src/scanner.mjs';
import { verifyDependencyLock } from '../t02/check-repository.mjs';
import { verifyVendorProvenance } from '../t02/check-content-pack.mjs';
import { fail } from './policy.mjs';

// An explicit T03 delivery audit, not a permanent ban on future medical PRs.
export const T03_BASE = '6a3eea2f679fa8979c66edcba2724675ee74aa93';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const paths = value => value.split('\0').filter(Boolean);
// Exact integration surface authorized for the concurrent PR #38 remediation.
const RELIABILITY_PATHS = new Set([
  ...['consumer-concurrency', 'consumer-vite-server', 'dev-consumer', 'dev-consumer-browser',
    'signed-consumer', 'signed-consumer-browser'].map(name => `scripts/t02/${name}.mjs`),
  'scripts/local-content/check-split.mjs', 'tests/content-concurrency.test.mjs',
  'tests/browser/content-concurrency.test.mjs', 'tests/helpers/concurrency-gateway.mjs',
  'docs/t02/local-consumer-concurrency.md',
]);
export const allowedT03Path = path => RELIABILITY_PATHS.has(path) || /^\.github\/workflows\/[a-z0-9-]+\.yml$/.test(path)
  || /^scripts\/security\/[a-z0-9-]+\.mjs$/.test(path)
  || /^tests\/security-[a-z0-9-]+\.test\.mjs$/.test(path)
  || ['package.json', 'package-lock.json', 'CONTRIBUTING.md', '.github/CODEOWNERS',
    'docs/security-release-gates.md'].includes(path);

export function checkT03Scope(root = ROOT) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  git('merge-base', '--is-ancestor', T03_BASE, 'HEAD');
  const changed = [...new Set([...paths(git('diff', '--name-only', '--no-renames', '-z', T03_BASE)),
    ...paths(git('ls-files', '--others', '--exclude-standard', '-z'))])].sort();
  for (const path of changed) {
    if (!allowedT03Path(path)) fail('T03_PATH_OUTSIDE_ENGINEERING_SCOPE');
    let stat; try { stat = lstatSync(resolve(root, path)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) fail('T03_FILE_REJECTED');
    const bytes = readFileSync(resolve(root, path));
    if (bytes.includes(0)) fail('T03_BINARY_REJECTED');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (scanText(text, path).length) fail('T03_SENSITIVE_CONTENT');
  }
  const protectedPaths = paths(git('ls-tree', '-r', '--name-only', '-z', T03_BASE, '--',
    'src/content', 'src/storage', 'src/search.js', 'src/validation', 'vendor',
    'content-packs', 'content-pack.lock', 'legacy-content.lock', 'scripts/build-teaching-materials.mjs'));
  const hashes = createHash('sha256');
  for (const path of protectedPaths) {
    const actual = readFileSync(resolve(root, path));
    const original = execFileSync('git', ['-C', root, 'show', `${T03_BASE}:${path}`], { maxBuffer: 32 * 1024 * 1024 });
    if (!actual.equals(original)) fail('T03_PROTECTED_BYTES_CHANGED');
    hashes.update(path + '\0'); hashes.update(actual);
  }
  const dependencyLock = verifyDependencyLock(JSON.parse(readFileSync(resolve(root, 'package.json'))),
    JSON.parse(readFileSync(resolve(root, 'package-lock.json'))));
  return { status: 'PASS', scope: 'T03-delivery-only', base: T03_BASE, changedPaths: changed,
    protectedFilesUnchanged: protectedPaths.length, protectedBytesDigest: hashes.digest('hex'),
    dependencyLock, vendor: verifyVendorProvenance(root), publication: 'BLOCKED' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(checkT03Scope(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAIL', code: error.code || 'T03_SCOPE_CHECK_FAILED' })); process.exitCode = 1; }
}
