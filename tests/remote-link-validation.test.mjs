import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRemoteUrl,
  classifyRemoteResult,
  reportRemoteLinks
} from '../scripts/check-links-remote.mjs';

function response(status, headers = {}) {
  return new Response(null, { status, headers });
}

function outputRecorder() {
  const messages = { log: [], warn: [], error: [] };
  return {
    messages,
    output: Object.fromEntries(Object.keys(messages).map((level) => [
      level,
      (message) => messages[level].push(message)
    ]))
  };
}

test('精确 NHC 首页的 412 + WZWS WAF 签名分类为 access-blocked', async () => {
  const url = 'https://www.nhc.gov.cn/';
  const result = await checkRemoteUrl(url, {
    fetchImpl: async () => response(412, { 'WZWS-RAY': '12345-w-waf-test' })
  });
  assert.equal(classifyRemoteResult(url, result), 'access-blocked');
});

test('NHC 412 缺少已确认 WAF 签名仍然失败', async () => {
  const url = 'https://www.nhc.gov.cn/';
  const result = await checkRemoteUrl(url, {
    fetchImpl: async () => response(412)
  });
  assert.equal(classifyRemoteResult(url, result), 'failed');
});

test('其它站点即使返回相同 412 WAF header 也不会进入例外', async () => {
  const url = 'https://example.com/';
  const result = await checkRemoteUrl(url, {
    fetchImpl: async () => response(412, { 'WZWS-RAY': '12345-w-waf-test' })
  });
  assert.equal(classifyRemoteResult(url, result), 'failed');
});

test('404 和 5xx 保持失败，不被 access-blocked 规则吞掉', () => {
  for (const status of [404, 500, 503]) {
    assert.equal(classifyRemoteResult('https://www.nhc.gov.cn/', {
      status,
      finalUrl: 'https://www.nhc.gov.cn/',
      wafRay: '12345-w-waf-test'
    }), 'failed');
  }
});

test('报告将已确认 WAF challenge 记为明确 warning，真实坏链仍使任务失败', async () => {
  const data = {
    resources: [
      { url: 'https://www.nhc.gov.cn/' },
      { url: 'https://example.com/missing' }
    ]
  };
  const { messages, output } = outputRecorder();
  const status = await reportRemoteLinks(data, output, {
    fetchImpl: async (url) => url === 'https://www.nhc.gov.cn/'
      ? response(412, { 'WZWS-RAY': '12345-w-waf-test' })
      : response(404)
  });

  assert.equal(status, 1);
  assert.ok(messages.warn.some((message) => message.startsWith('ACCESS-BLOCKED 412')));
  assert.ok(messages.error.some((message) => message.startsWith('FAIL 404')));
});

test('只有精确 WAF challenge 时报告通过但不会伪装成 reachable', async () => {
  const data = { resources: [{ url: 'https://www.nhc.gov.cn/' }] };
  const { messages, output } = outputRecorder();
  const status = await reportRemoteLinks(data, output, {
    fetchImpl: async () => response(412, { 'WZWS-RAY': '12345-w-waf-test' })
  });

  assert.equal(status, 0);
  assert.ok(messages.warn.some((message) => message.includes('confirmed WAF challenge')));
  assert.ok(messages.log.some((message) => message.includes('0/1 reachable; 1 access-blocked')));
});
