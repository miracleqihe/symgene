import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneSeed } from '../src/data.js';
import { reportValidation, validateData } from '../scripts/validate-data.mjs';

function makeValidData() {
  return {
    drugs: [
      { id: 'sertraline', name: '舍曲林', className: 'SSRI', sideEffects: '恶心、头痛等。', source: '公开药物资料' }
    ],
    disorders: [
      {
        id: 'depression',
        name: '抑郁障碍',
        category: '心境障碍',
        summary: '持续低落并伴随功能变化。',
        source: '公开疾病资料',
        relatedDrugIds: ['sertraline']
      }
    ],
    cases: [
      {
        id: 'case-depression',
        disorderId: 'depression',
        title: '持续低落案例',
        summary: '用于说明评估思路。',
        source: '教学性合成案例'
      }
    ],
    resources: [
      {
        id: 'resource-example',
        title: '公开精神健康资源',
        url: 'https://example.com/mental-health'
      }
    ]
  };
}

function errorsFor(data, type, field) {
  return validateData(data).filter((error) =>
    error.type === type && error.field === field
  );
}

test('最小合法数据通过验证', () => {
  assert.deepEqual(validateData(makeValidData()), []);
});

test('当前正式完整数据通过验证', () => {
  assert.deepEqual(validateData(cloneSeed()), []);
});

test('顶层数组缺失时返回具体错误', () => {
  const data = makeValidData();
  delete data.resources;
  assert.deepEqual(errorsFor(data, 'resources', 'resources'), [{
    type: 'resources',
    id: '(collection)',
    field: 'resources',
    message: 'data.resources 必须是数组'
  }]);
});

test('顶层字段不是数组时返回具体错误', () => {
  const data = makeValidData();
  data.drugs = {};
  assert.equal(errorsFor(data, 'drugs', 'drugs').length, 1);
});

test('空 ID 被拒绝并包含数组索引', () => {
  const data = makeValidData();
  data.drugs[0].id = '';
  const [error] = errorsFor(data, 'drugs', 'id');
  assert.equal(error.id, '#0');
  assert.match(error.message, /drugs\[0\]/);
});

test('空白 ID 被拒绝', () => {
  const data = makeValidData();
  data.cases[0].id = '   ';
  assert.equal(errorsFor(data, 'cases', 'id').length, 1);
});

test('非字符串 ID 被拒绝', () => {
  const data = makeValidData();
  data.resources[0].id = 42;
  assert.equal(errorsFor(data, 'resources', 'id').length, 1);
});

for (const [label, type] of [
  ['药物', 'drugs'],
  ['疾病', 'disorders'],
  ['案例', 'cases'],
  ['资源', 'resources']
]) {
  test(`重复${label} ID 被拒绝`, () => {
    const data = makeValidData();
    data[type].push({ ...data[type][0] });
    const duplicateErrors = errorsFor(data, type, 'id');
    assert.equal(duplicateErrors.length, 1);
    assert.equal(duplicateErrors[0].id, data[type][0].id);
    assert.match(duplicateErrors[0].message, /同类型/);
  });
}

test('跨实体类型的相同 ID 不作为阻断错误', () => {
  const data = makeValidData();
  data.resources[0].id = 'sertraline';
  assert.deepEqual(validateData(data), []);
});

test('药物必填字段为空时失败', () => {
  const data = makeValidData();
  data.drugs[0].sideEffects = '';
  data.drugs[0].source = ' ';
  data.drugs[0].className = '';
  const errors = validateData(data);
  assert.ok(errors.some((error) => error.type === 'drugs' && error.field === 'sideEffects'));
  assert.ok(errors.some((error) => error.type === 'drugs' && error.field === 'source'));
  assert.ok(errors.some((error) => error.type === 'drugs' && error.field === 'className/categoryLabel'));
});

test('药物仅提供 categoryLabel 时仍满足分类必填规则', () => {
  const data = makeValidData();
  delete data.drugs[0].className;
  data.drugs[0].categoryLabel = 'SSRI';
  assert.deepEqual(validateData(data), []);
});

test('疾病必填字段为空时失败', () => {
  const data = makeValidData();
  data.disorders[0].summary = ' ';
  assert.equal(errorsFor(data, 'disorders', 'summary').length, 1);
});

test('案例必填字段为空时失败', () => {
  const data = makeValidData();
  data.cases[0].source = null;
  assert.equal(errorsFor(data, 'cases', 'source').length, 1);
});

test('资源必填字段为空时失败', () => {
  const data = makeValidData();
  data.resources[0].title = '';
  assert.equal(errorsFor(data, 'resources', 'title').length, 1);
});

test('案例引用不存在的疾病时失败', () => {
  const data = makeValidData();
  data.cases[0].disorderId = 'missing-disorder';
  const [error] = errorsFor(data, 'cases', 'disorderId');
  assert.equal(error.id, 'case-depression');
  assert.match(error.message, /missing-disorder/);
});

test('疾病引用不存在的药物时失败', () => {
  const data = makeValidData();
  data.disorders[0].relatedDrugIds = ['missing-drug'];
  const [error] = errorsFor(data, 'disorders', 'relatedDrugIds[0]');
  assert.equal(error.id, 'depression');
  assert.match(error.message, /missing-drug/);
});

test('relatedDrugIds 中的空字符串被拒绝', () => {
  const data = makeValidData();
  data.disorders[0].relatedDrugIds = [''];
  const [error] = errorsFor(data, 'disorders', 'relatedDrugIds[0]');
  assert.match(error.message, /非空字符串/);
});

for (const [label, url, expectedMessage] of [
  ['raw 私有目录', 'raw/private-notes.txt', /私有目录/],
  ['work 私有目录', 'work/extracted.txt', /私有目录/],
  ['tmp 私有目录', 'tmp/result.json', /私有目录/],
  ['Unix 本地绝对路径', '/Users/example/private.pdf', /本地绝对路径/],
  ['Windows 反斜杠绝对路径', 'C:\\Users\\example\\secret.txt', /本地绝对路径/],
  ['Windows 正斜杠绝对路径', 'D:/Users/example/private.pdf', /本地绝对路径/],
  ['UNC 网络路径', '\\\\server\\share\\private.txt', /UNC 网络路径/],
  ['file URL', 'file:///Users/example/private.pdf', /file:\/\//],
  ['localhost URL', 'http://localhost:4173/private', /localhost/],
  ['127.0.0.1 URL', 'http://127.0.0.1:4173/private', /127\.0\.0\.1/]
]) {
  test(`资源 URL 拒绝${label}`, () => {
    const data = makeValidData();
    data.resources[0].url = url;
    const urlErrors = errorsFor(data, 'resources', 'url');
    assert.equal(urlErrors.length, 1);
    assert.match(urlErrors[0].message, expectedMessage);
  });
}

test('合法 HTTPS URL 通过验证', () => {
  const data = makeValidData();
  data.resources[0].url = 'https://www.example.org/public/guide';
  assert.deepEqual(validateData(data), []);
});

test('资源 URL 必须是字符串', () => {
  const data = makeValidData();
  data.resources[0].url = null;
  const [error] = errorsFor(data, 'resources', 'url');
  assert.equal(error.message, '必须是字符串');
});

test('资源 URL 拒绝非 HTTP 协议', () => {
  const data = makeValidData();
  data.resources[0].url = 'ftp://example.com/private.txt';
  const [error] = errorsFor(data, 'resources', 'url');
  assert.match(error.message, /只允许 http: 或 https:/);
});

test('多个错误会在一次验证中同时返回', () => {
  const data = makeValidData();
  data.drugs[0].name = '';
  data.cases[0].disorderId = 'missing-disorder';
  data.resources[0].url = 'raw/private.txt';
  const errors = validateData(data);
  assert.ok(errors.length >= 3);
  assert.ok(errors.some((error) => error.type === 'drugs' && error.field === 'name'));
  assert.ok(errors.some((error) => error.type === 'cases' && error.field === 'disorderId'));
  assert.ok(errors.some((error) => error.type === 'resources' && error.field === 'url'));
});

test('命令行报告逻辑在无效数据时返回非零退出码', () => {
  const data = makeValidData();
  data.resources[0].url = 'file:///Users/example/private.pdf';
  const messages = [];
  const exitCode = reportValidation(data, {
    log: (message) => messages.push(message),
    error: (message) => messages.push(message)
  });
  assert.equal(exitCode, 1);
  assert.ok(messages.some((message) => message.includes('Data validation failed')));
  assert.ok(messages.some((message) => message.includes('resources[resource-example].url')));
});
