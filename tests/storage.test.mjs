import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_KEY_PREFIX,
  BACKUP_RETENTION_LIMIT,
  STORAGE_KEY
} from '../src/storage/constants.js';
import {
  createEnvelope,
  migrateKnowledge
} from '../src/storage/migrations.js';
import {
  deleteEntry,
  upsertEntry
} from '../src/storage/operations.js';
import {
  createBackup,
  listBackups,
  readKnowledge,
  resetKnowledge,
  restoreBackup,
  writeKnowledge
} from '../src/storage/storage.js';
import {
  clone,
  customEntry,
  makeLegacy,
  makeSeed,
  MemoryStorage
} from './helpers/storage-fixtures.mjs';

const NOW = new Date('2026-07-29T12:00:00.000Z');

function stored(storage) {
  return JSON.parse(storage.getItem(STORAGE_KEY));
}

function currentStorage(data = makeSeed()) {
  const envelope = createEnvelope(data, { savedAt: NOW.toISOString() });
  return new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
}

function entryId(type, suffix) {
  const prefix = type === 'resources' ? 'resource' : type.slice(0, -1);
  return `${prefix}-${suffix}`;
}

test('01 无本地数据时初始化当前种子并写入 schema v2', () => {
  const storage = new MemoryStorage();
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error, null);
  assert.equal(result.envelope.schemaVersion, 2);
  assert.deepEqual(stored(storage), result.envelope);
});

test('02 当前 envelope 原样读取且不创建备份', () => {
  const storage = currentStorage();
  const rawBefore = storage.getItem(STORAGE_KEY);
  const result = readKnowledge(storage, makeSeed(), { now: new Date('2026-07-30T00:00:00Z') });
  assert.equal(result.error, null);
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
  assert.equal(result.envelope.savedAt, NOW.toISOString());
  assert.deepEqual(listBackups(storage), []);
});

test('03 旧 meta.version 数据迁移为 schema v2', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(makeLegacy())]]);
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error, null);
  assert.equal(result.envelope.schemaVersion, 2);
  assert.equal(result.envelope.seedVersion, 11);
});

test('04 无效 JSON 不覆盖主存储值', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, '{invalid']]);
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error.code, 'migration-failed');
  assert.equal(storage.getItem(STORAGE_KEY), '{invalid');
});

test('05 非对象顶层数据不覆盖主存储值', () => {
  const raw = JSON.stringify(['not-an-envelope']);
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error.code, 'migration-failed');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('06 交叉引用无效的旧数据迁移失败', () => {
  const legacy = makeLegacy();
  legacy.cases[0].disorderId = 'missing';
  const result = migrateKnowledge(JSON.stringify(legacy), makeSeed(), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field.includes('disorderId')));
});

for (const type of ['drugs', 'disorders', 'cases', 'resources']) {
  test(`0${7 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)} ${type} 自定义新增在读取后保留`, () => {
    const seed = makeSeed();
    const data = clone(seed);
    data[type].unshift(customEntry(type));
    const storage = currentStorage(data);
    const result = readKnowledge(storage, seed, { now: NOW });
    assert.ok(result.envelope.data[type].some((item) => item.id === customEntry(type).id));
  });
}

for (const type of ['drugs', 'disorders', 'cases', 'resources']) {
  test(`${11 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)} ${type} 用户修改覆盖同 ID 新种子内容`, () => {
    const seed = makeSeed();
    const data = clone(seed);
    const field = type === 'cases' || type === 'resources' ? 'title' : 'name';
    data[type][0][field] = '用户保留值';
    const newerSeed = clone(seed);
    newerSeed[type][0][field] = '新版种子值';
    const result = readKnowledge(currentStorage(data), newerSeed, { now: NOW });
    assert.equal(result.envelope.data[type][0][field], '用户保留值');
  });
}

for (const [type, id] of [
  ['drugs', 'drug-extra'],
  ['disorders', 'disorder-extra'],
  ['cases', 'case-extra'],
  ['resources', 'resource-extra']
]) {
  test(`${15 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)} ${type} 已删除种子条目不会复活`, () => {
    const seed = makeSeed();
    const deleted = deleteEntry(createEnvelope(seed), type, id, seed, { now: NOW });
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(deleted)]]);
    const result = readKnowledge(storage, seed, { now: NOW });
    assert.ok(!result.envelope.data[type].some((item) => item.id === id));
  });
}

test('19 重复删除不会产生重复 tombstone', () => {
  const seed = makeSeed();
  const once = deleteEntry(createEnvelope(seed), 'resources', 'resource-extra', seed, { now: NOW });
  const twice = deleteEntry(once, 'resources', 'resource-extra', seed, { now: NOW });
  assert.deepEqual(twice.deletedIds.resources, ['resource-extra']);
});

test('20 重置恢复种子并清除自定义新增和 tombstone', () => {
  const seed = makeSeed();
  let envelope = upsertEntry(createEnvelope(seed), 'resources', customEntry('resources'), { now: NOW });
  envelope = deleteEntry(envelope, 'resources', 'resource-extra', seed, { now: NOW });
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
  const result = resetKnowledge(storage, seed, { now: NOW });
  assert.deepEqual(result.envelope.data, seed);
  assert.deepEqual(result.envelope.deletedIds.resources, []);
});

for (const type of ['drugs', 'disorders', 'cases', 'resources']) {
  test(`${21 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)} 新种子 ${type} 条目自动加入`, () => {
    const oldSeed = makeSeed();
    const nextSeed = clone(oldSeed);
    const added = { ...customEntry(type), id: entryId(type, 'new-seed') };
    nextSeed[type].push(added);
    const result = readKnowledge(currentStorage(oldSeed), nextSeed, { now: NOW });
    assert.ok(result.envelope.data[type].some((item) => item.id === added.id));
  });
}

test('25 多次合并新种子不会生成重复 ID', () => {
  const seed = makeSeed();
  const nextSeed = clone(seed);
  nextSeed.resources.push({ ...customEntry('resources'), id: 'resource-new-seed' });
  const first = migrateKnowledge(
    JSON.stringify(createEnvelope(seed, { savedAt: NOW.toISOString() })),
    nextSeed,
    { now: NOW }
  );
  const second = migrateKnowledge(JSON.stringify(first.envelope), nextSeed, { now: NOW });
  assert.equal(second.envelope.data.resources.filter((item) => item.id === 'resource-new-seed').length, 1);
});

test('26 迁移写入前创建旧数据的逐字备份', () => {
  const raw = JSON.stringify(makeLegacy());
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
  assert.equal(storage.getItem(result.backupKey), raw);
});

test('27 迁移失败时原始主数据保持不变', () => {
  const raw = JSON.stringify({ meta: { version: 10 }, drugs: [] });
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('28 自动备份最多保留五份且淘汰最旧项', () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < BACKUP_RETENTION_LIMIT + 2; index += 1) {
    createBackup(storage, `raw-${index}`, {
      now: new Date(NOW.getTime() + index * 1000)
    });
  }
  const backups = listBackups(storage);
  assert.equal(backups.length, BACKUP_RETENTION_LIMIT);
  assert.ok(!backups.some((backup) => storage.getItem(backup.key) === 'raw-0'));
  assert.ok(!backups.some((backup) => storage.getItem(backup.key) === 'raw-1'));
});

test('29 重置与备份不删除项目外 localStorage 键', () => {
  const storage = currentStorage();
  storage.setItem('another-app', 'keep-me');
  resetKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(storage.getItem('another-app'), 'keep-me');
});

test('30 恢复备份前自动备份当前数据', () => {
  const seed = makeSeed();
  const older = createEnvelope(seed, { savedAt: '2026-07-28T00:00:00.000Z' });
  const current = upsertEntry(createEnvelope(seed), 'resources', customEntry('resources'), { now: NOW });
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(current)]]);
  const targetKey = createBackup(storage, JSON.stringify(older), {
    now: new Date('2026-07-28T00:00:00.000Z')
  });
  const result = restoreBackup(storage, targetKey, seed, { now: NOW });
  assert.equal(storage.getItem(result.backupKey), JSON.stringify(current));
  assert.ok(!result.envelope.data.resources.some((item) => item.id === 'resource-custom'));
});

test('31 无效备份不能覆盖当前数据', () => {
  const storage = currentStorage();
  const rawBefore = storage.getItem(STORAGE_KEY);
  const key = `${BACKUP_KEY_PREFIX}invalid`;
  storage.setItem(key, '{broken');
  assert.throws(
    () => restoreBackup(storage, key, makeSeed(), { now: NOW }),
    { code: 'backup-invalid' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
});

test.after(() => {
  const storage = currentStorage();
  assert.doesNotThrow(() => writeKnowledge(storage, createEnvelope(makeSeed())));
});
