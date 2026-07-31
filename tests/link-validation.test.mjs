import assert from 'node:assert/strict';
import test from 'node:test';
import { checkLinks } from '../scripts/check-links.mjs';
import { clone, makeSeed } from './helpers/storage-fixtures.mjs';

test('当前静态资源链接通过检查', async () => {
  const { cloneSeed } = await import('../src/data.js');
  assert.deepEqual(checkLinks(cloneSeed()).errors, []);
});

test('重复资源 URL 被拒绝', () => {
  const data = makeSeed();
  data.resources[1].url = data.resources[0].url;
  assert.ok(checkLinks(data).errors.some((error) => error.message.includes('重复 URL')));
});

test('本地地址和非 HTTP 协议被拒绝', () => {
  const local = makeSeed();
  local.resources[0].url = 'http://localhost:4173/private';
  const protocol = clone(makeSeed());
  protocol.resources[0].url = 'ftp://example.com/private';
  assert.ok(checkLinks(local).errors.length > 0);
  assert.ok(checkLinks(protocol).errors.length > 0);
});

test('资源 URL 必须是非空字符串', () => {
  const data = makeSeed();
  data.resources[0].url = '';
  assert.ok(checkLinks(data).errors.some((error) => error.id === 'resource-core'));
});
