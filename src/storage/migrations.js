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

const LEGACY_SEED_FIELD_VALUES = Object.freeze({
  citalopram: Object.freeze({
    kinetics: Object.freeze([
      '经肝脏 CYP2C19、CYP3A4 和 CYP2D6 代谢，半衰期约 35 小时；老年、肝损害或 CYP2C19 抑制时暴露增加。'
    ]),
    contraindications: Object.freeze([
      '剂量依赖性 QT 间期延长是重要警示；先天性长 QT、心动过缓、低钾低镁或合并延长 QT 药物时需避免或严密监测。'
    ]),
    sideEffects: Object.freeze([
      '常见恶心、腹泻或消化不适、头痛、出汗、失眠或嗜睡，以及性欲下降、延迟射精或高潮困难。开始用药或调整剂量后，少数人会短暂感到焦虑或激越。',
      `• 中枢神经系统：头痛；兴奋、激动或焦虑；失眠或嗜睡；少数人可能出现轻躁狂、认知变化、运动障碍或感觉异常。
• 心血管：需特别关注剂量相关的 QT 间期延长；先天性长 QT、心动过缓、低钾低镁或合并延长 QT 药物时，应避免使用或严密监测；少数人可出现心动过速、心悸或头晕。
• 血液系统：可能出现血小板减少或出血倾向；合用非甾体类抗炎药、阿司匹林或其他抗凝药物时需谨慎。
• 内分泌与代谢：可能出现低钠血症，少数女性可能出现泌乳素升高。
• 消化系统：常见恶心、呕吐，少数人出现腹泻、厌食或体重减轻。
• 泌尿生殖系统：可能出现性欲下降、勃起障碍、性快感缺失或延迟高潮。
• 过敏及其他：极少数人出现皮疹；也有脱发、鼻炎、夜尿或骨量变化等报告。`
    ])
  })
});

function applyKnownSeedFieldUpdates(savedItem, seedItem) {
  const fieldUpdates = LEGACY_SEED_FIELD_VALUES[savedItem?.id];
  if (!fieldUpdates || !seedItem) return savedItem;

  let nextItem = savedItem;
  Object.entries(fieldUpdates).forEach(([field, legacyValues]) => {
    const isCitalopramSideEffectsPunctuationVariant = (
      savedItem.id === 'citalopram'
      && field === 'sideEffects'
      && typeof savedItem[field] === 'string'
      && legacyValues.some((legacyValue) => (
        typeof legacyValue === 'string'
        && savedItem[field].replace('严密监测。；', '严密监测；') === legacyValue
      ))
    );
    if (
      typeof seedItem[field] === 'string'
      && (legacyValues.includes(savedItem[field]) || isCitalopramSideEffectsPunctuationVariant)
      && savedItem[field] !== seedItem[field]
    ) {
      nextItem = { ...nextItem, [field]: seedItem[field] };
    }
  });
  return nextItem;
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
    const seedItems = Array.isArray(seedData?.[type]) ? seedData[type] : [];
    const seedById = new Map(seedItems.map((item) => [item.id, item]));
    const savedItems = (Array.isArray(savedData?.[type]) ? cloneValue(savedData[type]) : [])
      .map((item) => {
        const seedItem = seedById.get(item?.id);
        const updatedItem = type === 'drugs'
          ? applyKnownSeedFieldUpdates(item, seedItem)
          : item;
        if (
          type !== 'drugs'
          || !seedItem
          || Object.hasOwn(updatedItem, 'sideEffects')
          || typeof seedItem.sideEffects !== 'string'
        ) {
          return updatedItem;
        }
        return { ...updatedItem, sideEffects: seedItem.sideEffects };
      });
    const savedIds = new Set(savedItems.map((item) => item?.id).filter(Boolean));
    const deleted = new Set(normalizedDeletedIds[type]);
    const additions = seedItems
      .filter((item) => !savedIds.has(item.id) && !deleted.has(item.id))
      .map((item) => cloneValue(item));
    return [type, [...savedItems, ...additions]];
  }));
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
    const missingCollection = DATA_COLLECTIONS.find((type) => !Array.isArray(stored.data[type]));
    if (missingCollection) {
      return {
        ok: false,
        errors: [{ field: `data.${missingCollection}`, message: `${missingCollection} 必须是数组` }]
      };
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
    deletedIds = createDeletedIds();
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
