import {
  DATA_COLLECTIONS,
  SCHEMA_VERSION,
  SEED_VERSION
} from './constants.js';
import {
  createLocalOverrides,
  createSeedIds,
  migrateKnowledge,
  validateEnvelope
} from './migrations.js';
import {
  KnowledgeStorageError,
  replaceKnowledge
} from './storage.js';
import { validateData } from '../validation/dataValidation.js';

export const BACKUP_FORMAT = 'symgene-local-backup';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class KnowledgeTransferError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = 'KnowledgeTransferError';
    this.code = code;
    this.details = details;
  }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function requireValidEnvelope(envelope, message) {
  const errors = validateEnvelope(envelope);
  if (errors.length) {
    throw new KnowledgeTransferError('validation-failed', message, errors);
  }
}

export function createKnowledgeExport(envelope, {
  now = new Date()
} = {}) {
  requireValidEnvelope(envelope, '当前本地数据未通过校验，无法导出。');
  return {
    format: BACKUP_FORMAT,
    schemaVersion: envelope.schemaVersion,
    seedVersion: envelope.seedVersion,
    exportedAt: now.toISOString(),
    data: cloneValue(envelope.data),
    deletedIds: cloneValue(envelope.deletedIds),
    localOverrides: cloneValue(envelope.localOverrides),
    seedIds: cloneValue(envelope.seedIds)
  };
}

export function serializeKnowledgeExport(envelope, options) {
  return JSON.stringify(createKnowledgeExport(envelope, options), null, 2);
}

export function knowledgeExportFilename(now = new Date()) {
  return `symgene-backup-${now.toISOString().slice(0, 10)}.json`;
}

function validateImportShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new KnowledgeTransferError('import-root-invalid', '导入内容顶层必须是对象。');
  }
  if (value.format !== BACKUP_FORMAT) {
    throw new KnowledgeTransferError('import-format-invalid', '导入文件缺少受支持的格式标识。');
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new KnowledgeTransferError('import-schema-invalid', '导入文件的存储结构版本无效。');
  }
  if (value.schemaVersion > SCHEMA_VERSION) {
    throw new KnowledgeTransferError('import-version-future', '导入文件来自尚不支持的未来结构版本。');
  }
  if (!Number.isInteger(value.seedVersion) || value.seedVersion < 0) {
    throw new KnowledgeTransferError('import-seed-invalid', '导入文件的种子版本无效。');
  }
  if (value.seedVersion > SEED_VERSION) {
    throw new KnowledgeTransferError('import-version-future', '导入文件来自尚不支持的未来种子版本。');
  }
  if (typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) {
    throw new KnowledgeTransferError('import-date-invalid', '导入文件缺少有效的导出时间。');
  }
  const deletedIdsValid = value.deletedIds
    && typeof value.deletedIds === 'object'
    && !Array.isArray(value.deletedIds)
    && DATA_COLLECTIONS.every((type) => Array.isArray(value.deletedIds[type]));
  if (!deletedIdsValid) {
    throw new KnowledgeTransferError('import-deletions-invalid', '导入文件的删除记录格式无效。');
  }
  if (value.schemaVersion === 3) {
    const normalizedOverrides = createLocalOverrides({
      drugs: value.localDrugOverrides
    }).drugs;
    if (JSON.stringify(value.localDrugOverrides) !== JSON.stringify(normalizedOverrides)) {
      throw new KnowledgeTransferError('import-overrides-invalid', '导入文件的药物本地覆盖记录无效。');
    }
    const normalizedSeedDrugIds = createSeedIds({
      drugs: value.seedDrugIds
    }).drugs;
    if (JSON.stringify(value.seedDrugIds) !== JSON.stringify(normalizedSeedDrugIds)) {
      throw new KnowledgeTransferError('import-seed-ids-invalid', '导入文件的内置药物 ID 记录无效。');
    }
  }
  if (value.schemaVersion >= 4) {
    const normalizedOverrides = createLocalOverrides(value.localOverrides);
    if (JSON.stringify(value.localOverrides) !== JSON.stringify(normalizedOverrides)) {
      throw new KnowledgeTransferError('import-overrides-invalid', '导入文件的本地字段覆盖记录无效。');
    }
    const normalizedSeedIds = createSeedIds(value.seedIds);
    if (JSON.stringify(value.seedIds) !== JSON.stringify(normalizedSeedIds)) {
      throw new KnowledgeTransferError('import-seed-ids-invalid', '导入文件的内置词条 ID 记录无效。');
    }
  }
  const errors = validateData(value.data);
  if (errors.length) {
    throw new KnowledgeTransferError('validation-failed', '导入数据未通过完整性校验。', errors);
  }
}

export function parseKnowledgeImport(text, {
  size = typeof text === 'string' ? byteLength(text) : 0,
  seedData,
  now = new Date()
} = {}) {
  if (typeof text !== 'string') {
    throw new KnowledgeTransferError('import-file-invalid', '导入文件必须能读取为文本。');
  }
  const actualSize = byteLength(text);
  if (!Number.isFinite(size)
    || size < 0
    || Math.max(size, actualSize) > MAX_IMPORT_BYTES) {
    throw new KnowledgeTransferError('import-file-too-large', '导入文件超过 5 MB 上限。');
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new KnowledgeTransferError('import-json-invalid', '导入文件不是有效 JSON。');
  }
  validateImportShape(value);

  const migration = migrateKnowledge(JSON.stringify({
    schemaVersion: value.schemaVersion,
    seedVersion: value.seedVersion,
    savedAt: value.exportedAt,
    data: value.data,
    deletedIds: value.deletedIds,
    localOverrides: value.localOverrides,
    seedIds: value.seedIds,
    localDrugOverrides: value.localDrugOverrides,
    seedDrugIds: value.seedDrugIds
  }), seedData, {
    now,
    seedVersion: SEED_VERSION
  });
  if (!migration.ok) {
    throw new KnowledgeTransferError(
      'import-migration-failed',
      '导入文件无法安全迁移到当前版本。',
      migration.errors
    );
  }
  requireValidEnvelope(migration.envelope, '导入数据未通过完整性校验。');
  return {
    envelope: migration.envelope,
    source: {
      schemaVersion: value.schemaVersion,
      seedVersion: value.seedVersion,
      exportedAt: value.exportedAt
    }
  };
}

export function summarizeKnowledgeImport(importedEnvelope, currentEnvelope) {
  let added = 0;
  let overwritten = 0;
  DATA_COLLECTIONS.forEach((type) => {
    const currentById = new Map(
      currentEnvelope.data[type].map((item) => [item.id, item])
    );
    importedEnvelope.data[type].forEach((item) => {
      const current = currentById.get(item.id);
      if (!current) {
        added += 1;
      } else if (JSON.stringify(current) !== JSON.stringify(item)) {
        overwritten += 1;
      }
    });
  });
  return {
    counts: Object.fromEntries(DATA_COLLECTIONS.map((type) => [
      type,
      importedEnvelope.data[type].length
    ])),
    added,
    overwritten,
    deleted: DATA_COLLECTIONS.reduce(
      (total, type) => total + importedEnvelope.deletedIds[type].length,
      0
    ),
    schemaVersion: importedEnvelope.schemaVersion,
    seedVersion: importedEnvelope.seedVersion
  };
}

export function applyKnowledgeImport(storage, envelope, {
  confirmed = true,
  now = new Date()
} = {}) {
  if (!confirmed) return { applied: false, envelope: null, backupKey: null };
  requireValidEnvelope(envelope, '导入数据未通过完整性校验。');
  try {
    const result = replaceKnowledge(storage, envelope, { now });
    return { applied: true, ...result };
  } catch (error) {
    if (error instanceof KnowledgeStorageError) throw error;
    throw new KnowledgeTransferError('import-write-failed', '导入数据写入失败。');
  }
}

export function downloadTextFile(text, filename, {
  documentObject = document,
  urlObject = URL
} = {}) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const objectUrl = urlObject.createObjectURL(blob);
  const link = documentObject.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  documentObject.body.append(link);
  link.click();
  link.remove();
  urlObject.revokeObjectURL(objectUrl);
}
