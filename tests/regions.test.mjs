import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { regionalRules } from '../src/content/regions.js';
import { readingFor, teachingPrompt } from '../src/content/reading.js';
import { sourceReadingLink } from '../src/content/professional.js';
import { seedData } from '../src/data.js';

test('all entry prompts and the portable Skill retain Chinese jurisdiction boundaries', async () => {
  const skill = await readFile(new URL('../public/skills/mental-health-reading/SKILL.md', import.meta.url), 'utf8');
  for (const type of ['drugs', 'disorders', 'cases']) for (const item of seedData[type]) {
    const prompt = teachingPrompt(type, item, seedData);
    for (const rule of regionalRules) {
      assert.ok(prompt.includes(rule.text), `${type}/${item.id}: ${rule.id}`);
      assert.ok(skill.includes(rule.text), `Skill: ${rule.id}`);
    }
    assert.ok(readingFor(type, item).links[0].region.startsWith('中国大陆'), `${type}/${item.id}: domestic reading first`);
  }
});

test('Chinese labels are not mislabelled as English and access dates are not invented revision dates', () => {
  const source = { id: 'example-cn-label', kind: 'label', title: '虚构测试说明书', url: 'https://example.org/label',
    region: '中国大陆', language: 'zh-CN', checkedAt: '2026-10-11' };
  const link = sourceReadingLink(source);
  assert.equal(link.region, '中国大陆 · 中文');
  assert.doesNotMatch(link.note, /2026-10-11|undefined|修订日期/);
  assert.match(sourceReadingLink({ ...source, updated: '2026-03-01' }).note, /说明书修订日期：2026-03-01/);
  assert.equal(sourceReadingLink({ ...source, language: 'en', region: '美国' }).region, '美国 · 英文');
});
