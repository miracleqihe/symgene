import { DATA_COLLECTIONS, SEED_VERSION } from './constants.js';
import {
  createDeletedIds,
  createEnvelope,
  validateEnvelope
} from './migrations.js';
import { KnowledgeStorageError } from './storage.js';

function buildEnvelope(envelope, data, deletedIds, now) {
  const next = createEnvelope(data, {
    seedVersion: envelope.seedVersion || SEED_VERSION,
    savedAt: now.toISOString(),
    deletedIds
  });
  const errors = validateEnvelope(next);
  if (errors.length) {
    throw new KnowledgeStorageError('validation-failed', '修改后的本地数据未通过完整性校验。');
  }
  return next;
}

function ensureType(type) {
  if (!DATA_COLLECTIONS.includes(type)) {
    throw new KnowledgeStorageError('collection-invalid', '本地数据类型无效。');
  }
}

export function upsertEntry(envelope, type, item, {
  now = new Date()
} = {}) {
  ensureType(type);
  const list = envelope.data[type];
  const exists = list.some((entry) => entry.id === item.id);
  const data = {
    ...envelope.data,
    [type]: exists
      ? list.map((entry) => entry.id === item.id ? item : entry)
      : [item, ...list]
  };
  const deletedIds = createDeletedIds(envelope.deletedIds);
  deletedIds[type] = deletedIds[type].filter((id) => id !== item.id);
  return buildEnvelope(envelope, data, deletedIds, now);
}

export function deleteEntry(envelope, type, id, seedData, {
  now = new Date()
} = {}) {
  ensureType(type);
  const data = Object.fromEntries(DATA_COLLECTIONS.map((collection) => [
    collection,
    envelope.data[collection].map((item) => ({ ...item }))
  ]));
  const deletedIds = createDeletedIds(envelope.deletedIds);
  data[type] = data[type].filter((entry) => entry.id !== id);

  const seeded = seedData[type].some((entry) => entry.id === id);
  if (seeded && !deletedIds[type].includes(id)) deletedIds[type].push(id);

  if (type === 'drugs') {
    data.disorders = data.disorders.map((disorder) => ({
      ...disorder,
      relatedDrugIds: Array.isArray(disorder.relatedDrugIds)
        ? disorder.relatedDrugIds.filter((drugId) => drugId !== id)
        : disorder.relatedDrugIds
    }));
  }

  if (type === 'disorders') {
    const relatedCaseIds = data.cases
      .filter((item) => item.disorderId === id)
      .map((item) => item.id);
    data.cases = data.cases.filter((item) => item.disorderId !== id);
    relatedCaseIds.forEach((caseId) => {
      if (seedData.cases.some((item) => item.id === caseId)
        && !deletedIds.cases.includes(caseId)) {
        deletedIds.cases.push(caseId);
      }
    });
  }

  return buildEnvelope(envelope, data, deletedIds, now);
}
