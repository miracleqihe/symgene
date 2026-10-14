// Browser-safe projection of a fully verified content pack. Package verification
// belongs to the build gate; this module never reads files or browser storage.
const COLLECTIONS = ['drugs', 'disorders', 'cases', 'resources'];
const MAPPED_COLLECTIONS = [...COLLECTIONS, 'institutions'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (collection, id) => `${collection}:${id}`;

export class ContentAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContentAdapterError';
    this.code = code;
  }
}

function requireValue(condition, code, message) {
  if (!condition) throw new ContentAdapterError(code, message);
}

export function adaptVerifiedBundle(bundle, { allowSimulation = false } = {}) {
  requireValue(bundle.mode === 'public' || (bundle.mode === 'simulation' && allowSimulation),
    'ADAPTER_MODE_REJECTED', 'Simulation content requires explicit local opt-in.');
  const seedData = Object.fromEntries(COLLECTIONS.map((type) => [type, []]));
  const rows = Object.fromEntries(MAPPED_COLLECTIONS.map((type) => [type, []]));
  const canonicalIds = new Set();
  const legacyIds = new Set();
  const orders = new Set();
  const identities = [];
  for (const entity of bundle.entities) {
    requireValue(!canonicalIds.has(entity.id), 'ADAPTER_CANONICAL_COLLISION', 'Canonical identity is ambiguous.');
    canonicalIds.add(entity.id);
    if (!entity.legacy) continue;
    const { collection, id, order } = entity.legacy;
    requireValue(MAPPED_COLLECTIONS.includes(collection), 'ADAPTER_COLLECTION_INVALID', 'Unsupported legacy collection.');
    requireValue((typeof id === 'string' && id === id.trim() && id.length > 0)
      || (collection === 'institutions' && Number.isInteger(id) && id >= 0),
      'ADAPTER_LEGACY_ID_INVALID', 'Legacy identity must be explicit and exact.');
    requireValue(entity.payload?.id === id, 'ADAPTER_LEGACY_ID_MISMATCH', 'Payload identity differs from its legacy mapping.');
    requireValue(Number.isInteger(order) && order >= 0, 'ADAPTER_ORDER_INVALID', 'Legacy order must be explicit.');
    const legacyKey = key(collection, id);
    const orderKey = key(collection, order);
    requireValue(!legacyIds.has(legacyKey), 'ADAPTER_LEGACY_COLLISION', 'Two entities map to one legacy identity.');
    requireValue(!orders.has(orderKey), 'ADAPTER_ORDER_COLLISION', 'Legacy order is ambiguous.');
    legacyIds.add(legacyKey);
    orders.add(orderKey);
    rows[collection].push({ order, value: clone(entity.payload) });
    identities.push({ canonicalId: entity.id, collection, legacyId: id });
  }
  for (const collection of COLLECTIONS) {
    seedData[collection] = rows[collection].sort((a, b) => a.order - b.order).map((row) => row.value);
  }
  const canonicalByLegacy = new Map(identities.map((identity) => [key(identity.collection, identity.legacyId), identity.canonicalId]));
  return {
    seedData,
    institutions: rows.institutions.sort((a, b) => a.order - b.order).map((row) => row.value),
    identities,
    // Include unmapped sources/claims so a source retraction propagates too.
    dependencies: bundle.entities.map((entity) => ({
      id: entity.id,
      refs: [
        ...(entity.sourceIds ?? []), ...(entity.claimIds ?? []), ...(entity.parentId ? [entity.parentId] : []),
        ...(entity.rightsId ? [entity.rightsId] : []), ...(bundle.reviewSetId ? [bundle.reviewSetId] : []),
        ...(bundle.reviews ?? []).filter((review) => review.subjectId === entity.id).map((review) => review.id),
        ...(entity.legacy?.collection === 'cases'
          ? [canonicalByLegacy.get(key('disorders', entity.payload.disorderId))].filter(Boolean) : []),
        ...(entity.legacy?.collection === 'disorders'
          ? (entity.payload.relatedDrugIds ?? []).map((id) => canonicalByLegacy.get(key('drugs', id))).filter(Boolean) : [])
      ]
    })),
    redirects: clone(bundle.redirects),
    retractions: clone(bundle.retractions),
    contentVersion: bundle.contentVersion,
    mode: bundle.mode
  };
}

export function createRetractionLedger() {
  return { sequence: 0, targetIds: [], eventTargetIds: [], issuedAt: null, expiresAt: null, trusted: false };
}

// `trusted` must come from the caller's independently authenticated channel.
// Local tests may inject it; neither a package hash nor this flag authenticates
// a real publisher. There is deliberately no network or production integration.
export function acceptEmergencyRetractions(previous, event, {
  trusted = false,
  now = Date.now(),
  maxAgeMs = 60 * 60 * 1000
} = {}) {
  requireValue(trusted, 'RETRACTION_UNTRUSTED', 'Emergency retraction provenance is not trusted.');
  requireValue(Number.isSafeInteger(event?.sequence) && event.sequence > 0,
    'RETRACTION_SEQUENCE_INVALID', 'Emergency retraction sequence must be positive.');
  requireValue(event.sequence >= previous.sequence, 'RETRACTION_DOWNGRADE', 'Emergency retraction state cannot move backwards.');
  requireValue(Array.isArray(event.targetIds) && event.targetIds.every((id) => typeof id === 'string' && id.trim() === id && id),
    'RETRACTION_IDS_INVALID', 'Retraction targets must be exact identities.');
  const issuedAt = Date.parse(event.issuedAt);
  const expiresAt = Date.parse(event.expiresAt);
  requireValue(Number.isFinite(issuedAt) && Number.isFinite(expiresAt)
    && issuedAt <= now && expiresAt > now && expiresAt > issuedAt && now - issuedAt <= maxAgeMs,
  'RETRACTION_STALE', 'Emergency retraction state is missing, expired, or too old.');
  // Same-sequence equivocation must not silently replace prior targets or times.
  if (event.sequence === previous.sequence) {
    requireValue(JSON.stringify([...new Set(event.targetIds)].sort()) === JSON.stringify([...(previous.eventTargetIds ?? previous.targetIds)].sort())
      && event.issuedAt === previous.issuedAt && event.expiresAt === previous.expiresAt,
    'RETRACTION_EQUIVOCATION', 'One sequence cannot describe two different emergency states.');
    return clone(previous);
  }
  // Retractions are append-only for this v1 consumer. A higher sequence does
  // not remove earlier targets, including when a website lock is rolled back.
  return {
    sequence: event.sequence,
    targetIds: [...new Set([...previous.targetIds, ...event.targetIds])].sort(),
    eventTargetIds: [...new Set(event.targetIds)].sort(),
    issuedAt: event.issuedAt,
    expiresAt: event.expiresAt,
    trusted: true
  };
}

export function effectiveRetractions(adapter, ledger, {
  now = Date.now(),
  maxAgeMs = 60 * 60 * 1000
} = {}) {
  const denied = new Set(ledger.targetIds);
  for (const item of adapter.retractions) {
    if (Date.parse(item.effectiveAt) <= now) denied.add(item.targetId);
  }
  // Treat legacy identities as collection-qualified. Bare provider IDs or
  // display aliases never replace permanent application identities.
  let changed = true;
  while (changed) {
    const before = denied.size;
    for (const identity of adapter.identities) {
      const legacyKey = key(identity.collection, identity.legacyId);
      if (denied.has(identity.canonicalId) || denied.has(legacyKey)) {
        denied.add(identity.canonicalId);
        denied.add(legacyKey);
      }
    }
    for (const redirect of adapter.redirects) {
      if (denied.has(redirect.from) || denied.has(redirect.to)) {
        denied.add(redirect.from);
        denied.add(redirect.to);
      }
    }
    for (const dependency of adapter.dependencies) {
      if (dependency.refs.some((ref) => denied.has(ref))) denied.add(dependency.id);
    }
    changed = denied.size !== before;
  }
  const issuedAt = Date.parse(ledger.issuedAt);
  const expiresAt = Date.parse(ledger.expiresAt);
  const fresh = ledger.trusted === true && ledger.sequence > 0
    && issuedAt <= now && expiresAt > now && now - issuedAt <= maxAgeMs;
  return { denied: [...denied].sort(), fresh, sequence: ledger.sequence };
}

// Call AFTER storage v4 has replayed local overrides and dependency retention,
// BEFORE handing data to matchKnowledge() or rendering any details. This is a
// projection: it never deletes user edits, tombstones, or historical backups.
export function projectVisibleKnowledge(data, adapter, ledger, options = {}) {
  const status = effectiveRetractions(adapter, ledger, options);
  const denied = new Set(status.denied);
  const byLegacy = new Map(adapter.identities.map((identity) => [key(identity.collection, identity.legacyId), identity]));
  const hidden = Object.fromEntries(COLLECTIONS.map((type) => [type, []]));
  const visible = Object.fromEntries(COLLECTIONS.map((collection) => [collection, data[collection].filter((item) => {
    const identity = byLegacy.get(key(collection, item.id));
    // All knowledge is conservatively high-risk until a reviewed risk policy
    // exists. Without fresh trusted state, hide even unmapped local additions.
    const hide = !status.fresh || denied.has(key(collection, item.id))
      || (identity && denied.has(identity.canonicalId));
    if (hide) hidden[collection].push(item.id);
    return !hide;
  }).map(clone)]));
  // Evaluate the actual post-merge references too: local overrides/custom
  // entries can differ from the package dependency index. Hide a dependent
  // entity intact rather than silently editing its medical relationships.
  let changed = true;
  while (changed) {
    const before = visible.disorders.length + visible.cases.length;
    const visibleDrugs = new Set(visible.drugs.map((item) => item.id));
    visible.disorders = visible.disorders.filter((item) => {
      if (!Array.isArray(item.relatedDrugIds) || item.relatedDrugIds.every((id) => visibleDrugs.has(id))) return true;
      hidden.disorders.push(item.id);
      return false;
    });
    const visibleDisorders = new Set(visible.disorders.map((item) => item.id));
    visible.cases = visible.cases.filter((item) => {
      if (visibleDisorders.has(item.disorderId)) return true;
      hidden.cases.push(item.id);
      return false;
    });
    changed = before !== visible.disorders.length + visible.cases.length;
  }
  return { data: visible, hidden, ...status };
}

export function projectVisibleInstitutions(institutions, adapter, ledger, options = {}) {
  const status = effectiveRetractions(adapter, ledger, options);
  const denied = new Set(status.denied);
  const byLegacy = new Map(adapter.identities.filter((item) => item.collection === 'institutions')
    .map((item) => [item.legacyId, item.canonicalId]));
  return {
    institutions: institutions.filter((item) => status.fresh
      && !denied.has(key('institutions', item.id)) && !denied.has(byLegacy.get(item.id))).map(clone),
    ...status
  };
}
