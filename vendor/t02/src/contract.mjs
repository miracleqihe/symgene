import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

export const CONTRACT_VERSION = '1.0.0';
export const schema = JSON.parse(readFileSync(new URL('../schemas/content-v1.schema.json', import.meta.url), 'utf8'));
export const GATES = Object.freeze(['facts', 'medical', 'rights', 'privacy']);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

/** Canonical JSON v1: sorted object keys, original array order, exact strings. */
export function canonical(value) {
  const ancestors = new Set();
  function encode(input) {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) fail('NON_JSON_VALUE');
      return JSON.stringify(input);
    }
    if (!input || typeof input !== 'object') fail('NON_JSON_VALUE');
    if (ancestors.has(input)) fail('NON_JSON_VALUE', 'Cyclic input is not JSON.');
    ancestors.add(input);
    let output;
    if (Array.isArray(input)) {
      if (Object.keys(input).length !== input.length || Reflect.ownKeys(input).length !== input.length + 1
        || Array.from({ length: input.length }, (_, index) => index).some((index) => !Object.hasOwn(input, index))) {
        fail('NON_JSON_VALUE', 'Sparse arrays or array properties are not JSON.');
      }
      output = `[${input.map(encode).join(',')}]`;
    } else {
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) fail('NON_JSON_VALUE');
      if (Reflect.ownKeys(input).some((key) => typeof key !== 'string')) fail('NON_JSON_VALUE');
      const keys = Object.keys(input).sort();
      if (keys.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) fail('UNSAFE_OBJECT_KEY');
      output = `{${keys.map((key) => `${JSON.stringify(key)}:${encode(input[key])}`).join(',')}}`;
    }
    ancestors.delete(input);
    return output;
  }
  return encode(value);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function indexById(values, code = 'DUPLICATE_ID') {
  const map = new Map();
  for (const value of values ?? []) {
    if (map.has(value.id)) fail(code);
    map.set(value.id, value);
  }
  return map;
}

function legacyDependencies(bundle, entity) {
  const lookup = new Map();
  for (const candidate of bundle.entities ?? []) {
    if (candidate.legacy) lookup.set(canonical([candidate.legacy.collection, String(candidate.legacy.id)]), candidate.id);
  }
  const requested = [];
  const payload = entity.payload ?? {};
  for (const field of ['disorderId', 'diseaseId']) {
    if (payload[field] !== undefined) requested.push(['disorders', payload[field]]);
  }
  for (const field of ['relatedDrugIds', 'drugIds']) {
    if (payload[field] !== undefined) {
      if (!Array.isArray(payload[field])) fail('LEGACY_REFERENCE_INVALID');
      for (const id of payload[field]) requested.push(['drugs', id]);
    }
  }
  return requested.map(([collection, id]) => {
    const target = lookup.get(canonical([collection, String(id)]));
    if (!target) fail('LEGACY_ORPHAN_REFERENCE');
    return target;
  });
}

/** Includes the complete root and its transitive source/claim/parent/rights graph. */
export function subjectDigest(bundle, entityId) {
  const entities = indexById(bundle.entities);
  const rights = indexById(bundle.rights);
  const selectedEntities = new Map();
  const selectedRights = new Map();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) fail('DEPENDENCY_CYCLE');
    if (selectedEntities.has(id)) return;
    const entity = entities.get(id);
    if (!entity) fail('ORPHAN_REFERENCE');
    const permission = rights.get(entity.rightsId);
    if (!permission) fail('ORPHAN_RIGHTS');
    visiting.add(id);
    for (const dependency of [...(entity.sourceIds ?? []), ...(entity.claimIds ?? []), ...(entity.parentId ? [entity.parentId] : []), ...legacyDependencies(bundle, entity)]) visit(dependency);
    visiting.delete(id);
    selectedEntities.set(id, entity);
    selectedRights.set(permission.id, permission);
  }
  visit(entityId);
  const byId = (left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return sha256(canonical({
    digestSpecVersion: 'symgene-subject-v1',
    schemaVersion: bundle.schemaVersion,
    subjectId: entityId,
    entities: [...selectedEntities.values()].sort(byId),
    rights: [...selectedRights.values()].sort(byId)
  }));
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const parsed = new Date(time).toISOString();
  return parsed.slice(0, 19) === value.slice(0, 19);
}

const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
ajv.addFormat('date-time', { type: 'string', validate: validTimestamp });
const validateSchema = ajv.compile(schema);
const validateReleaseManifestSchema = ajv.compile({ $ref: `${schema.$id}#/$defs/releaseManifest` });

const PUBLIC_LICENSES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'LicenseRef-Project-Permission']);
const SYNTHETIC_LICENSE = 'LicenseRef-Synthetic-Test-Only';

/** The local review manifest can never substitute for this release document. */
export function validateManifest(manifest, { allowSimulation = false, now = new Date() } = {}) {
  canonical(manifest);
  if (manifest?.documentType !== 'release-manifest') fail('REVIEW_MANIFEST_NOT_RELEASE');
  if (manifest.schemaVersion !== CONTRACT_VERSION) fail('SCHEMA_INCOMPATIBLE');
  if (!validateReleaseManifestSchema(manifest)) fail('RELEASE_MANIFEST_INVALID');
  if (manifest.mode === 'simulation' && !allowSimulation) fail('SIMULATION_NOT_ALLOWED');
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) fail('INVALID_NOW');
  if (manifest.earliestExpiry !== null && Date.parse(manifest.earliestExpiry) <= nowMs) fail('MANIFEST_EXPIRED');
  if (manifest.mode === 'public' && manifest.pipelineCommit === 'uncommitted') fail('MANIFEST_COMMIT_REQUIRED');
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) fail('MANIFEST_DUPLICATE_FILE');
  const expected = ['bundle.json', 'sources.json', 'rights.json', 'reviews.json', 'redirects.json', 'retractions.json', 'content-v1.schema.json'].sort();
  if (canonical([...paths].sort()) !== canonical(expected)) fail('MANIFEST_FILE_SET_MISMATCH');
  const counts = manifest.counts;
  if (counts.sources + counts.claims + counts.contentEntries + counts.scenarios + counts.resources !== counts.entities
    || counts.reviews !== 4 * counts.entities || manifest.reviewIds.length !== counts.reviews
    || manifest.retractionIds.length !== counts.retractions) fail('MANIFEST_COUNT_MISMATCH');
  if ((counts.retractions === 0) !== (manifest.retractionSequence === 0)) fail('MANIFEST_RETRACTION_SEQUENCE_INVALID');
  for (const license of manifest.licenses) {
    if (!PUBLIC_LICENSES.has(license) && !(manifest.mode === 'simulation' && license === SYNTHETIC_LICENSE)) fail('UNKNOWN_LICENSE');
  }
  inspectStrings(manifest);
  return manifest;
}

/** Detection-only forms. Public bytes and their approval digests remain unchanged. */
function decodeInspection(value) {
  try { return decodeURIComponent(value).normalize('NFKC'); }
  catch { return value.replace(/%([0-7][a-f0-9])/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16))).normalize('NFKC'); }
}

export function inspectionVariants(value) {
  const variants = [String(value).normalize('NFKC')];
  for (let layer = 0; layer < 4; layer++) {
    const current = variants.at(-1);
    if (!/%[a-f0-9]{2}/i.test(current)) break;
    // Inspect structural ASCII even when unrelated text has malformed escapes.
    // URL-specific validation below still rejects malformed encoding outright.
    const next = decodeInspection(current);
    if (next === current) break;
    variants.push(next);
  }
  return variants;
}

export function inspectionTruncated(variants) {
  return variants.length === 5 && /%[a-f0-9]{2}/i.test(variants.at(-1)) && decodeInspection(variants.at(-1)) !== variants.at(-1);
}

function unsafeHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::' || host === '::1' || host.startsWith('::ffff:') || /^(?:fc|fd|fe[89ab])/.test(host) && host.includes(':')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  }
  return false;
}

function inspectUrl(value) {
  let current = value.normalize('NFKC');
  for (let layer = 0; layer <= 4; layer++) {
    let url;
    try { url = new URL(current); } catch { fail('DANGEROUS_URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || unsafeHost(url.hostname)) fail('DANGEROUS_URL');
    if (layer === 0 && /%(?![a-f0-9]{2})/i.test(current)) fail('URL_ENCODING_INVALID');
    if (!/%[a-f0-9]{2}/i.test(current)) return;
    if (layer === 4) fail('URL_ENCODING_TOO_DEEP');
    try { current = decodeURIComponent(current).normalize('NFKC'); } catch { fail('URL_ENCODING_INVALID'); }
  }
}

/** Shared with scanning so URI encoding cannot turn a private field into public data. */
export function inspectPublicText(value, { urlField = false, pathField = false } = {}) {
  const variants = inspectionVariants(value);
  for (const checked of variants) {
    if (/(?:\/(?:Users|home|private|tmp|var|Volumes)\/|(?:^|[\s"'(=:?&#])(?:[A-Za-z]:[\\/]|\\\\[A-Za-z0-9._-]+\\))/i.test(checked)) fail('PRIVATE_PATH');
    if (pathField && /^(?:\/|\\|[A-Za-z]:)/.test(checked)) fail('UNSAFE_PATH');
    if (/(?:javascript|vbscript|data|file|blob):/i.test(checked)) fail('DANGEROUS_URL');
    // Lookahead also inspects a URL embedded in another URL's decoded query.
    for (const match of checked.matchAll(/(?=(https?:\/\/[^\s<>"'\])}]+))/gi)) inspectUrl(match[1]);
  }
  if (inspectionTruncated(variants)) fail('ENCODING_TOO_DEEP');
  if (urlField) inspectUrl(String(value));
}

function inspectStrings(input, key = '') {
  if (typeof input === 'string') {
    inspectPublicText(input, { urlField: /url$/i.test(key), pathField: /^(?:path|filePath|directory|outputDir|inputPath)$/i.test(key) });
    return;
  }
  if (Array.isArray(input)) input.forEach((value) => inspectStrings(value, key));
  else if (input && typeof input === 'object') Object.entries(input).forEach(([name, value]) => inspectStrings(value, name));
}

function effectiveTargets(events, now) {
  const denied = new Set();
  for (const event of events) {
    if (typeof event === 'string') { denied.add(event); continue; }
    if (!event || typeof event.targetId !== 'string' || !validTimestamp(event.effectiveAt)
      || !Number.isInteger(event.sequence) || event.sequence < 1) fail('INVALID_DENYLIST');
    if (Date.parse(event.effectiveAt) <= now) denied.add(event.targetId);
  }
  return denied;
}

/** Fail-closed validation. Human identity is verified only by an external callback. */
export function validateBundle(bundle, {
  allowSimulation = false,
  now = new Date(),
  effectiveDenylist = [],
  verifyReviewAuthority
} = {}) {
  canonical(bundle);
  if (bundle?.schemaVersion !== CONTRACT_VERSION) fail('SCHEMA_INCOMPATIBLE');
  if (!validateSchema(bundle)) {
    const paths = [...new Set(validateSchema.errors.map((error) => error.instancePath || '/'))].join(', ');
    fail('SCHEMA_INVALID', `Content contract failed at ${paths}.`);
  }
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) fail('INVALID_NOW');
  if (bundle.mode === 'simulation' && !allowSimulation) fail('SIMULATION_NOT_ALLOWED');
  if (!Array.isArray(effectiveDenylist)) fail('INVALID_DENYLIST');
  inspectStrings(bundle);
  const entities = indexById(bundle.entities);
  const rights = indexById(bundle.rights);
  const reviews = indexById(bundle.reviews);
  const retractions = indexById(bundle.retractions);
  const allIds = new Set();
  for (const record of [...bundle.entities, ...bundle.rights, ...bundle.reviews, ...bundle.retractions]) {
    if (allIds.has(record.id)) fail('DUPLICATE_ID');
    allIds.add(record.id);
  }
  const expiryValues = [];
  function unexpired(value, code) {
    if (value === null) return;
    if (Date.parse(value) <= nowMs) fail(code);
    expiryValues.push(value);
  }
  for (const permission of rights.values()) {
    if (permission.status !== 'approved') fail('RIGHTS_NOT_APPROVED');
    if (!permission.evidenceRef.trim()) fail('RIGHTS_EVIDENCE_MISSING');
    if (!PUBLIC_LICENSES.has(permission.licenseId) && !(bundle.mode === 'simulation' && permission.licenseId === SYNTHETIC_LICENSE)) fail('UNKNOWN_LICENSE');
    unexpired(permission.expiresAt, 'RIGHTS_EXPIRED');
  }
  const providerKeys = new Map();
  const legacyKeys = new Set();
  const legacyOrders = new Set();
  const expectedLegacyTypes = { drugs: 'contentEntry', disorders: 'contentEntry', cases: 'scenario', resources: 'resource', institutions: 'resource' };
  for (const entity of entities.values()) {
    if (!rights.has(entity.rightsId)) fail('ORPHAN_RIGHTS');
    for (const [field, type] of [['sourceIds', 'source'], ['claimIds', 'claim']]) {
      for (const id of entity[field]) {
        if (!entities.has(id)) fail('ORPHAN_REFERENCE');
        if (entities.get(id).type !== type) fail('REFERENCE_TYPE_MISMATCH');
      }
    }
    if (entity.parentId) {
      const parent = entities.get(entity.parentId);
      if (!parent) fail('ORPHAN_PARENT');
      if (entity.type !== 'resource' || parent.type !== 'resource') fail('PARENT_TYPE_MISMATCH');
      const seen = new Set([entity.id]);
      let current = parent;
      while (current) {
        if (seen.has(current.id)) fail('PARENT_CYCLE');
        seen.add(current.id);
        current = current.parentId ? entities.get(current.parentId) : null;
      }
    }
    for (const ref of entity.providerRefs) {
      const key = canonical([ref.provider, ref.namespace, ref.externalId]);
      if (providerKeys.has(key)) fail('PROVIDER_REF_CONFLICT');
      providerKeys.set(key, entity.id);
    }
    if (entity.legacy) {
      if (expectedLegacyTypes[entity.legacy.collection] !== entity.type) fail('LEGACY_TYPE_MISMATCH');
      const key = canonical([entity.legacy.collection, String(entity.legacy.id)]);
      if (legacyKeys.has(key)) fail('LEGACY_MAPPING_CONFLICT');
      legacyKeys.add(key);
      const orderKey = canonical([entity.legacy.collection, entity.legacy.order]);
      if (legacyOrders.has(orderKey)) fail('LEGACY_ORDER_CONFLICT');
      legacyOrders.add(orderKey);
      if ('id' in entity.payload && entity.payload.id !== entity.legacy.id) fail('LEGACY_PAYLOAD_ID_MISMATCH');
    }
    if (entity.payload.reviewStatus === 'legacy_unverified' || entity.payload.publicationStatus === 'legacy_unverified') fail('LEGACY_UNVERIFIED');
  }
  const sequences = new Set();
  for (const event of retractions.values()) {
    if (sequences.has(event.sequence)) fail('RETRACTION_SEQUENCE_CONFLICT');
    sequences.add(event.sequence);
  }
  const denied = effectiveTargets([...bundle.retractions, ...effectiveDenylist], nowMs);
  for (const id of [bundle.reviewSetId, ...entities.keys(), ...rights.keys(), ...reviews.keys()]) if (denied.has(id)) fail('RETRACTION_VIOLATION');
  const redirects = new Map();
  for (const redirect of bundle.redirects) {
    if (redirects.has(redirect.from)) fail('REDIRECT_CONFLICT');
    if (entities.has(redirect.from)) fail('REDIRECT_SOURCE_ACTIVE');
    redirects.set(redirect.from, redirect.to);
  }
  for (const from of redirects.keys()) {
    const seen = new Set();
    let current = from;
    while (redirects.has(current)) {
      if (seen.has(current)) fail('REDIRECT_CYCLE');
      seen.add(current);
      if (denied.has(current)) fail('RETRACTION_VIOLATION');
      current = redirects.get(current);
    }
    if (!entities.has(current)) fail('REDIRECT_DANGLING');
    if (denied.has(current)) fail('RETRACTION_VIOLATION');
  }
  const reviewKeys = new Map();
  for (const review of reviews.values()) {
    if (review.reviewSetId !== bundle.reviewSetId) fail('REVIEW_SET_MISMATCH');
    if (!entities.has(review.subjectId)) fail('ORPHAN_REVIEW');
    const key = canonical([review.subjectId, review.gate]);
    if (reviewKeys.has(key)) fail('REVIEW_GATE_CONFLICT');
    reviewKeys.set(key, review);
    if (!['approved', 'not_applicable'].includes(review.decision)) fail('REVIEW_NOT_APPROVED');
    if (!review.evidenceRef.trim()) fail('REVIEW_EVIDENCE_MISSING');
    if (review.decision === 'not_applicable' && review.gate !== 'medical') fail('REVIEW_GATE_REQUIRED');
    if (Date.parse(review.reviewedAt) > nowMs) fail('REVIEW_FUTURE');
    if (review.expiresAt !== null && Date.parse(review.expiresAt) <= Date.parse(review.reviewedAt)) fail('REVIEW_INVALID_PERIOD');
    unexpired(review.expiresAt, 'REVIEW_EXPIRED');
    if (review.subjectDigest !== subjectDigest(bundle, review.subjectId)) fail('APPROVAL_SUBJECT_MISMATCH');
    if (bundle.mode === 'simulation') {
      if (review.authority !== 'simulation' || !review.reviewerRef.startsWith('simulation-')) fail('SIMULATION_AUTHORITY_MISMATCH');
    } else {
      if (review.authority !== 'human' || typeof verifyReviewAuthority !== 'function') fail('REVIEW_AUTHORITY_UNVERIFIED');
      let verified;
      try { verified = verifyReviewAuthority(Object.freeze({ ...review })); } catch { fail('REVIEW_AUTHORITY_UNVERIFIED'); }
      if (verified !== true) fail('REVIEW_AUTHORITY_UNVERIFIED');
    }
  }
  for (const entity of entities.values()) {
    // Compute even when no reviews exist, so graph cycles never escape validation.
    subjectDigest(bundle, entity.id);
    for (const gate of GATES) if (!reviewKeys.has(canonical([entity.id, gate]))) fail('REVIEW_MISSING');
  }
  const byType = (type) => bundle.entities.filter((entity) => entity.type === type).length;
  return {
    schemaVersion: bundle.schemaVersion,
    contentVersion: bundle.contentVersion,
    mode: bundle.mode,
    reviewSetId: bundle.reviewSetId,
    earliestExpiry: expiryValues.sort()[0] ?? null,
    counts: {
      entities: entities.size,
      sources: byType('source'), claims: byType('claim'), contentEntries: byType('contentEntry'),
      scenarios: byType('scenario'), resources: byType('resource'),
      rights: rights.size, reviews: reviews.size, redirects: redirects.size, retractions: retractions.size
    }
  };
}
