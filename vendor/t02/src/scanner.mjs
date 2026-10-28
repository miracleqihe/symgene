import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPublicText, inspectionTruncated, inspectionVariants } from './contract.mjs';

const PROTECTED = /(^|\/)(?:raw|restricted|intermediate|quarantine|release|\.local-work|node_modules|\.git)(?:\/|$)|(^|\/)work\/intermediate(?:\/|$)|(^|\/)approved\/public(?:\/|$)/i;
const FORBIDDEN_FILE = /(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$|\.(?:epub|pdf|sqlite3?|db|pem|p12|pfx|key|har)$/i;
const GENERATED = /(^|\/)(?:node_modules|\.git|coverage|dist|artifacts)(?:\/|$)/;
const CONTENT_RULES = [
  ['PRIVATE_ABSOLUTE_PATH', /(?:\/(?:Users|home|private|tmp|var|Volumes)\/|[A-Za-z]:\\Users\\)[^\s"'<>]*/g],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['CREDENTIAL_TOKEN', /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,})\b/g],
  ['CREDENTIAL_URL', /https?:\/\/[^\s\/"'<>]+@/gi],
  ['CREDENTIAL_ASSIGNMENT', /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|password)["']?\s*[=:]\s*["'](?!\$\{|<|REPLACE|EXAMPLE|TODO|placeholder)[A-Za-z0-9_./+!=:-]{16,}["']/gi],
  ['RESTRICTED_TEXT_FIELD', /["'](?:rawText|ocrText|patientName|socialSnippet|privateAccount|rawResponse)["']\s*:\s*["'][^"']{2,}/g],
  ['EMBEDDED_ADJUDICATION', /\b(?:const|let|var)\s+(?:RULINGS|ADJUDICATIONS|REVIEW_DECISIONS)\s*=\s*[\[{]/g],
];

export function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 512 &&
    !/[\\\x00-\x1f:]/.test(value) && !path.posix.isAbsolute(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..') &&
    value.normalize('NFC') === value;
}

function displayPath(value) { return String(value).replace(/[\x00-\x1f]/g, '?'); }

function scanBytes(bytes, filePath, options = {}) {
  if (bytes.includes(0)) return [{ path: displayPath(filePath), rule: 'SCAN_UNSUPPORTED_ENCODING', count: 1 }];
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return [{ path: displayPath(filePath), rule: 'SCAN_UNSUPPORTED_ENCODING', count: 1 }]; }
  return scanText(text, filePath, options);
}

export function scanText(text, filePath = '<memory>', { publicPayload = false } = {}) {
  const variants = inspectionVariants(text);
  const findings = CONTENT_RULES.flatMap(([rule, pattern]) => {
    const count = Math.max(...variants.map(value => { pattern.lastIndex = 0; return [...value.matchAll(pattern)].length; }));
    return count ? [{ path: displayPath(filePath), rule, count }] : [];
  });
  if (inspectionTruncated(variants)) findings.push({ path: displayPath(filePath), rule: 'ENCODING_TOO_DEEP', count: 1 });
  if (publicPayload) {
    try { inspectPublicText(String(text)); }
    catch (error) {
      if (!(error.code === 'PRIVATE_PATH' && findings.some(item => item.rule === 'PRIVATE_ABSOLUTE_PATH'))) {
        findings.push({ path: displayPath(filePath), rule: `PUBLIC_TEXT_${error.code ?? 'INVALID'}`, count: 1 });
      }
    }
  }
  return findings;
}

function pathFindings(filePath, { tracked = false, pack = false } = {}) {
  const findings = [];
  if (!safeRelativePath(filePath)) findings.push({ path: displayPath(filePath), rule: 'UNSAFE_PATH', count: 1 });
  if (PROTECTED.test(filePath) && (tracked || pack)) findings.push({ path: displayPath(filePath), rule: 'PROTECTED_PATH', count: 1 });
  if (FORBIDDEN_FILE.test(filePath)) findings.push({ path: displayPath(filePath), rule: 'RESTRICTED_FILE', count: 1 });
  return findings;
}

function result(findings, scannedFiles, extra = {}) {
  return { ok: findings.length === 0, scannedFiles, findingCount: findings.reduce((sum, f) => sum + f.count, 0), findings, ...extra };
}

/** No source values or snippets are returned: paths, rule names and counts only. */
export function scanDirectory(root, { pack = false } = {}) {
  const findings = [];
  let scannedFiles = 0;
  const seen = new Set();
  function visit(relative) {
    const target = path.join(root, relative);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) { findings.push({ path: displayPath(relative), rule: 'SYMLINK', count: 1 }); return; }
    if (relative && !pack && (GENERATED.test(relative) || PROTECTED.test(relative))) return;
    if (relative) findings.push(...pathFindings(relative, { pack }));
    const normalized = relative.normalize('NFC').toLowerCase();
    if (relative && seen.has(normalized)) findings.push({ path: displayPath(relative), rule: 'CASE_COLLISION', count: 1 });
    seen.add(normalized);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) visit(relative ? `${relative}/${name}` : name);
      return;
    }
    if (!stat.isFile()) { findings.push({ path: displayPath(relative), rule: 'SPECIAL_FILE', count: 1 }); return; }
    scannedFiles++;
    if (stat.size > 20 * 1024 * 1024) { findings.push({ path: displayPath(relative), rule: 'SCAN_SIZE_LIMIT', count: 1 }); return; }
    const bytes = fs.readFileSync(target);
    findings.push(...scanBytes(bytes, relative, { publicPayload: pack }));
  }
  visit('');
  return result(findings, scannedFiles);
}

function git(repoRoot, args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function scanWorkspace(repoRoot, { includeHistory = true, packDirs = [] } = {}) {
  const findings = [];
  const tracked = git(repoRoot, ['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
  const files = [...new Set([...tracked, ...git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)])].sort();
  const trackedSet = new Set(tracked);
  let scannedFiles = 0;
  const seen = new Set();
  for (const relative of files) {
    const isTracked = trackedSet.has(relative);
    findings.push(...pathFindings(relative, { tracked: isTracked }));
    const folded = relative.normalize('NFC').toLowerCase();
    if (seen.has(folded)) findings.push({ path: displayPath(relative), rule: 'CASE_COLLISION', count: 1 });
    seen.add(folded);
    if (!safeRelativePath(relative) || (!isTracked && (PROTECTED.test(relative) || GENERATED.test(relative)))) continue;
    const full = path.join(repoRoot, relative);
    if (fs.existsSync(full)) {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) findings.push({ path: displayPath(relative), rule: 'SYMLINK', count: 1 });
      else if (stat.isFile()) {
        scannedFiles++;
        if (stat.size > 20 * 1024 * 1024) findings.push({ path: displayPath(relative), rule: 'SCAN_SIZE_LIMIT', count: 1 });
        else findings.push(...scanBytes(fs.readFileSync(full), relative));
      }
      else findings.push({ path: displayPath(relative), rule: 'NON_REGULAR_TRACKED_ENTRY', count: 1 });
    }
    // Inspect the index even when working-tree bytes have been changed or removed.
    if (isTracked) {
      try {
        const bytes = execFileSync('git', ['-C', repoRoot, 'show', `:${relative}`], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        if (bytes.length > 20 * 1024 * 1024) findings.push({ path: displayPath(relative), rule: 'STAGED_SCAN_SIZE_LIMIT', count: 1 });
        else findings.push(...scanBytes(bytes, relative).map(item => ({ ...item, rule: `STAGED_${item.rule}` })));
      }
      catch { findings.push({ path: displayPath(relative), rule: 'INDEX_UNREADABLE', count: 1 }); }
    }
  }
  let historyFiles = 0;
  if (includeHistory) {
    const history = [...new Set(git(repoRoot, ['log', '--all', '--name-only', '--format=', '-z']).split('\0').map(x => x.replace(/^\n+/, '')).filter(Boolean))];
    historyFiles = history.length;
    for (const relative of history) findings.push(...pathFindings(relative, { tracked: true }).map(item => ({ ...item, rule: `HISTORY_${item.rule}` })));
  }
  for (const packDir of packDirs) {
    const scanned = scanDirectory(packDir, { pack: true });
    findings.push(...scanned.findings.map(item => ({ ...item, path: `pack/${item.path}` })));
    scannedFiles += scanned.scannedFiles;
  }
  return result(findings, scannedFiles, { history: { mode: 'paths-only-no-patches', scannedFiles: historyFiles } });
}
