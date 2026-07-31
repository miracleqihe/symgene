import { validateData } from '../validation/dataValidation.js';
import {
  DATA_COLLECTIONS,
  LEGACY_SEED_VERSION,
  SCHEMA_VERSION,
  SEED_VERSION
} from './constants.js';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createOverridesById(value = {}) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, fields]) => {
    if (typeof id !== 'string' || !id.trim() || !Array.isArray(fields)) return [];
    const normalizedFields = [...new Set(fields
      .filter((field) => typeof field === 'string' && field.trim() && field !== 'id')
      .map((field) => field.trim()))];
    return normalizedFields.length ? [[id.trim(), normalizedFields]] : [];
  }));
}

function createIdList(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim()))];
}

export function createLocalOverrides(value = {}) {
  return Object.fromEntries(DATA_COLLECTIONS.map((type) => [
    type,
    createOverridesById(value?.[type])
  ]));
}

export function createSeedIds(value = {}) {
  return Object.fromEntries(DATA_COLLECTIONS.map((type) => [
    type,
    createIdList(value?.[type])
  ]));
}

function seedIdsFromData(seedData) {
  return createSeedIds(Object.fromEntries(DATA_COLLECTIONS.map((type) => [
    type,
    Array.isArray(seedData?.[type]) ? seedData[type].map((item) => item?.id) : []
  ])));
}

function mergeCollectionWithSeed(
  savedItems,
  seedItems,
  deletedIds,
  localOverrides,
  previousSeedIds
) {
  const seedById = new Map(seedItems.map((item) => [item.id, item]));
  const savedIds = new Set();
  const deleted = new Set(deletedIds);
  const previousSeeded = new Set(previousSeedIds);
  const merged = [];

  savedItems.forEach((savedItem) => {
    const id = savedItem?.id;
    const seedItem = seedById.get(id);
    if (seedItem) {
      savedIds.add(id);
      if (deleted.has(id)) return;
      const nextItem = cloneValue(seedItem);
      (localOverrides[id] || []).forEach((field) => {
        if (!Object.hasOwn(seedItem, field)) return;
        if (Object.hasOwn(savedItem, field)) nextItem[field] = cloneValue(savedItem[field]);
        else delete nextItem[field];
      });
      merged.push(nextItem);
      return;
    }
    if (!previousSeeded.has(id)) merged.push(cloneValue(savedItem));
  });

  seedItems.forEach((seedItem) => {
    if (!savedIds.has(seedItem.id) && !deleted.has(seedItem.id)) {
      merged.push(cloneValue(seedItem));
    }
  });
  return merged;
}

function reconcileReferences(mergedData, savedData, deletedIds, previousSeedIds) {
  const retainedSeedIds = createSeedIds();
  const drugIds = new Set(mergedData.drugs.map((item) => item.id));
  mergedData.disorders = mergedData.disorders.map((item) => ({
    ...item,
    relatedDrugIds: Array.isArray(item.relatedDrugIds)
      ? item.relatedDrugIds.filter((id) => drugIds.has(id))
      : item.relatedDrugIds
  }));

  const disorderIds = new Set(mergedData.disorders.map((item) => item.id));
  const savedDisorders = new Map(savedData.disorders.map((item) => [item.id, item]));
  const previouslySeededDisorders = new Set(previousSeedIds.disorders);
  const deletedDisorders = new Set(deletedIds.disorders);
  mergedData.cases.forEach((item) => {
    const id = item.disorderId;
    if (disorderIds.has(id) || deletedDisorders.has(id)
      || !previouslySeededDisorders.has(id) || !savedDisorders.has(id)) return;
    mergedData.disorders.push(cloneValue(savedDisorders.get(id)));
    disorderIds.add(id);
    retainedSeedIds.disorders.push(id);
  });
  return retainedSeedIds;
}

function pruneLocalOverrides(value, mergedData, seedData) {
  const normalized = createLocalOverrides(value);
  return Object.fromEntries(DATA_COLLECTIONS.map((type) => {
    const mergedById = new Map(mergedData[type].map((item) => [item.id, item]));
    const seedById = new Map(seedData[type].map((item) => [item.id, item]));
    const overrides = Object.fromEntries(Object.entries(normalized[type]).flatMap(([id, fields]) => {
      const mergedItem = mergedById.get(id);
      const seedItem = seedById.get(id);
      if (!mergedItem || !seedItem) return [];
      const activeFields = fields.filter((field) => (
        Object.hasOwn(seedItem, field)
        && (!Object.hasOwn(mergedItem, field) || !valuesEqual(mergedItem[field], seedItem[field]))
      ));
      return activeFields.length ? [[id, activeFields]] : [];
    }));
    return [type, overrides];
  }));
}

export function createDeletedIds(value = {}) {
  return Object.fromEntries(DATA_COLLECTIONS.map((type) => {
    const ids = Array.isArray(value?.[type])
      ? value[type].filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
      : [];
    return [type, [...new Set(ids)]];
  }));
}

export function createEnvelope(data, {
  schemaVersion = SCHEMA_VERSION,
  seedVersion = SEED_VERSION,
  savedAt = new Date().toISOString(),
  deletedIds = createDeletedIds(),
  localOverrides = createLocalOverrides(),
  seedIds = seedIdsFromData(data)
} = {}) {
  return {
    schemaVersion,
    seedVersion,
    savedAt,
    data: cloneValue(data),
    deletedIds: createDeletedIds(deletedIds),
    localOverrides: createLocalOverrides(localOverrides),
    seedIds: createSeedIds(seedIds)
  };
}

function mergeWithSeedDetails(savedData, seedData, deletedIds = createDeletedIds(), {
  localOverrides = createLocalOverrides(),
  seedIds = createSeedIds()
} = {}) {
  const normalizedDeletedIds = createDeletedIds(deletedIds);
  const merged = Object.fromEntries(DATA_COLLECTIONS.map((type) => {
    const seedItems = Array.isArray(seedData?.[type]) ? seedData[type] : [];
    const savedItems = Array.isArray(savedData?.[type]) ? cloneValue(savedData[type]) : [];
    return [type, mergeCollectionWithSeed(
      savedItems,
      seedItems,
      normalizedDeletedIds[type],
      createOverridesById(localOverrides?.[type]),
      createIdList(seedIds?.[type])
    )];
  }));
  const retainedSeedIds = reconcileReferences(
    merged,
    savedData,
    normalizedDeletedIds,
    createSeedIds(seedIds)
  );
  return { data: merged, retainedSeedIds };
}

export function mergeWithSeed(savedData, seedData, deletedIds, options) {
  return mergeWithSeedDetails(savedData, seedData, deletedIds, options).data;
}

export function validateEnvelope(envelope) {
  const errors = [];
  if (!isObject(envelope)) {
    return [{ field: '(envelope)', message: '存储内容必须是对象' }];
  }
  if (!Number.isInteger(envelope.schemaVersion) || envelope.schemaVersion < 1) {
    errors.push({ field: 'schemaVersion', message: '存储结构版本必须是正整数' });
  } else if (envelope.schemaVersion > SCHEMA_VERSION) {
    errors.push({ field: 'schemaVersion', message: `不支持未来存储结构版本 ${envelope.schemaVersion}` });
  }
  if (!Number.isInteger(envelope.seedVersion) || envelope.seedVersion < 0) {
    errors.push({ field: 'seedVersion', message: '种子版本必须是非负整数' });
  } else if (envelope.seedVersion > SEED_VERSION) {
    errors.push({ field: 'seedVersion', message: `不支持未来种子版本 ${envelope.seedVersion}` });
  }
  if (typeof envelope.savedAt !== 'string' || Number.isNaN(Date.parse(envelope.savedAt))) {
    errors.push({ field: 'savedAt', message: '保存时间必须是有效 ISO 日期字符串' });
  }
  if (!isObject(envelope.deletedIds)) {
    errors.push({ field: 'deletedIds', message: '删除记录必须是对象' });
  } else {
    DATA_COLLECTIONS.forEach((type) => {
      if (!Array.isArray(envelope.deletedIds[type])) {
        errors.push({ field: `deletedIds.${type}`, message: '删除记录必须是数组' });
      }
    });
  }
  if (envelope.schemaVersion === 3) {
    if (!isObject(envelope.localDrugOverrides)) {
      errors.push({ field: 'localDrugOverrides', message: '药物本地覆盖记录必须是对象' });
    } else {
      Object.entries(envelope.localDrugOverrides).forEach(([id, fields]) => {
        if (!id.trim() || !Array.isArray(fields)
          || fields.some((field) => typeof field !== 'string' || !field.trim() || field === 'id')) {
          errors.push({ field: `localDrugOverrides.${id}`, message: '药物本地覆盖字段必须是非空字符串数组' });
        }
      });
    }
    if (!Array.isArray(envelope.seedDrugIds)
      || envelope.seedDrugIds.some((id) => typeof id !== 'string' || !id.trim())) {
      errors.push({ field: 'seedDrugIds', message: '内置药物 ID 记录必须是非空字符串数组' });
    }
  }
  if (envelope.schemaVersion >= 4) {
    if (!isObject(envelope.localOverrides)) {
      errors.push({ field: 'localOverrides', message: '本地字段覆盖记录必须是对象' });
    } else {
      DATA_COLLECTIONS.forEach((type) => {
        if (!isObject(envelope.localOverrides[type])) {
          errors.push({ field: `localOverrides.${type}`, message: '本地字段覆盖集合必须是对象' });
          return;
        }
        Object.entries(envelope.localOverrides[type]).forEach(([id, fields]) => {
          if (!id.trim() || !Array.isArray(fields)
            || fields.some((field) => typeof field !== 'string' || !field.trim() || field === 'id')) {
            errors.push({ field: `localOverrides.${type}.${id}`, message: '本地覆盖字段必须是非空字符串数组' });
          }
        });
      });
    }
    if (!isObject(envelope.seedIds)) {
      errors.push({ field: 'seedIds', message: '内置词条 ID 记录必须是对象' });
    } else {
      DATA_COLLECTIONS.forEach((type) => {
        if (!Array.isArray(envelope.seedIds[type])
          || envelope.seedIds[type].some((id) => typeof id !== 'string' || !id.trim())) {
          errors.push({ field: `seedIds.${type}`, message: '内置词条 ID 记录必须是非空字符串数组' });
        }
      });
    }
  }
  if (!isObject(envelope.data)) {
    errors.push({ field: 'data', message: '实际数据必须是对象' });
  } else {
    errors.push(...validateData(envelope.data).map((error) => ({
      field: `data.${error.type}[${error.id}].${error.field}`,
      message: error.message
    })));
  }
  return errors;
}

function parseStoredValue(rawValue) {
  if (typeof rawValue !== 'string') {
    return { ok: false, errors: [{ field: '(raw)', message: '原始存储值必须是字符串' }] };
  }
  try {
    return { ok: true, value: JSON.parse(rawValue) };
  } catch {
    return { ok: false, errors: [{ field: '(json)', message: '原始存储不是有效 JSON' }] };
  }
}

export function isCurrentEnvelopeRaw(rawValue) {
  const parsed = parseStoredValue(rawValue);
  return parsed.ok
    && isObject(parsed.value)
    && parsed.value.schemaVersion === SCHEMA_VERSION
    && parsed.value.seedVersion === SEED_VERSION;
}

export function migrateKnowledge(rawValue, seedData, {
  now = new Date(),
  seedVersion = SEED_VERSION
} = {}) {
  const parsed = parseStoredValue(rawValue);
  if (!parsed.ok) return parsed;
  if (!isObject(parsed.value)) {
    return { ok: false, errors: [{ field: '(root)', message: '存储顶层必须是对象' }] };
  }

  const stored = parsed.value;
  let savedData;
  let deletedIds;
  let localOverrides;
  let previousSeedIds;
  let sourceSchemaVersion;
  let sourceSeedVersion;

  if (Object.hasOwn(stored, 'schemaVersion') || Object.hasOwn(stored, 'data')) {
    sourceSchemaVersion = stored.schemaVersion;
    sourceSeedVersion = stored.seedVersion;
    if (!Number.isInteger(sourceSchemaVersion) || sourceSchemaVersion < 1) {
      return { ok: false, errors: [{ field: 'schemaVersion', message: '存储结构版本无效' }] };
    }
    if (sourceSchemaVersion > SCHEMA_VERSION) {
      return { ok: false, errors: [{ field: 'schemaVersion', message: `不支持未来存储结构版本 ${sourceSchemaVersion}` }] };
    }
    if (!Number.isInteger(sourceSeedVersion) || sourceSeedVersion < 0) {
      return { ok: false, errors: [{ field: 'seedVersion', message: '种子版本无效' }] };
    }
    if (sourceSeedVersion > seedVersion) {
      return { ok: false, errors: [{ field: 'seedVersion', message: `不支持未来种子版本 ${sourceSeedVersion}` }] };
    }
    if (!isObject(stored.data)) {
      return { ok: false, errors: [{ field: 'data', message: '实际数据必须是对象' }] };
    }
    const missingCollection = DATA_COLLECTIONS.find((type) => !Array.isArray(stored.data[type]));
    if (missingCollection) {
      return {
        ok: false,
        errors: [{ field: `data.${missingCollection}`, message: `${missingCollection} 必须是数组` }]
      };
    }
    if (sourceSchemaVersion >= 3) {
      const sourceErrors = validateEnvelope(stored);
      if (sourceErrors.length) return { ok: false, errors: sourceErrors };
    }
    savedData = stored.data;
    deletedIds = createDeletedIds(stored.deletedIds);
    if (sourceSchemaVersion >= 4) {
      localOverrides = createLocalOverrides(stored.localOverrides);
      previousSeedIds = createSeedIds(stored.seedIds);
    } else if (sourceSchemaVersion === 3) {
      localOverrides = createLocalOverrides({
        drugs: createOverridesById(stored.localDrugOverrides)
      });
      previousSeedIds = createSeedIds({
        drugs: createIdList(stored.seedDrugIds)
      });
    } else {
      localOverrides = createLocalOverrides();
      previousSeedIds = createSeedIds();
    }
  } else {
    sourceSchemaVersion = 1;
    sourceSeedVersion = Number.isInteger(stored.meta?.version)
      ? stored.meta.version
      : LEGACY_SEED_VERSION;
    const missingCollection = DATA_COLLECTIONS.find((type) => !Array.isArray(stored[type]));
    if (missingCollection) {
      return {
        ok: false,
        errors: [{ field: missingCollection, message: `旧格式 ${missingCollection} 必须是数组` }]
      };
    }
    savedData = Object.fromEntries(DATA_COLLECTIONS.map((type) => [type, stored[type]]));
    deletedIds = createDeletedIds();
    localOverrides = createLocalOverrides();
    previousSeedIds = createSeedIds();
  }

  const mergeResult = mergeWithSeedDetails(savedData, seedData, deletedIds, {
    localOverrides,
    seedIds: previousSeedIds
  });
  const mergedData = mergeResult.data;
  const nextLocalOverrides = pruneLocalOverrides(
    localOverrides,
    mergedData,
    seedData
  );
  const currentSeedIds = seedIdsFromData(seedData);
  const nextSeedIds = createSeedIds(Object.fromEntries(DATA_COLLECTIONS.map((type) => [
    type,
    [...currentSeedIds[type], ...mergeResult.retainedSeedIds[type]]
  ])));
  const needsWrite = sourceSchemaVersion !== SCHEMA_VERSION
    || sourceSeedVersion !== seedVersion
    || JSON.stringify(stored.data) !== JSON.stringify(mergedData)
    || JSON.stringify(stored.deletedIds) !== JSON.stringify(createDeletedIds(deletedIds))
    || JSON.stringify(stored.localOverrides) !== JSON.stringify(nextLocalOverrides)
    || JSON.stringify(stored.seedIds) !== JSON.stringify(nextSeedIds);
  const envelope = createEnvelope(mergedData, {
    schemaVersion: SCHEMA_VERSION,
    seedVersion,
    savedAt: needsWrite ? now.toISOString() : stored.savedAt,
    deletedIds,
    localOverrides: nextLocalOverrides,
    seedIds: nextSeedIds
  });
  const errors = validateEnvelope(envelope);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    envelope,
    needsWrite,
    sourceSchemaVersion,
    sourceSeedVersion
  };
}
