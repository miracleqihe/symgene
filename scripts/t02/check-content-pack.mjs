import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '../../src/validation/dataValidation.js';
import { PROVINCE_GEO } from '../../src/atlas/chinaGeo.js';
import { adaptVerifiedBundle } from '../../src/content/adapter.js';
import { loadLockedCandidate, readContentLock } from './adoption.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REQUIRED_VENDOR_FILES = Object.freeze([
  'src/contract.mjs', 'src/pack.mjs', 'src/scanner.mjs', 'schemas/content-v1.schema.json'
]);

export function verifyVendorProvenance(root = ROOT) {
  const vendor = resolve(root, 'vendor/t02');
  const provenance = JSON.parse(readFileSync(resolve(vendor, 'provenance.json'), 'utf8'));
  if (!Array.isArray(provenance.files) || provenance.files.length !== REQUIRED_VENDOR_FILES.length) {
    throw Object.assign(new Error('Vendor file provenance is missing.'), { code: 'VENDOR_PROVENANCE_INVALID' });
  }
  const seen = new Set();
  for (const entry of provenance.files) {
    if (typeof entry.path !== 'string' || isAbsolute(entry.path)
      || entry.path.includes('\\') || entry.path.split('/').some((part) => !part || part === '.' || part === '..')
      || !REQUIRED_VENDOR_FILES.includes(entry.path)
      || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || seen.has(entry.path)) {
      throw Object.assign(new Error('Unsafe or duplicate vendor provenance path.'), { code: 'VENDOR_PROVENANCE_INVALID' });
    }
    seen.add(entry.path);
    const path = realpathSync(resolve(vendor, entry.path));
    const rel = relative(realpathSync(vendor), path);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
      || sha256(readFileSync(path)) !== entry.sha256) {
      throw Object.assign(new Error('Vendored consumer code differs from its recorded source digest.'), { code: 'VENDOR_HASH_MISMATCH' });
    }
  }
  for (const required of REQUIRED_VENDOR_FILES) {
    if (!seen.has(required)) throw Object.assign(new Error('Required vendor file is not pinned.'), { code: 'VENDOR_PROVENANCE_INCOMPLETE' });
  }
  return { files: seen.size, publisherIdentity: 'not_configured' };
}

// Field/type requirements belong only to the pipeline's normative schema.
// This consumer check resolves names/codes against the actual map dictionary.
export function verifyInstitutionConsumer(institutions) {
  const provinces = new Map(PROVINCE_GEO.map((province) => [province.name, province.adcode]));
  for (const institution of institutions) {
    if (!provinces.has(institution.province)
      || provinces.get(institution.province) !== institution.adcode) {
      throw Object.assign(new Error('Institution province does not resolve in the current map.'), { code: 'ADAPTER_MAP_REFERENCE_INVALID' });
    }
  }
  return { institutions: institutions.length, provinceReferences: 'resolved' };
}

export async function checkContentPack(root = ROOT, { now } = {}) {
  const lock = readContentLock(root);
  const vendor = verifyVendorProvenance(root);
  const { verifyPack } = await import(new URL('../../vendor/t02/src/pack.mjs', import.meta.url));
  const result = await loadLockedCandidate(root, { verifyPack, allowSimulation: true, now });
  const projected = adaptVerifiedBundle(result.candidate.bundle, { allowSimulation: true });
  const errors = validateData(projected.seedData, { requireDrugSideEffects: true });
  if (errors.length) {
    throw Object.assign(new Error('The complete candidate does not satisfy the existing website data validator.'), {
      code: 'ADAPTER_DATA_INVALID', count: errors.length
    });
  }
  const atlas = verifyInstitutionConsumer(projected.institutions);
  return {
    adoption: 'legacy',
    status: 'SIMULATION_VERIFIED',
    contentVersion: result.candidate.bundle.contentVersion,
    packageDigest: result.candidate.packageDigest,
    counts: Object.fromEntries(Object.entries(projected.seedData).map(([type, rows]) => [type, rows.length])),
    institutionCount: projected.institutions.length,
    atlas,
    vendor,
    publisherIdentity: 'not_configured'
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkContentPack();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Do not print payloads, absolute paths, or validator messages containing
    // candidate text. Detailed diagnostics belong to isolated synthetic tests.
    console.error(JSON.stringify({ status: 'REJECTED', code: error.code ?? 'CONTENT_PACK_FAILED', count: error.count ?? null }));
    process.exitCode = 1;
  }
}
