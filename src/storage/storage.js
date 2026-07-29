import {
  BACKUP_KEY_PREFIX,
  BACKUP_RETENTION_LIMIT,
  SEED_VERSION,
  STORAGE_KEY
} from './constants.js';
import {
  createEnvelope,
  isCurrentEnvelopeRaw,
  migrateKnowledge,
  validateEnvelope
} from './migrations.js';

export class KnowledgeStorageError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'KnowledgeStorageError';
    this.code = code;
  }
}

function storageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === 'string') keys.push(key);
  }
  return keys;
}

function backupTimestamp(key) {
  const encoded = key.slice(BACKUP_KEY_PREFIX.length).split('-copy-')[0];
  const decoded = encoded.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.(\d{3})Z$/,
    '$1-$2-$3T$4:$5:$6.$7Z'
  );
  return Number.isNaN(Date.parse(decoded)) ? '' : decoded;
}

function inspectRawVersion(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return {
      schemaVersion: Number.isInteger(parsed?.schemaVersion) ? parsed.schemaVersion : 1,
      seedVersion: Number.isInteger(parsed?.seedVersion)
        ? parsed.seedVersion
        : (Number.isInteger(parsed?.meta?.version) ? parsed.meta.version : null)
    };
  } catch {
    return { schemaVersion: null, seedVersion: null };
  }
}

export function listBackups(storage) {
  return storageKeys(storage)
    .filter((key) => key.startsWith(BACKUP_KEY_PREFIX))
    .map((key) => {
      const rawValue = storage.getItem(key) ?? '';
      return {
        key,
        savedAt: backupTimestamp(key),
        bytes: new TextEncoder().encode(rawValue).length,
        ...inspectRawVersion(rawValue)
      };
    })
    .sort((left, right) => right.key.localeCompare(left.key));
}

function makeBackupKey(storage, now) {
  const base = `${BACKUP_KEY_PREFIX}${now.toISOString().replaceAll(':', '-')}`;
  if (storage.getItem(base) == null) return base;
  let suffix = 2;
  while (storage.getItem(`${base}-copy-${suffix}`) != null) suffix += 1;
  return `${base}-copy-${suffix}`;
}

export function createBackup(storage, rawValue, {
  now = new Date(),
  retentionLimit = BACKUP_RETENTION_LIMIT
} = {}) {
  if (typeof rawValue !== 'string') {
    throw new KnowledgeStorageError('backup-invalid-source', '无法备份非字符串存储内容。');
  }
  const key = makeBackupKey(storage, now);
  try {
    storage.setItem(key, rawValue);
    const staleBackups = listBackups(storage).slice(retentionLimit);
    staleBackups.forEach((backup) => storage.removeItem(backup.key));
  } catch (error) {
    try {
      storage.removeItem(key);
    } catch {
      // The original application data remains untouched even if cleanup is denied.
    }
    throw new KnowledgeStorageError('backup-write-failed', '无法创建本地安全备份。', error);
  }
  return key;
}

export function writeKnowledge(storage, envelope) {
  const errors = validateEnvelope(envelope);
  if (errors.length) {
    throw new KnowledgeStorageError('validation-failed', '本地数据未通过完整性校验。');
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    throw new KnowledgeStorageError('storage-write-failed', '无法写入浏览器本地存储。', error);
  }
  return envelope;
}

export function readKnowledge(storage, seedData, {
  legacySeedData = seedData,
  now = new Date(),
  seedVersion = SEED_VERSION
} = {}) {
  let rawValue;
  try {
    rawValue = storage.getItem(STORAGE_KEY);
  } catch (error) {
    return {
      envelope: createEnvelope(seedData, { seedVersion, savedAt: now.toISOString() }),
      error: new KnowledgeStorageError('storage-read-failed', '无法读取浏览器本地存储。', error),
      backupKey: null
    };
  }

  if (rawValue == null) {
    const envelope = createEnvelope(seedData, { seedVersion, savedAt: now.toISOString() });
    try {
      writeKnowledge(storage, envelope);
      return { envelope, error: null, backupKey: null };
    } catch (error) {
      return { envelope, error, backupKey: null };
    }
  }

  const currentFormat = isCurrentEnvelopeRaw(rawValue);
  let backupKey = null;
  if (!currentFormat) {
    try {
      backupKey = createBackup(storage, rawValue, { now });
    } catch (error) {
      return {
        envelope: createEnvelope(seedData, { seedVersion, savedAt: now.toISOString() }),
        error,
        backupKey: null
      };
    }
  }

  const migration = migrateKnowledge(rawValue, seedData, {
    legacySeedData,
    now,
    seedVersion
  });
  if (!migration.ok) {
    if (!backupKey) {
      try {
        backupKey = createBackup(storage, rawValue, { now });
      } catch {
        // The primary value is intentionally never replaced on a failed migration.
      }
    }
    return {
      envelope: createEnvelope(seedData, { seedVersion, savedAt: now.toISOString() }),
      error: new KnowledgeStorageError('migration-failed', '现有本地数据无法安全迁移，原数据已保留。'),
      backupKey,
      migrationErrors: migration.errors
    };
  }

  if (!migration.needsWrite) {
    return { envelope: migration.envelope, error: null, backupKey: null };
  }

  try {
    if (!backupKey) backupKey = createBackup(storage, rawValue, { now });
    writeKnowledge(storage, migration.envelope);
  } catch (error) {
    return {
      envelope: createEnvelope(seedData, { seedVersion, savedAt: now.toISOString() }),
      error,
      backupKey: backupKey || null
    };
  }
  return { envelope: migration.envelope, error: null, backupKey };
}

export function replaceKnowledge(storage, envelope, { now = new Date() } = {}) {
  const errors = validateEnvelope(envelope);
  if (errors.length) {
    throw new KnowledgeStorageError('validation-failed', '替换数据未通过完整性校验。');
  }
  const currentRaw = storage.getItem(STORAGE_KEY);
  const backupKey = currentRaw == null ? null : createBackup(storage, currentRaw, { now });
  writeKnowledge(storage, envelope);
  return { envelope, backupKey };
}

export function restoreBackup(storage, backupKey, seedData, {
  legacySeedData = seedData,
  now = new Date(),
  seedVersion = SEED_VERSION
} = {}) {
  if (typeof backupKey !== 'string' || !backupKey.startsWith(BACKUP_KEY_PREFIX)) {
    throw new KnowledgeStorageError('backup-key-invalid', '备份标识无效。');
  }
  const rawValue = storage.getItem(backupKey);
  if (rawValue == null) {
    throw new KnowledgeStorageError('backup-not-found', '指定备份不存在。');
  }
  const migration = migrateKnowledge(rawValue, seedData, {
    legacySeedData,
    now,
    seedVersion
  });
  if (!migration.ok) {
    throw new KnowledgeStorageError('backup-invalid', '该备份未通过完整性校验，未执行恢复。');
  }
  return replaceKnowledge(storage, migration.envelope, { now });
}

export function resetKnowledge(storage, seedData, {
  now = new Date(),
  seedVersion = SEED_VERSION
} = {}) {
  const envelope = createEnvelope(seedData, {
    seedVersion,
    savedAt: now.toISOString()
  });
  return replaceKnowledge(storage, envelope, { now });
}
