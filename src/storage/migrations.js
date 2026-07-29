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
  deletedIds = createDeletedIds()
} = {}) {
  return {
    schemaVersion,
    seedVersion,
    savedAt,
    data: cloneValue(data),
    deletedIds: createDeletedIds(deletedIds)
  };
}

export function mergeWithSeed(savedData, seedData, deletedIds = createDeletedIds()) {
  const normalizedDeletedIds = createDeletedIds(deletedIds);
  return Object.fromEntries(DATA_COLLECTIONS.map((type) => {
    const savedItems = Array.isArray(savedData?.[type]) ? cloneValue(savedData[type]) : [];
    const savedIds = new Set(savedItems.map((item) => item?.id).filter(Boolean));
    const deleted = new Set(normalizedDeletedIds[type]);
    const additions = (seedData?.[type] || [])
      .filter((item) => !savedIds.has(item.id) && !deleted.has(item.id))
      .map((item) => cloneValue(item));
    return [type, [...savedItems, ...additions]];
  }));
}

export function inferLegacyDeletedIds(legacyData, legacySeedData) {
  const deletedIds = createDeletedIds();
  DATA_COLLECTIONS.forEach((type) => {
    const savedIds = new Set((legacyData[type] || []).map((item) => item?.id).filter(Boolean));
    deletedIds[type] = (legacySeedData?.[type] || [])
      .map((item) => item.id)
      .filter((id) => !savedIds.has(id));
  });
  return deletedIds;
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
  legacySeedData = seedData,
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
    savedData = stored.data;
    deletedIds = createDeletedIds(stored.deletedIds);
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
    deletedIds = inferLegacyDeletedIds(savedData, legacySeedData);
  }

  const mergedData = mergeWithSeed(savedData, seedData, deletedIds);
  const needsWrite = sourceSchemaVersion !== SCHEMA_VERSION
    || sourceSeedVersion !== seedVersion
    || JSON.stringify(stored.data) !== JSON.stringify(mergedData)
    || JSON.stringify(stored.deletedIds) !== JSON.stringify(createDeletedIds(deletedIds));
  const envelope = createEnvelope(mergedData, {
    schemaVersion: SCHEMA_VERSION,
    seedVersion,
    savedAt: needsWrite ? now.toISOString() : stored.savedAt,
    deletedIds
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
