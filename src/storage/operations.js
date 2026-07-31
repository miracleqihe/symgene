import { DATA_COLLECTIONS, SEED_VERSION } from './constants.js';
import {
  createDeletedIds,
  createEnvelope,
  createLocalOverrides,
  validateEnvelope
} from './migrations.js';
import { KnowledgeStorageError } from './storage.js';

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildEnvelope(envelope, data, deletedIds, localOverrides, now) {
  const next = createEnvelope(data, {
    seedVersion: envelope.seedVersion || SEED_VERSION,
    savedAt: now.toISOString(),
    deletedIds,
    localOverrides,
    seedIds: envelope.seedIds
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
  now = new Date(),
  seedData
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
  const localOverrides = createLocalOverrides(envelope.localOverrides);
  const previousItem = list.find((entry) => entry.id === item.id);
  const seedItem = seedData?.[type]?.find((entry) => entry.id === item.id);
  const seeded = Boolean(seedItem) || envelope.seedIds?.[type]?.includes(item.id);
  if (seeded && previousItem) {
    const fields = new Set(localOverrides[type][item.id] || []);
    const changedFields = new Set([
      ...Object.keys(previousItem),
      ...Object.keys(item)
    ]);
    changedFields.delete('id');
    changedFields.forEach((field) => {
      const changed = Object.hasOwn(previousItem, field) !== Object.hasOwn(item, field)
        || !valuesEqual(previousItem[field], item[field]);
      if (!changed) return;
      if (seedItem && Object.hasOwn(seedItem, field)
        && Object.hasOwn(item, field) && valuesEqual(item[field], seedItem[field])) {
        fields.delete(field);
      } else {
        fields.add(field);
      }
    });
    if (fields.size) localOverrides[type][item.id] = [...fields];
    else delete localOverrides[type][item.id];
  } else {
    delete localOverrides[type][item.id];
  }
  return buildEnvelope(envelope, data, deletedIds, localOverrides, now);
}

export function deleteEntry(envelope, type, id, seedData, {
  now = new Date()
} = {}) {
  ensureType(type);
  if (type === 'disorders') {
    const relatedCases = envelope.data.cases.filter((item) => item.disorderId === id);
    if (relatedCases.length) {
      throw new KnowledgeStorageError(
        'dependency-conflict',
        '无法删除仍有关联案例的疾病。',
        undefined,
        {
          type,
          id,
          relatedType: 'cases',
          relatedCount: relatedCases.length,
          relatedIds: relatedCases.map((item) => item.id)
        }
      );
    }
  }

  const data = Object.fromEntries(DATA_COLLECTIONS.map((collection) => [
    collection,
    envelope.data[collection].map((item) => ({ ...item }))
  ]));
  const deletedIds = createDeletedIds(envelope.deletedIds);
  const localOverrides = createLocalOverrides(envelope.localOverrides);
  data[type] = data[type].filter((entry) => entry.id !== id);
  delete localOverrides[type][id];

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

  return buildEnvelope(envelope, data, deletedIds, localOverrides, now);
}
