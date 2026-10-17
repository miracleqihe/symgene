import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/disorderProfiles.json' with { type: 'json' };
import { disorderFor, disorderFields, attributedDisorderBody } from '../src/content/disorders.js';
import { auditReadingProfiles } from '../src/content/readingProfileAudit.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { teachingPrompt } from '../src/content/reading.js';

test('every published disease supplement is traceable to EPUB, Chinese references and each point', () => {
  const items = knowledge.disorders.filter(item => profiles[item.id]);
  const report = auditReadingProfiles(items, profiles, 'disorders');
  assert.deepEqual(report.unknownProfileIds, []);
  for (const entry of report.entries) assert.deepEqual(entry.problems, [], entry.id);
});

test('disease page content, downloads and portable prompts share supplements without overwriting local edits', async () => {
  for (const item of knowledge.disorders.filter(item => profiles[item.id])) {
    const display = disorderFor(item);
    const prompt = teachingPrompt('disorders', item, knowledge);
    const material = await readFile(new URL(`../public/teaching/disorders/${item.id}.md`, import.meta.url), 'utf8');
    assert.equal(display.id, item.id);
    assert.equal(display.name, item.name);
    assert.deepEqual(display.relatedDrugIds, item.relatedDrugIds);
    for (const section of attributedDisorderBody(item)) for (const point of medicalPoints(section.text)) {
      assert.ok(prompt.includes(`- ${point}`), `${item.id}: prompt point`);
      assert.ok(material.includes(point), `${item.id}: material point`);
    }
    for (const [field] of disorderFields) {
      const editedValue = Array.isArray(display[field]) ? [] : '';
      const edited = { ...item, [field]: editedValue };
      const result = disorderFor(edited);
      assert.deepEqual(result[field], editedValue);
      assert.equal(result.fieldSources[field], undefined);
      assert.equal(result.fieldEvidence[field], undefined);
    }
  }
  const newLocalItem = { id: 'example-local-disorder', name: '用户创建的虚构示例', symptoms: [] };
  assert.equal(disorderFor(newLocalItem), newLocalItem);
});
