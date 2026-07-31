import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneSeed as cloneProjectSeed } from '../src/data.js';
import { drugSideEffectsById } from '../src/drugSideEffects.js';
import {
  BACKUP_KEY_PREFIX,
  BACKUP_RETENTION_LIMIT,
  STORAGE_KEY
} from '../src/storage/constants.js';
import {
  createEnvelope,
  migrateKnowledge,
  validateEnvelope
} from '../src/storage/migrations.js';
import {
  deleteEntry,
  upsertEntry
} from '../src/storage/operations.js';
import {
  applyKnowledgeImport,
  BACKUP_FORMAT,
  createKnowledgeExport,
  MAX_IMPORT_BYTES,
  parseKnowledgeImport,
  serializeKnowledgeExport,
  summarizeKnowledgeImport
} from '../src/storage/importExport.js';
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

function seedIdsFrom(seedData) {
  return Object.fromEntries(
    ['drugs', 'disorders', 'cases', 'resources'].map((type) => [
      type,
      seedData[type].map((item) => item.id)
    ])
  );
}

function currentStorage(data = makeSeed(), seedData = data) {
  const envelope = createEnvelope(data, {
    savedAt: NOW.toISOString(),
    seedIds: seedIdsFrom(seedData)
  });
  return new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
}

class ControlledStorage extends MemoryStorage {
  constructor(entries = []) {
    super(entries);
    this.failBackupWrites = false;
    this.failPrimaryWrites = false;
  }

  setItem(key, value) {
    if (this.failBackupWrites && String(key).startsWith(BACKUP_KEY_PREFIX)) {
      throw new Error('backup write denied');
    }
    if (this.failPrimaryWrites && String(key) === STORAGE_KEY) {
      throw new Error('primary write denied');
    }
    super.setItem(key, value);
  }
}

function entryId(type, suffix) {
  const prefix = type === 'resources' ? 'resource' : type.slice(0, -1);
  return `${prefix}-${suffix}`;
}

test('01 无本地数据时初始化当前种子并写入 schema v4', () => {
  const storage = new MemoryStorage();
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error, null);
  assert.equal(result.envelope.schemaVersion, 4);
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

test('03 旧 meta.version 数据迁移为 schema v4', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(makeLegacy())]]);
  const result = readKnowledge(storage, makeSeed(), { now: NOW });
  assert.equal(result.error, null);
  assert.equal(result.envelope.schemaVersion, 4);
  assert.equal(result.envelope.seedVersion, 13);
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

test('06 交叉引用无效的自定义旧案例迁移失败', () => {
  const legacy = makeLegacy();
  legacy.cases.push({
    ...customEntry('cases'),
    id: 'case-invalid',
    disorderId: 'missing'
  });
  const result = migrateKnowledge(JSON.stringify(legacy), makeSeed(), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field.includes('disorderId')));
});

for (const type of ['drugs', 'disorders', 'cases', 'resources']) {
  test(`${String(7 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)).padStart(2, '0')} ${type} 自定义新增在读取后保留`, () => {
    const seed = makeSeed();
    const data = clone(seed);
    data[type].unshift(customEntry(type));
    const storage = currentStorage(data, seed);
    const result = readKnowledge(storage, seed, { now: NOW });
    assert.ok(result.envelope.data[type].some((item) => item.id === customEntry(type).id));
  });
}

for (const type of ['drugs', 'disorders', 'cases', 'resources']) {
  test(`${11 + ['drugs', 'disorders', 'cases', 'resources'].indexOf(type)} ${type} 用户修改覆盖同 ID 新种子内容`, () => {
    const seed = makeSeed();
    const field = type === 'cases' || type === 'resources' ? 'title' : 'name';
    const editedItem = { ...seed[type][0], [field]: '用户保留值' };
    const envelope = upsertEntry(
      createEnvelope(seed),
      type,
      editedItem,
      { now: NOW, seedData: seed }
    );
    const newerSeed = clone(seed);
    newerSeed[type][0][field] = '新版种子值';
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
    const result = readKnowledge(storage, newerSeed, { now: NOW });
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

test('19b 删除有关联案例的疾病抛出 dependency-conflict 并报告关联详情', () => {
  const seed = makeSeed();
  let error;
  try {
    deleteEntry(createEnvelope(seed), 'disorders', 'disorder-core', seed, { now: NOW });
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.code, 'dependency-conflict');
  assert.equal(error?.type, 'disorders');
  assert.equal(error?.id, 'disorder-core');
  assert.equal(error?.relatedType, 'cases');
  assert.equal(error?.relatedCount, 2);
  assert.deepEqual(error?.relatedIds, ['case-core', 'case-extra']);
});

test('19c dependency-conflict 不改变原 envelope、疾病、案例或 tombstone', () => {
  const seed = makeSeed();
  const envelope = createEnvelope(seed);
  const before = clone(envelope);
  assert.throws(
    () => deleteEntry(envelope, 'disorders', 'disorder-core', seed, { now: NOW }),
    { code: 'dependency-conflict' }
  );
  assert.deepEqual(envelope, before);
  assert.ok(envelope.data.disorders.some((item) => item.id === 'disorder-core'));
  assert.deepEqual(
    envelope.data.cases.filter((item) => item.disorderId === 'disorder-core').map((item) => item.id),
    ['case-core', 'case-extra']
  );
  assert.deepEqual(envelope.deletedIds.disorders, []);
  assert.deepEqual(envelope.deletedIds.cases, []);
});

test('19d 无关联的自定义疾病仍可删除且不生成 tombstone', () => {
  const seed = makeSeed();
  const envelope = upsertEntry(
    createEnvelope(seed),
    'disorders',
    customEntry('disorders'),
    { now: NOW }
  );
  const result = deleteEntry(envelope, 'disorders', 'disorder-custom', seed, { now: NOW });
  assert.ok(!result.data.disorders.some((item) => item.id === 'disorder-custom'));
  assert.deepEqual(result.deletedIds.disorders, []);
});

test('19e 无关联的种子疾病仍可删除并生成疾病 tombstone', () => {
  const seed = makeSeed();
  const result = deleteEntry(
    createEnvelope(seed),
    'disorders',
    'disorder-extra',
    seed,
    { now: NOW }
  );
  assert.ok(!result.data.disorders.some((item) => item.id === 'disorder-extra'));
  assert.deepEqual(result.deletedIds.disorders, ['disorder-extra']);
  assert.deepEqual(result.deletedIds.cases, []);
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

for (const [type, id] of [
  ['drugs', 'drug-extra'],
  ['disorders', 'disorder-extra'],
  ['cases', 'case-extra'],
  ['resources', 'resource-extra']
]) {
  test(`25 legacy format 缺少 ${type} new seed entry must not infer deletion`, () => {
    const seed = makeSeed();
    const legacyData = clone(seed);
    legacyData[type] = legacyData[type].filter((item) => item.id !== id);
    const result = migrateKnowledge(JSON.stringify(makeLegacy(legacyData)), seed, { now: NOW });
    assert.equal(result.ok, true);
    assert.ok(result.envelope.data[type].some((item) => item.id === id));
    assert.ok(!result.envelope.deletedIds[type].includes(id));
  });
}

test('25e legacy format 用户自定义条目在补充 new seed entry 后继续保留', () => {
  const seed = makeSeed();
  const legacyData = clone(seed);
  legacyData.resources = [
    legacyData.resources[0],
    customEntry('resources')
  ];
  const result = migrateKnowledge(JSON.stringify(makeLegacy(legacyData)), seed, { now: NOW });
  assert.ok(result.envelope.data.resources.some((item) => item.id === 'resource-custom'));
  assert.ok(result.envelope.data.resources.some((item) => item.id === 'resource-extra'));
});

test('25f legacy format 内置药物旧快照升级为当前种子内容', () => {
  const seed = makeSeed();
  const legacyData = clone(seed);
  legacyData.drugs[0].name = '用户保留值';
  legacyData.drugs = [legacyData.drugs[0]];
  const result = migrateKnowledge(JSON.stringify(makeLegacy(legacyData)), seed, { now: NOW });
  assert.equal(
    result.envelope.data.drugs.find((item) => item.id === 'drug-core').name,
    '核心药物'
  );
  assert.ok(result.envelope.data.drugs.some((item) => item.id === 'drug-extra'));
});

test('25g legacy format must not infer deletion：迁移后的 deletedIds 全部为空', () => {
  const seed = makeSeed();
  const legacyData = Object.fromEntries(
    Object.entries(seed).map(([type, items]) => [type, [items[0]]])
  );
  const result = migrateKnowledge(JSON.stringify(makeLegacy(legacyData)), seed, { now: NOW });
  assert.deepEqual(result.envelope.deletedIds, {
    drugs: [],
    disorders: [],
    cases: [],
    resources: []
  });
});

test('25h legacy format 迁移后新执行的删除会生成 tombstone', () => {
  const seed = makeSeed();
  const migrated = migrateKnowledge(
    JSON.stringify(makeLegacy({ ...clone(seed), resources: [seed.resources[0]] })),
    seed,
    { now: NOW }
  );
  const deleted = deleteEntry(
    migrated.envelope,
    'resources',
    'resource-extra',
    seed,
    { now: NOW }
  );
  assert.deepEqual(deleted.deletedIds.resources, ['resource-extra']);
});

test('25i legacy format 第二次读取不会重复加入 new seed entry', () => {
  const seed = makeSeed();
  const first = migrateKnowledge(
    JSON.stringify(makeLegacy({ ...clone(seed), resources: [seed.resources[0]] })),
    seed,
    { now: NOW }
  );
  const second = migrateKnowledge(JSON.stringify(first.envelope), seed, { now: NOW });
  assert.equal(second.envelope.data.resources.filter((item) => item.id === 'resource-extra').length, 1);
  assert.equal(second.needsWrite, false);
});

test('25j legacy format new seed entry 合并结果通过正式 envelope 验证器', () => {
  const seed = makeSeed();
  const result = migrateKnowledge(
    JSON.stringify(makeLegacy({ ...clone(seed), cases: [seed.cases[0]] })),
    seed,
    { now: NOW }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(validateEnvelope(result.envelope), []);
});

test('25k 同 ID 药物保留用户修改并补入新种子的副作用字段', () => {
  const seed = makeSeed();
  const saved = upsertEntry(
    createEnvelope(seed),
    'drugs',
    { ...seed.drugs[0], name: '用户保留值' },
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.drugs[0].name = '种子默认值';
  nextSeed.drugs[0].sideEffects = '新种子副作用说明';
  const result = migrateKnowledge(
    JSON.stringify(saved),
    nextSeed,
    { now: NOW }
  );

  assert.equal(result.ok, true);
  assert.equal(result.needsWrite, true);
  assert.equal(result.envelope.data.drugs[0].name, '用户保留值');
  assert.equal(result.envelope.data.drugs[0].sideEffects, '新种子副作用说明');
});

test('25l schema v2 西酞普兰旧快照整体升级为当前种子内容', () => {
  const seed = makeSeed();
  seed.drugs[0].id = 'citalopram';
  seed.disorders[0].relatedDrugIds = seed.disorders[0].relatedDrugIds
    .map((id) => id === 'drug-core' ? 'citalopram' : id);
  seed.drugs[0].kinetics = '协作者更新的药代动力学';
  seed.drugs[0].contraindications = '协作者更新的禁忌与警示';
  seed.drugs[0].sideEffects = '协作者更新的详细副作用';

  const savedData = clone(seed);
  savedData.drugs[0].name = '用户保留的药物名称';
  savedData.drugs[0].kinetics = '经肝脏 CYP2C19、CYP3A4 和 CYP2D6 代谢，半衰期约 35 小时；老年、肝损害或 CYP2C19 抑制时暴露增加。';
  savedData.drugs[0].contraindications = '剂量依赖性 QT 间期延长是重要警示；先天性长 QT、心动过缓、低钾低镁或合并延长 QT 药物时需避免或严密监测。';
  savedData.drugs[0].sideEffects = '常见恶心、腹泻或消化不适、头痛、出汗、失眠或嗜睡，以及性欲下降、延迟射精或高潮困难。开始用药或调整剂量后，少数人会短暂感到焦虑或激越。';

  const result = migrateKnowledge(
    JSON.stringify(createEnvelope(savedData, {
      savedAt: NOW.toISOString(),
      schemaVersion: 2,
      seedVersion: 11
    })),
    seed,
    { now: NOW }
  );

  assert.equal(result.ok, true);
  assert.equal(result.envelope.seedVersion, 13);
  assert.equal(result.envelope.data.drugs[0].name, seed.drugs[0].name);
  assert.equal(result.envelope.data.drugs[0].kinetics, '协作者更新的药代动力学');
  assert.equal(result.envelope.data.drugs[0].contraindications, '协作者更新的禁忌与警示');
  assert.equal(result.envelope.data.drugs[0].sideEffects, '协作者更新的详细副作用');
});

test('25m 西酞普兰真正的本地自定义字段不会被种子升级覆盖', () => {
  const seed = makeSeed();
  seed.drugs[0].id = 'citalopram';
  seed.disorders[0].relatedDrugIds = seed.disorders[0].relatedDrugIds
    .map((id) => id === 'drug-core' ? 'citalopram' : id);
  seed.drugs[0].kinetics = '协作者更新的药代动力学';
  seed.drugs[0].contraindications = '协作者更新的禁忌与警示';
  seed.drugs[0].interactions = '协作者更新的联用信息';
  seed.drugs[0].sideEffects = '协作者更新的详细副作用';

  const savedItem = {
    ...seed.drugs[0],
    kinetics: '用户自定义药代',
    contraindications: '用户自定义警示',
    interactions: '用户自定义联用',
    sideEffects: '用户自定义副作用'
  };
  const savedEnvelope = upsertEntry(
    createEnvelope(seed, { seedVersion: 12 }),
    'drugs',
    savedItem,
    { now: NOW, seedData: seed }
  );

  const result = migrateKnowledge(
    JSON.stringify(savedEnvelope),
    seed,
    { now: NOW }
  );

  assert.equal(result.ok, true);
  assert.equal(result.envelope.data.drugs[0].kinetics, '用户自定义药代');
  assert.equal(result.envelope.data.drugs[0].contraindications, '用户自定义警示');
  assert.equal(result.envelope.data.drugs[0].interactions, '用户自定义联用');
  assert.equal(result.envelope.data.drugs[0].sideEffects, '用户自定义副作用');
});

test('25n 重设计版旧副作用文本升级为协作者完整西酞普兰资料', () => {
  const seed = cloneProjectSeed();
  const savedData = clone(seed);
  const seedDrug = seed.drugs.find((item) => item.id === 'citalopram');
  const savedDrug = savedData.drugs.find((item) => item.id === 'citalopram');

  savedDrug.kinetics = '经肝脏 CYP2C19、CYP3A4 和 CYP2D6 代谢，半衰期约 35 小时；老年、肝损害或 CYP2C19 抑制时暴露增加。';
  savedDrug.contraindications = '剂量依赖性 QT 间期延长是重要警示；先天性长 QT、心动过缓、低钾低镁或合并延长 QT 药物时需避免或严密监测。';
  savedDrug.sideEffects = drugSideEffectsById.citalopram;

  const result = migrateKnowledge(
    JSON.stringify(createEnvelope(savedData, {
      savedAt: NOW.toISOString(),
      seedVersion: 11
    })),
    seed,
    { now: NOW }
  );
  const migratedDrug = result.envelope.data.drugs
    .find((item) => item.id === 'citalopram');

  assert.equal(result.ok, true);
  assert.equal(migratedDrug.kinetics, seedDrug.kinetics);
  assert.equal(migratedDrug.contraindications, seedDrug.contraindications);
  assert.equal(migratedDrug.sideEffects, seedDrug.sideEffects);
});

test('25o 西酞普兰副作用标点修正会升级现有本地数据', () => {
  const seed = cloneProjectSeed();
  const savedData = clone(seed);
  const seedDrug = seed.drugs.find((item) => item.id === 'citalopram');
  const savedDrug = savedData.drugs.find((item) => item.id === 'citalopram');

  const legacySideEffects = drugSideEffectsById.citalopram;
  savedDrug.sideEffects = legacySideEffects.replace('严密监测；', '严密监测。；');
  assert.notEqual(savedDrug.sideEffects, legacySideEffects);
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(createEnvelope(savedData, { savedAt: NOW.toISOString() }))
  ]]);
  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'citalopram').sideEffects, seedDrug.sideEffects);
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25p 西酞普兰和艾司西酞普兰旧版联用文本会升级为当前内容', () => {
  const seed = cloneProjectSeed();
  const savedData = clone(seed);
  const legacySsriInteractions = '与 MAOI、亚甲蓝、部分 5-HT 能药物合用可能增加血清素综合征风险；与 NSAID、阿司匹林、抗凝或抗血小板药物合用需关注出血风险。';
  const citalopram = savedData.drugs.find((item) => item.id === 'citalopram');
  const escitalopram = savedData.drugs.find((item) => item.id === 'escitalopram');

  citalopram.interactions = legacySsriInteractions;
  escitalopram.interactions = legacySsriInteractions;
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(createEnvelope(savedData, { savedAt: NOW.toISOString() }))
  ]]);
  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'citalopram').interactions, seed.drugs.find((item) => item.id === 'citalopram').interactions);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'escitalopram').interactions, seed.drugs.find((item) => item.id === 'escitalopram').interactions);
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25q 艾司西酞普兰自定义联用文本不会被种子升级覆盖', () => {
  const seed = cloneProjectSeed();
  const seedDrug = seed.drugs.find((item) => item.id === 'escitalopram');
  const savedEnvelope = upsertEntry(
    createEnvelope(seed),
    'drugs',
    { ...seedDrug, interactions: '用户自定义联用' },
    { now: NOW, seedData: seed }
  );
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(savedEnvelope)
  ]]);
  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'escitalopram').interactions, '用户自定义联用');
  assert.equal(result.backupKey, null);
});

test('25r 艾司西酞普兰旧版默认副作用会升级为当前内容', () => {
  const seed = cloneProjectSeed();
  const savedData = clone(seed);
  const savedDrug = savedData.drugs.find((item) => item.id === 'escitalopram');

  savedDrug.sideEffects = '常见恶心、腹泻或消化不适、头痛、出汗、失眠或嗜睡，以及性欲下降、延迟射精或高潮困难。开始用药或调整剂量后，少数人会短暂感到焦虑或激越。';
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(createEnvelope(savedData, {
      savedAt: NOW.toISOString(),
      seedVersion: 12
    }))
  ]]);
  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.seedVersion, 13);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'escitalopram').sideEffects, '同西酞普兰');
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25s 艾司西酞普兰自定义副作用不会被种子升级覆盖', () => {
  const seed = cloneProjectSeed();
  const seedDrug = seed.drugs.find((item) => item.id === 'escitalopram');
  const savedEnvelope = upsertEntry(
    createEnvelope(seed, { seedVersion: 12 }),
    'drugs',
    { ...seedDrug, sideEffects: '用户自定义副作用' },
    { now: NOW, seedData: seed }
  );
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(savedEnvelope)
  ]]);
  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.seedVersion, 13);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'escitalopram').sideEffects, '用户自定义副作用');
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25t schema v2 艾司西酞普兰旧 action 自动同步当前 handbookDrugs', () => {
  const seed = cloneProjectSeed();
  const savedData = clone(seed);
  const seedDrug = seed.drugs.find((item) => item.id === 'escitalopram');
  const savedDrug = savedData.drugs.find((item) => item.id === 'escitalopram');
  savedDrug.action = '旧版本地药物作用';
  const storage = new MemoryStorage([[
    STORAGE_KEY,
    JSON.stringify(createEnvelope(savedData, {
      schemaVersion: 2,
      seedVersion: 12,
      savedAt: NOW.toISOString()
    }))
  ]]);

  const result = readKnowledge(storage, seed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.data.drugs.find((item) => item.id === 'escitalopram').action, seedDrug.action);
  assert.match(seedDrug.action, /同效果摄入剂量更低/);
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25u 未提升种子版本时内置药物代码修改仍会自动同步', () => {
  const seed = makeSeed();
  const nextSeed = clone(seed);
  nextSeed.drugs[0].name = '代码更新名称';
  nextSeed.drugs[0].sideEffects = '代码新增副作用字段';
  const result = readKnowledge(currentStorage(seed), nextSeed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(result.envelope.seedVersion, 13);
  assert.equal(result.envelope.data.drugs[0].name, '代码更新名称');
  assert.equal(result.envelope.data.drugs[0].sideEffects, '代码新增副作用字段');
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
});

test('25v 内置药物代码删除字段会从浏览器数据同步删除', () => {
  const seed = makeSeed();
  seed.drugs[0].legacyNote = '待从代码删除';
  const nextSeed = clone(seed);
  delete nextSeed.drugs[0].legacyNote;
  const result = readKnowledge(currentStorage(seed), nextSeed, { now: NOW });

  assert.equal(result.error, null);
  assert.equal(Object.hasOwn(result.envelope.data.drugs[0], 'legacyNote'), false);
});

test('25w 删除内置药物会同步移除且不会误删本地新增药物', () => {
  const seed = makeSeed();
  seed.disorders[0].relatedDrugIds.push('drug-extra');
  const withCustom = upsertEntry(
    createEnvelope(seed),
    'drugs',
    customEntry('drugs'),
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.drugs = nextSeed.drugs.filter((item) => item.id !== 'drug-extra');
  const result = migrateKnowledge(JSON.stringify(withCustom), nextSeed, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.data.drugs.some((item) => item.id === 'drug-extra'), false);
  assert.equal(result.envelope.data.drugs.some((item) => item.id === 'drug-custom'), true);
  assert.equal(result.envelope.data.disorders[0].relatedDrugIds.includes('drug-extra'), false);
});

test('25x 编辑器只覆盖实际修改字段，其他字段继续跟随代码', () => {
  const seed = makeSeed();
  const edited = upsertEntry(
    createEnvelope(seed),
    'drugs',
    { ...seed.drugs[0], name: '本地名称' },
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.drugs[0].name = '代码名称';
  nextSeed.drugs[0].source = '代码更新来源';
  const result = migrateKnowledge(JSON.stringify(edited), nextSeed, { now: NOW });

  assert.deepEqual(edited.localOverrides.drugs, { 'drug-core': ['name'] });
  assert.equal(result.envelope.data.drugs[0].name, '本地名称');
  assert.equal(result.envelope.data.drugs[0].source, '代码更新来源');
});

test('25y 编辑字段恢复为代码值后会清除本地覆盖标记', () => {
  const seed = makeSeed();
  const edited = upsertEntry(
    createEnvelope(seed),
    'drugs',
    { ...seed.drugs[0], name: '本地名称' },
    { now: NOW, seedData: seed }
  );
  const restored = upsertEntry(
    edited,
    'drugs',
    seed.drugs[0],
    { now: NOW, seedData: seed }
  );

  assert.deepEqual(restored.localOverrides.drugs, {});
});

for (const [type, field] of [
  ['disorders', 'summary'],
  ['cases', 'summary']
]) {
  test(`25z ${type} 内置字段修改和新增无需提升种子版本即可同步`, () => {
    const seed = makeSeed();
    const nextSeed = clone(seed);
    nextSeed[type][0][field] = `${type} 代码更新内容`;
    nextSeed[type][0].codeAddedNote = `${type} 代码新增字段`;

    const result = readKnowledge(currentStorage(seed), nextSeed, { now: NOW });

    assert.equal(result.error, null);
    assert.equal(result.envelope.data[type][0][field], `${type} 代码更新内容`);
    assert.equal(result.envelope.data[type][0].codeAddedNote, `${type} 代码新增字段`);
    assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
  });

  test(`25za ${type} 代码删除字段会从浏览器数据同步删除`, () => {
    const seed = makeSeed();
    seed[type][0].legacyNote = `${type} 待删除字段`;
    const nextSeed = clone(seed);
    delete nextSeed[type][0].legacyNote;

    const result = readKnowledge(currentStorage(seed), nextSeed, { now: NOW });

    assert.equal(result.error, null);
    assert.equal(Object.hasOwn(result.envelope.data[type][0], 'legacyNote'), false);
  });

  test(`25zb ${type} 本地编辑字段保留，未编辑字段继续跟随代码`, () => {
    const seed = makeSeed();
    const edited = upsertEntry(
      createEnvelope(seed),
      type,
      { ...seed[type][0], [field]: `${type} 本地内容` },
      { now: NOW, seedData: seed }
    );
    const nextSeed = clone(seed);
    nextSeed[type][0][field] = `${type} 代码冲突内容`;
    nextSeed[type][0].source = `${type} 代码更新来源`;

    const result = migrateKnowledge(JSON.stringify(edited), nextSeed, { now: NOW });

    assert.deepEqual(edited.localOverrides[type], {
      [seed[type][0].id]: [field]
    });
    assert.equal(result.envelope.data[type][0][field], `${type} 本地内容`);
    assert.equal(result.envelope.data[type][0].source, `${type} 代码更新来源`);
  });

  test(`25zc ${type} 编辑字段恢复代码值后清除覆盖标记`, () => {
    const seed = makeSeed();
    const edited = upsertEntry(
      createEnvelope(seed),
      type,
      { ...seed[type][0], [field]: `${type} 本地内容` },
      { now: NOW, seedData: seed }
    );
    const restored = upsertEntry(
      edited,
      type,
      seed[type][0],
      { now: NOW, seedData: seed }
    );

    assert.deepEqual(restored.localOverrides[type], {});
  });
}

test('25zd 代码删除内置案例会同步移除且保留本地新增案例', () => {
  const seed = makeSeed();
  const withCustom = upsertEntry(
    createEnvelope(seed),
    'cases',
    customEntry('cases'),
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.cases = nextSeed.cases.filter((item) => item.id !== 'case-extra');

  const result = migrateKnowledge(JSON.stringify(withCustom), nextSeed, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.data.cases.some((item) => item.id === 'case-extra'), false);
  assert.equal(result.envelope.data.cases.some((item) => item.id === 'case-custom'), true);
});

test('25ze 代码删除无案例依赖的内置疾病会同步移除且保留本地新增疾病', () => {
  const seed = makeSeed();
  const withCustom = upsertEntry(
    createEnvelope(seed),
    'disorders',
    customEntry('disorders'),
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.disorders = nextSeed.disorders.filter((item) => item.id !== 'disorder-extra');

  const result = migrateKnowledge(JSON.stringify(withCustom), nextSeed, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.data.disorders.some((item) => item.id === 'disorder-extra'), false);
  assert.equal(result.envelope.data.disorders.some((item) => item.id === 'disorder-custom'), true);
});

test('25zf 代码同时删除内置疾病及其案例时两者都会同步移除', () => {
  const seed = makeSeed();
  const nextSeed = clone(seed);
  nextSeed.disorders = nextSeed.disorders.filter((item) => item.id !== 'disorder-core');
  nextSeed.cases = nextSeed.cases.filter((item) => item.disorderId !== 'disorder-core');

  const result = migrateKnowledge(
    JSON.stringify(createEnvelope(seed)),
    nextSeed,
    { now: NOW }
  );

  assert.equal(result.ok, true);
  assert.equal(result.envelope.data.disorders.some((item) => item.id === 'disorder-core'), false);
  assert.equal(result.envelope.data.cases.some((item) => item.disorderId === 'disorder-core'), false);
});

test('25zg 本地案例仍引用已从代码删除的疾病时暂时保留该疾病', () => {
  const seed = makeSeed();
  const customCase = {
    ...customEntry('cases'),
    disorderId: 'disorder-extra'
  };
  const withCustomCase = upsertEntry(
    createEnvelope(seed),
    'cases',
    customCase,
    { now: NOW, seedData: seed }
  );
  const nextSeed = clone(seed);
  nextSeed.disorders = nextSeed.disorders.filter((item) => item.id !== 'disorder-extra');

  const retained = migrateKnowledge(JSON.stringify(withCustomCase), nextSeed, { now: NOW });

  assert.equal(retained.ok, true);
  assert.equal(retained.envelope.data.disorders.some((item) => item.id === 'disorder-extra'), true);
  assert.equal(retained.envelope.seedIds.disorders.includes('disorder-extra'), true);

  const withoutCustomCase = deleteEntry(
    retained.envelope,
    'cases',
    customCase.id,
    nextSeed,
    { now: NOW }
  );
  const released = migrateKnowledge(JSON.stringify(withoutCustomCase), nextSeed, { now: NOW });

  assert.equal(released.ok, true);
  assert.equal(released.envelope.data.disorders.some((item) => item.id === 'disorder-extra'), false);
});

test('25zh schema v3 药物覆盖迁移到通用覆盖，疾病与案例旧快照同步代码', () => {
  const seed = makeSeed();
  const savedData = clone(seed);
  savedData.drugs[0].name = 'schema v3 本地药物名称';
  savedData.disorders[0].summary = 'schema v3 旧疾病摘要';
  savedData.cases[0].summary = 'schema v3 旧案例摘要';
  const schemaV3 = {
    schemaVersion: 3,
    seedVersion: 13,
    savedAt: NOW.toISOString(),
    data: savedData,
    deletedIds: {
      drugs: [],
      disorders: [],
      cases: [],
      resources: []
    },
    localDrugOverrides: { 'drug-core': ['name'] },
    seedDrugIds: seed.drugs.map((item) => item.id)
  };
  const nextSeed = clone(seed);
  nextSeed.drugs[0].name = 'schema v4 代码药物名称';
  nextSeed.disorders[0].summary = 'schema v4 代码疾病摘要';
  nextSeed.cases[0].summary = 'schema v4 代码案例摘要';

  const result = migrateKnowledge(JSON.stringify(schemaV3), nextSeed, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.schemaVersion, 4);
  assert.equal(result.envelope.data.drugs[0].name, 'schema v3 本地药物名称');
  assert.equal(result.envelope.data.disorders[0].summary, 'schema v4 代码疾病摘要');
  assert.equal(result.envelope.data.cases[0].summary, 'schema v4 代码案例摘要');
  assert.deepEqual(result.envelope.localOverrides.drugs, { 'drug-core': ['name'] });
  assert.deepEqual(result.envelope.localOverrides.disorders, {});
  assert.deepEqual(result.envelope.localOverrides.cases, {});
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

test('27b 当前结构缺少来源元数据时停止迁移并保留原始主数据', () => {
  const malformed = createEnvelope(makeSeed());
  delete malformed.localOverrides;
  const raw = JSON.stringify(malformed);
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);

  const result = readKnowledge(storage, makeSeed(), { now: NOW });

  assert.equal(result.error?.code, 'migration-failed');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.ok(result.backupKey.startsWith(BACKUP_KEY_PREFIX));
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
  const backupsBefore = listBackups(storage);
  assert.throws(
    () => restoreBackup(storage, key, makeSeed(), { now: NOW }),
    { code: 'backup-invalid' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
  assert.deepEqual(listBackups(storage), backupsBefore);
});

test('31b 无效 envelope 备份恢复失败且不改变主存储或备份列表', () => {
  const storage = currentStorage();
  const rawBefore = storage.getItem(STORAGE_KEY);
  const key = createBackup(storage, JSON.stringify({
    schemaVersion: 2,
    seedVersion: 11,
    savedAt: NOW.toISOString(),
    data: { drugs: [], disorders: [], cases: [], resources: 'invalid' },
    deletedIds: { drugs: [], disorders: [], cases: [], resources: [] }
  }), { now: new Date('2026-07-28T00:00:00.000Z') });
  const backupsBefore = listBackups(storage);
  assert.throws(
    () => restoreBackup(storage, key, makeSeed(), { now: NOW }),
    { code: 'backup-invalid' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
  assert.deepEqual(listBackups(storage), backupsBefore);
});

test('31c 已有五份备份时无效恢复不会新增、淘汰或重排备份', () => {
  const storage = currentStorage();
  let invalidKey;
  for (let index = 0; index < BACKUP_RETENTION_LIMIT; index += 1) {
    const rawValue = index === 0 ? '{broken' : JSON.stringify(createEnvelope(makeSeed()));
    const key = createBackup(storage, rawValue, {
      now: new Date(Date.parse('2026-07-28T00:00:00.000Z') + index * 1000)
    });
    if (index === 0) invalidKey = key;
  }
  const rawBefore = storage.getItem(STORAGE_KEY);
  const backupsBefore = listBackups(storage);
  assert.throws(
    () => restoreBackup(storage, invalidKey, makeSeed(), { now: NOW }),
    { code: 'backup-invalid' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
  assert.deepEqual(listBackups(storage), backupsBefore);
  assert.equal(listBackups(storage).length, BACKUP_RETENTION_LIMIT);
});

test('31d 当前状态备份创建失败时不写入有效恢复目标', () => {
  const seed = makeSeed();
  const current = upsertEntry(
    createEnvelope(seed),
    'resources',
    customEntry('resources'),
    { now: NOW }
  );
  const storage = new ControlledStorage([[STORAGE_KEY, JSON.stringify(current)]]);
  const targetKey = createBackup(
    storage,
    JSON.stringify(createEnvelope(seed, { savedAt: '2026-07-28T00:00:00.000Z' })),
    { now: new Date('2026-07-28T00:00:00.000Z') }
  );
  const rawBefore = storage.getItem(STORAGE_KEY);
  storage.failBackupWrites = true;
  assert.throws(
    () => restoreBackup(storage, targetKey, seed, { now: NOW }),
    { code: 'backup-write-failed' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
});

test('31e 恢复目标写入失败时主存储不变且恢复前备份仍存在', () => {
  const seed = makeSeed();
  const current = upsertEntry(
    createEnvelope(seed),
    'resources',
    customEntry('resources'),
    { now: NOW }
  );
  const rawBefore = JSON.stringify(current);
  const storage = new ControlledStorage([[STORAGE_KEY, rawBefore]]);
  const targetKey = createBackup(
    storage,
    JSON.stringify(createEnvelope(seed, { savedAt: '2026-07-28T00:00:00.000Z' })),
    { now: new Date('2026-07-28T00:00:00.000Z') }
  );
  storage.failPrimaryWrites = true;
  assert.throws(
    () => restoreBackup(storage, targetKey, seed, { now: NOW }),
    { code: 'storage-write-failed' }
  );
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
  assert.ok(listBackups(storage).some((backup) => storage.getItem(backup.key) === rawBefore));
});

test('32 合法 envelope 可导出', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.deepEqual(exported.data, makeSeed());
});

test('33 导出包含固定格式标识', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.equal(exported.format, BACKUP_FORMAT);
});

test('34 导出包含结构和种子版本', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.equal(exported.schemaVersion, 4);
  assert.equal(exported.seedVersion, 13);
});

test('35 导出包含 ISO 时间', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.equal(exported.exportedAt, NOW.toISOString());
});

test('36 导出不包含搜索查询', () => {
  const text = serializeKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.ok(!text.includes('searchQuery'));
  assert.ok(!text.includes('最近总是早醒'));
});

test('37 导出不包含浏览器和身份信息', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  assert.deepEqual(Object.keys(exported).sort(), [
    'data',
    'deletedIds',
    'exportedAt',
    'format',
    'localOverrides',
    'schemaVersion',
    'seedIds',
    'seedVersion'
  ]);
});

test('38 无效数据不能导出为合法备份', () => {
  const invalid = createEnvelope(makeSeed());
  invalid.cases = [];
  invalid.data.resources[0].url = 'not-a-url';
  assert.throws(
    () => createKnowledgeExport(invalid, { now: NOW }),
    { code: 'validation-failed' }
  );
});

test('39 导出后重新导入可往返保持数据与删除记录', () => {
  const seed = makeSeed();
  const source = deleteEntry(
    upsertEntry(createEnvelope(seed), 'resources', customEntry('resources'), { now: NOW }),
    'cases',
    'case-extra',
    seed,
    { now: NOW }
  );
  const parsed = parseKnowledgeImport(
    serializeKnowledgeExport(source, { now: NOW }),
    { seedData: seed, now: NOW }
  );
  assert.deepEqual(parsed.envelope.data, source.data);
  assert.deepEqual(parsed.envelope.deletedIds, source.deletedIds);
  assert.deepEqual(parsed.envelope.localOverrides, source.localOverrides);
  assert.deepEqual(parsed.envelope.seedIds, source.seedIds);
});

test('39b schema v3 导出可迁移导入并保留药物字段覆盖', () => {
  const seed = makeSeed();
  const savedData = clone(seed);
  savedData.drugs[0].name = '旧备份本地药物名称';
  savedData.disorders[0].summary = '旧备份疾病摘要';
  const schemaV3Export = {
    format: BACKUP_FORMAT,
    schemaVersion: 3,
    seedVersion: 13,
    exportedAt: NOW.toISOString(),
    data: savedData,
    deletedIds: {
      drugs: [],
      disorders: [],
      cases: [],
      resources: []
    },
    localDrugOverrides: { 'drug-core': ['name'] },
    seedDrugIds: seed.drugs.map((item) => item.id)
  };

  const parsed = parseKnowledgeImport(JSON.stringify(schemaV3Export), {
    seedData: seed,
    now: NOW
  });

  assert.equal(parsed.envelope.schemaVersion, 4);
  assert.equal(parsed.envelope.data.drugs[0].name, '旧备份本地药物名称');
  assert.equal(parsed.envelope.data.disorders[0].summary, seed.disorders[0].summary);
  assert.deepEqual(parsed.envelope.localOverrides.drugs, { 'drug-core': ['name'] });
});

test('40 非文本文件内容被拒绝', () => {
  assert.throws(
    () => parseKnowledgeImport(new Uint8Array([1, 2, 3]), { seedData: makeSeed() }),
    { code: 'import-file-invalid' }
  );
});

test('41 无效 JSON 被拒绝', () => {
  assert.throws(
    () => parseKnowledgeImport('{invalid', { seedData: makeSeed() }),
    { code: 'import-json-invalid' }
  );
});

test('42 超过 5 MB 的文件被拒绝', () => {
  assert.throws(
    () => parseKnowledgeImport('{}', {
      size: MAX_IMPORT_BYTES + 1,
      seedData: makeSeed()
    }),
    { code: 'import-file-too-large' }
  );
});

test('42b 实际文本超过上限时不能用虚假 size 绕过', () => {
  const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 1);
  assert.throws(
    () => parseKnowledgeImport(oversized, {
      size: 1,
      seedData: makeSeed()
    }),
    { code: 'import-file-too-large' }
  );
});

test('43 缺少格式标识的文件被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  delete exported.format;
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'import-format-invalid' }
  );
});

test('44 未知未来版本被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.schemaVersion = 99;
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'import-version-future' }
  );
});

test('44b schema v4 缺少本地覆盖记录的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  delete exported.localOverrides;
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'import-overrides-invalid' }
  );
});

test('44c schema v4 内置词条 ID 记录无效的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.seedIds.drugs = ['drug-core', 'drug-core'];
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'import-seed-ids-invalid' }
  );
});

test('45 含重复 ID 的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.data.drugs.push(clone(exported.data.drugs[0]));
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'validation-failed' }
  );
});

test('46 含无效交叉引用的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.data.cases[0].disorderId = 'missing';
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'validation-failed' }
  );
});

test('47 含私有目录路径的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.data.resources[0].url = 'work/private-notes.txt';
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'validation-failed' }
  );
});

test('48 含 file URL 的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.data.resources[0].url = 'file:///Users/example/private.json';
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'validation-failed' }
  );
});

test('49 含 localhost URL 的导入被拒绝', () => {
  const exported = createKnowledgeExport(createEnvelope(makeSeed()), { now: NOW });
  exported.data.resources[0].url = 'http://localhost:4173/private';
  assert.throws(
    () => parseKnowledgeImport(JSON.stringify(exported), { seedData: makeSeed() }),
    { code: 'validation-failed' }
  );
});

test('50 导入解析失败不改变当前主数据', () => {
  const storage = currentStorage();
  const rawBefore = storage.getItem(STORAGE_KEY);
  assert.throws(() => parseKnowledgeImport('{broken', { seedData: makeSeed() }));
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
});

test('51 导入成功写入前备份当前数据', () => {
  const seed = makeSeed();
  const storage = currentStorage(seed);
  const rawBefore = storage.getItem(STORAGE_KEY);
  const imported = upsertEntry(
    createEnvelope(seed),
    'resources',
    customEntry('resources'),
    { now: NOW }
  );
  const result = applyKnowledgeImport(storage, imported, { now: NOW });
  assert.equal(storage.getItem(result.backupKey), rawBefore);
});

test('52 导入成功后主状态更新并可生成摘要', () => {
  const seed = makeSeed();
  const storage = currentStorage(seed);
  const imported = upsertEntry(
    createEnvelope(seed),
    'resources',
    customEntry('resources'),
    { now: NOW }
  );
  const result = applyKnowledgeImport(storage, imported, { now: NOW });
  const summary = summarizeKnowledgeImport(result.envelope, createEnvelope(seed));
  assert.deepEqual(stored(storage), imported);
  assert.equal(summary.added, 1);
  assert.equal(summary.counts.resources, 3);
});

test('53 用户取消导入确认时不写入', () => {
  const seed = makeSeed();
  const storage = currentStorage(seed);
  const rawBefore = storage.getItem(STORAGE_KEY);
  const result = applyKnowledgeImport(storage, createEnvelope(seed), {
    confirmed: false,
    now: NOW
  });
  assert.equal(result.applied, false);
  assert.equal(storage.getItem(STORAGE_KEY), rawBefore);
});

test.after(() => {
  const storage = currentStorage();
  assert.doesNotThrow(() => writeKnowledge(storage, createEnvelope(makeSeed())));
});
