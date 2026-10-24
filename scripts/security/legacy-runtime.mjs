import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = '.symgene-runtime.json';
const EXECUTION = '.symgene-runtime-browser.json';
const EXPECTED_RUNTIME = { contentMode: 'legacy', legacySeed: 'src/content/knowledge.json',
  signedGateway: null, formalT02Adoption: false, developmentConsumers: 'explicit-opt-in-only' };
const CONFIG = 'src/production-runtime.json';
const REQUIRED_MODULES = ['src/main.jsx', 'src/production-runtime.mjs', CONFIG,
  'src/data.js', 'src/content/knowledge.json', 'src/hooks/useLocalKnowledge.js'];
const BUILD_INPUTS = ['index.html', 'vite.config.js', 'package.json', 'package-lock.json',
  'scripts/security/legacy-runtime.mjs', 'scripts/security/verify-production-runtime.mjs', 'scripts/local-content/check-legacy.mjs',
  'vendor/local-content/legacy-snapshot.mjs', 'scripts/build-teaching-materials.mjs',
  'scripts/t02/dev-consumer.mjs', 'scripts/t02/signed-consumer.mjs', 'legacy-content.lock', 'content-pack.lock',
  'scripts/security/production-closure.json'];
const CLOSURE = 'scripts/security/production-closure.json';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const requireThat = (condition, code) => { if (!condition) fail(code); };
const digest = value => createHash('sha256').update(value).digest('hex');
const posix = value => value.split(sep).join('/');
const ordered = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
function safePath(root, path) {
  requireThat(typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..'), 'RUNTIME_EVIDENCE_PATH_REJECTED');
  const target = resolve(root, path);
  requireThat(target.startsWith(resolve(root) + sep), 'RUNTIME_EVIDENCE_PATH_REJECTED');
  return target;
}
function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    requireThat(!entry.isSymbolicLink(), 'RUNTIME_OUTPUT_SYMLINK_REJECTED');
    return entry.isDirectory() ? files(root, path) : [posix(relative(root, path))];
  }).sort();
}
function hashes(root, paths) { return ordered(Object.fromEntries(paths.map(path => [path, digest(readFileSync(safePath(root, path)))]))); }
function configuration(root) {
  let config;
  try { config = JSON.parse(readFileSync(resolve(root, CONFIG), 'utf8')); }
  catch { fail('PRODUCTION_RUNTIME_CONFIGURATION_INVALID'); }
  requireThat(JSON.stringify(ordered(config)) === JSON.stringify(ordered(EXPECTED_RUNTIME)), 'PRODUCTION_RUNTIME_NOT_LEGACY');
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  requireThat(scripts.length === 1 && /\btype=["']module["']/.test(scripts[0][1])
    && /\bsrc=["']\/src\/main\.jsx["']/.test(scripts[0][1]) && !scripts[0][2].trim(), 'PRODUCTION_ENTRY_REJECTED');
  return config;
}
function forbiddenModule(path) {
  // This is a capability boundary on the *built module graph*, not a text scan
  // of the repository. Local synthetic tests and their fixtures remain valid.
  return ['src/dev/', 'scripts/t02/', 'vendor/t02/', 'content-packs/', 'tests/'].some(prefix => path.startsWith(prefix))
    || path === 'src/content/adapter.js';
}
// Reviewed dependency closure (R3/F4 remediation). The primary production boundary is no
// longer the path-prefix denylist: every first-party module reachable from the entry must
// be exactly enumerated in the reviewed closure file, and every third-party module must
// belong to an explicitly allowed package root. Relocating a forbidden module to a new
// path therefore fails closure equality; keeping it in a forbidden path still fails here.
export function loadClosure(root) {
  let closure;
  try { closure = JSON.parse(readFileSync(resolve(root, CLOSURE), 'utf8')); }
  catch { fail('PRODUCTION_CLOSURE_INVALID'); }
  const shape = closure?.format === 'symgene-production-closure/1'
    && closure.entry === 'src/main.jsx'
    && Array.isArray(closure.firstPartyModules) && closure.firstPartyModules.every(p => typeof p === 'string')
    && Array.isArray(closure.allowedPackages) && closure.allowedPackages.every(p => typeof p === 'string')
    && Array.isArray(closure.virtualModules) && closure.virtualModules.every(p => typeof p === 'string')
    && Array.isArray(closure.forbiddenCapabilityMarkers) && closure.forbiddenCapabilityMarkers.every(p => typeof p === 'string');
  requireThat(shape && new Set(closure.firstPartyModules).size === closure.firstPartyModules.length
    && closure.firstPartyModules.includes('src/main.jsx') && closure.firstPartyModules.includes(CONFIG),
    'PRODUCTION_CLOSURE_INVALID');
  return { ...closure, firstParty: new Set(closure.firstPartyModules),
    packages: new Set(closure.allowedPackages), virtual: new Set(closure.virtualModules),
    fileDigest: digest(readFileSync(resolve(root, CLOSURE))) };
}
function closurePackage(path) {
  const parts = path.split('/');
  if (parts[0] !== 'node_modules' || !parts[1]) return null;
  return parts[1].startsWith('@') ? `${parts[1]}/${parts[2]}` : parts[1];
}
export function validateClosure(graph, closure) {
  const seenFirstParty = [];
  for (const module of graph) {
    const path = module.path;
    if (path.startsWith('virtual:')) {
      requireThat(closure.virtual.has(path), 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE');
      continue;
    }
    requireThat(!path.startsWith('external:'), 'PRODUCTION_EXTERNAL_MODULE_REJECTED');
    const pkg = closurePackage(path);
    if (pkg !== null) {
      requireThat(closure.packages.has(pkg), 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE');
      continue;
    }
    requireThat(closure.firstParty.has(path), 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE');
    seenFirstParty.push(path);
  }
  // Exact set equality both ways: every graph first-party module is listed (loop above)
  // and every listed module still builds (loop below). A listed module that no longer
  // builds, or an unlisted module that now builds, both require a reviewed closure change.
  for (const path of closure.firstPartyModules) {
    requireThat(seenFirstParty.includes(path), 'PRODUCTION_CLOSURE_MEMBER_MISSING');
  }
  return { firstPartyCount: seenFirstParty.length, allowedPackages: closure.allowedPackages.length };
}
// Capability-level isolation: T02 test-session contract constants are high-entropy and have
// no legitimate role in legacy output. Their presence in any emitted chunk means relocated
// T02 capability was bundled even when every path looks legitimate. This complements —
// never replaces — the reviewed closure and the frozen runtime configuration assertion.
export function scanBundleCapability(bundle, closure) {
  const findings = [];
  for (const [file, chunk] of Object.entries(bundle)) {
    if (chunk.type !== 'chunk') continue;
    for (const marker of closure.forbiddenCapabilityMarkers) {
      if (chunk.code.includes(marker)) findings.push({ file, marker });
    }
  }
  requireThat(findings.length === 0, 'PRODUCTION_T02_MARKER_IN_BUNDLE');
  return { checkedMarkers: closure.forbiddenCapabilityMarkers.length, findings };
}
function validateGraph(graph) {
  requireThat(Array.isArray(graph) && graph.length > 0 && new Set(graph.map(row => row.path)).size === graph.length,
    'PRODUCTION_GRAPH_INVALID');
  for (const module of graph) {
    requireThat(typeof module.path === 'string' && !forbiddenModule(module.path), 'PRODUCTION_T02_CAPABILITY_REJECTED');
    requireThat(Array.isArray(module.imports) && module.imports.every(path => typeof path === 'string' && !forbiddenModule(path)),
      'PRODUCTION_T02_CAPABILITY_REJECTED');
    requireThat(!module.external, 'PRODUCTION_EXTERNAL_MODULE_REJECTED');
  }
  const known = new Map(graph.map(row => [row.path, row]));
  for (const path of REQUIRED_MODULES) requireThat(known.has(path), 'PRODUCTION_LEGACY_MODULE_MISSING');
  requireThat(known.get('src/main.jsx').imports.includes('src/production-runtime.mjs')
    && known.get('src/production-runtime.mjs').imports.includes(CONFIG)
    && known.get('src/data.js').imports.includes('src/content/knowledge.json'), 'PRODUCTION_LEGACY_PATH_REJECTED');
}
function disabledConsumers(root) {
  // Exercise the actual launcher exports without allowing a test server or
  // reading content packages. This child receives no CI token or credentials.
  const script = `for (const [path, name, code] of [['scripts/t02/signed-consumer.mjs', 'startSignedConsumer', 'SIGNED_CONSUMER_DISABLED'], ['scripts/t02/dev-consumer.mjs', 'startDevelopmentConsumer', 'DEV_CONSUMER_DISABLED']]) {
    const mod = await import(new URL(path, 'file://' + process.cwd() + '/'));
    for (const enabled of [undefined, false, 1, 'true']) {
      let rejected = false;
      try { const app = await mod[name]({ enabled }); await app?.app?.close(); }
      catch (error) { if (error.code !== code) throw error; rejected = true; }
      if (!rejected) throw new Error('EXPLICIT_OPT_IN_REQUIRED');
    }
  }`;
  try { execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root,
    env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' }, stdio: 'pipe', timeout: 15_000 }); }
  catch { fail('T02_EXPLICIT_OPT_IN_NOT_ENFORCED'); }
}

// Vite records its resolved production module graph and hashes the exact
// deployed files. Check the graph before tree shaking so dead-code imports of
// a test gateway cannot quietly introduce a future adoption switch.
export function legacyRuntimeEvidencePlugin() {
  let root, outDir, graph, writesFiles, closure, capabilityScan;
  return { name: 'symgene-legacy-production-runtime', apply: 'build',
    configResolved(config) {
      root = resolve(config.root); outDir = resolve(root, config.build.outDir); writesFiles = config.build.write !== false;
      requireThat(config.command === 'build' && config.mode === 'production' && config.isProduction === true && !config.build.ssr
        && !config.build.lib, 'PRODUCTION_BUILD_MODE_REJECTED');
      configuration(root);
      closure = loadClosure(root);
    },
    generateBundle(_options, bundle) {
      const normalize = id => {
        if (id.startsWith('\0')) return `virtual:${id.slice(1)}`;
        const path = id.split('?')[0];
        return isAbsolute(path) ? posix(relative(root, path)) : `external:${path}`;
      };
      const candidate = [...this.getModuleIds()].map(id => {
        const info = this.getModuleInfo(id);
        return { path: normalize(id), imports: [...new Set([...info.importedIds, ...info.dynamicallyImportedIds].map(normalize))].sort(), external: info.isExternal };
      }).sort((a, b) => a.path.localeCompare(b.path));
      validateGraph(candidate);
      // Entry-level contract first, then the graph-level closure, so tree-shaking a
      // disabled startup assertion reports the specific missing-assertion failure.
      requireThat(Object.values(bundle).some(chunk => chunk.type === 'chunk'
        && chunk.code.includes('__SYMGENE_PRODUCTION_RUNTIME__')), 'PRODUCTION_STARTUP_ASSERTION_MISSING');
      const closureResult = validateClosure(candidate, closure);
      capabilityScan = { ...scanBundleCapability(bundle, closure), ...closureResult };
      graph = candidate;
    },
    closeBundle() {
      if (!graph || !writesFiles) return;
      const paths = [...new Set([...graph.map(row => row.path).filter(path => !path.startsWith('virtual:') && !path.startsWith('external:')), ...BUILD_INPUTS, ...files(resolve(root, 'src')).map(path => `src/${path}`)])].sort();
      const evidence = { format: 'symgene-legacy-production-runtime/1', mode: 'production', entry: 'src/main.jsx',
        runtime: configuration(root), graph, sources: hashes(root, paths), outputs: hashes(outDir, files(outDir).filter(path => path !== EVIDENCE && path !== EXECUTION)),
        closure: { fileDigest: closure.fileDigest, firstPartyCount: capabilityScan.firstPartyCount,
          allowedPackages: closure.allowedPackages, capabilityScan: { checkedMarkers: capabilityScan.checkedMarkers, findings: capabilityScan.findings } },
        formalT02Adoption: 'T02_FORMAL_ADOPTION_BLOCKED', medicalApproval: 'not_asserted', rightsApproval: 'not_asserted' };
      writeFileSync(resolve(outDir, EVIDENCE), JSON.stringify(evidence));
    },
  };
}

export function checkLegacyRuntime(root = ROOT, { distDir = resolve(root, 'dist') } = {}) {
  const runtime = configuration(root);
  let evidence;
  try { evidence = JSON.parse(readFileSync(resolve(distDir, EVIDENCE), 'utf8')); }
  catch { fail('PRODUCTION_RUNTIME_EVIDENCE_MISSING'); }
  requireThat(evidence.format === 'symgene-legacy-production-runtime/1' && evidence.mode === 'production'
    && evidence.entry === 'src/main.jsx' && JSON.stringify(ordered(evidence.runtime ?? {})) === JSON.stringify(ordered(runtime))
    && evidence.formalT02Adoption === 'T02_FORMAL_ADOPTION_BLOCKED'
    && evidence.medicalApproval === 'not_asserted' && evidence.rightsApproval === 'not_asserted', 'PRODUCTION_RUNTIME_EVIDENCE_REJECTED');
  validateGraph(evidence.graph);
  // R3: the reviewed closure is re-enforced here, independent of the build that produced
  // the evidence: the graph must still satisfy the CURRENT closure file, and the evidence
  // must record the same closure bytes and a clean capability scan as the build.
  const closure = loadClosure(root);
  const closureResult = validateClosure(evidence.graph, closure);
  requireThat(evidence.closure?.fileDigest === closure.fileDigest, 'PRODUCTION_CLOSURE_DRIFT');
  requireThat(evidence.closure?.firstPartyCount === closureResult.firstPartyCount
    && JSON.stringify(ordered(evidence.closure?.allowedPackages ?? [])) === JSON.stringify(ordered(closure.allowedPackages)),
    'PRODUCTION_RUNTIME_EVIDENCE_REJECTED');
  requireThat(evidence.closure?.capabilityScan?.checkedMarkers === closure.forbiddenCapabilityMarkers.length
    && Array.isArray(evidence.closure?.capabilityScan?.findings) && evidence.closure.capabilityScan.findings.length === 0,
    'PRODUCTION_T02_MARKER_IN_BUNDLE');
  // Independently re-scan the emitted bytes: a neutered build plugin cannot suppress this.
  for (const [path, expected] of Object.entries(evidence.outputs)) {
    if (!path.endsWith('.js')) continue;
    const code = readFileSync(safePath(distDir, path)).toString('utf8');
    const found = closure.forbiddenCapabilityMarkers.filter(marker => code.includes(marker));
    requireThat(found.length === 0, 'PRODUCTION_T02_MARKER_IN_BUNDLE');
  }
  requireThat(evidence.sources && BUILD_INPUTS.concat(REQUIRED_MODULES).every(path => Object.hasOwn(evidence.sources, path)), 'PRODUCTION_SOURCE_EVIDENCE_MISSING');
  requireThat(evidence.graph.every(row => row.path.startsWith('virtual:') || Object.hasOwn(evidence.sources, row.path)), 'PRODUCTION_SOURCE_EVIDENCE_MISSING');
  for (const [path, expected] of Object.entries(evidence.sources)) {
    let actual;
    try { actual = digest(readFileSync(safePath(root, path))); } catch (error) { if (error.code === 'RUNTIME_EVIDENCE_PATH_REJECTED') throw error; fail('PRODUCTION_SOURCE_DRIFT'); }
    requireThat(actual === expected, 'PRODUCTION_SOURCE_DRIFT');
  }
  requireThat(evidence.outputs && Object.keys(evidence.outputs).includes('index.html')
    && Object.keys(evidence.outputs).some(path => path.endsWith('.js')), 'PRODUCTION_OUTPUT_EVIDENCE_MISSING');
  const actualFiles = files(distDir).filter(path => path !== EVIDENCE && path !== EXECUTION);
  requireThat(JSON.stringify(actualFiles) === JSON.stringify(Object.keys(evidence.outputs).sort()), 'PRODUCTION_OUTPUT_SET_DRIFT');
  for (const [path, expected] of Object.entries(evidence.outputs)) requireThat(digest(readFileSync(safePath(distDir, path))) === expected, 'PRODUCTION_OUTPUT_DRIFT');
  disabledConsumers(root);
  return { status: 'LEGACY_RUNTIME_BUILD_VERIFIED', mode: 'production', entry: evidence.entry, runtime,
    sourceCount: Object.keys(evidence.sources).length, outputCount: actualFiles.length,
    artifactDigest: digest(JSON.stringify(evidence.outputs)), sourceEvidenceDigest: digest(readFileSync(resolve(distDir, EVIDENCE))), medicalApproval: 'not_asserted', rightsApproval: 'not_asserted' };
}

export function checkLegacyRuntimeExecution(root = ROOT, { distDir = resolve(root, 'dist'), build } = {}) {
  const verified = build ?? checkLegacyRuntime(root, { distDir });
  let receipt;
  try { receipt = JSON.parse(readFileSync(resolve(distDir, EXECUTION), 'utf8')); }
  catch { fail('PRODUCTION_RUNTIME_EXECUTION_MISSING'); }
  const seed = JSON.parse(readFileSync(resolve(root, 'src/content/knowledge.json')));
  const counts = Object.fromEntries(['drugs', 'disorders', 'cases', 'resources'].map(key => [key, seed[key].length]));
  requireThat(receipt.format === 'symgene-legacy-browser-execution/1' && receipt.status === 'LEGACY_RUNTIME_EXECUTED'
    && receipt.artifactDigest === verified.artifactDigest && receipt.sourceEvidenceDigest === verified.sourceEvidenceDigest
    && JSON.stringify(ordered(receipt.runtime ?? {})) === JSON.stringify(ordered(verified.runtime))
    && receipt.medicalApproval === 'not_asserted' && receipt.rightsApproval === 'not_asserted'
    && receipt.productionDeployment === 'not_authorized' && receipt.readOnly === true && receipt.t02Requests === 0
    && receipt.unexpectedRequests === 0 && receipt.runtimeErrors === 0
    && JSON.stringify(ordered(receipt.counts ?? {})) === JSON.stringify(ordered(counts))
    && typeof receipt.browserVersion === 'string' && receipt.browserVersion.length > 0,
    'PRODUCTION_RUNTIME_EXECUTION_REJECTED');
  return receipt;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(checkLegacyRuntime())); }
  catch (error) { console.error(JSON.stringify({ status: 'BLOCKED', code: error.code || 'LEGACY_RUNTIME_FAILED' })); process.exitCode = 1; }
}
