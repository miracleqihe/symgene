import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { communicationRules } from '../src/content/communication.js';
import { teachingPrompt } from '../src/content/reading.js';
import { seedData } from '../src/data.js';

test('all portable entry prompts and the reading Skill carry the same communication rules', async () => {
  const skill = await readFile(new URL('../public/skills/mental-health-reading/SKILL.md', import.meta.url), 'utf8');
  assert.equal(new Set(communicationRules.map(rule => rule.id)).size, communicationRules.length);
  for (const type of ['drugs', 'disorders', 'cases']) {
    for (const item of seedData[type]) {
      const prompt = teachingPrompt(type, item, seedData);
      for (const rule of communicationRules) {
        assert.ok(prompt.includes(rule.text), `${type}/${item.id}: ${rule.id}`);
        assert.ok(skill.includes(rule.text), `Skill: ${rule.id}`);
      }
    }
  }
});
