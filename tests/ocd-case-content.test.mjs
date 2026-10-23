import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/caseProfiles.json' with { type: 'json' };
import { caseFor, caseLinks, attributedCaseBody } from '../src/content/cases.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { teachingPrompt } from '../src/content/reading.js';

const base=knowledge.cases.find(item=>item.id==='case-ocd-01');
const profile=profiles['case-ocd-01'];
const points=field=>medicalPoints(profile.fields[field].text);

test('checking case separates fictional biography from Chinese assessment and retains its topic identity',()=>{
  const display=caseFor(base);
  assert.match(display.summary,/虚构教学情景/);
  assert.match(display.summary,/相似.*不足以确认/);
  assert.equal(display.id,base.id);
  assert.equal(display.title,base.title);
  assert.equal(display.disorderId,base.disorderId);
  assert.deepEqual(display.tags,base.tags);
  assert.doesNotMatch(display.functionImpact,/手部皮肤受损/);
  assert.equal(profile.sources.find(source=>source.id==='casebook-ocd').sourceRevision,
    '92300bb793dcdee40b08bd2f81c1a88f8d3ad7e6f689019582a3c20cca9574b7');
  assert.equal(profile.sources.find(source=>source.id==='nhc-ocd-2020').region,'中国大陆');
  assert.equal(profile.sources.find(source=>source.id==='nhc-ocd-2020').updated,'2020');
  assert.ok(profile.fields.summary.evidence[0].refs.some(ref=>profile.sources.find(source=>source.id===ref)?.kind==='fiction'));
});

test('ordinary checking and insight never become single-item diagnostic rules or waiting requirements',()=>{
  assert.match(points('differentialClues')[0],/检查次数.*不能.*诊断/);
  assert.match(profile.fields.timeline.text,/不必等到/);
  assert.match(profile.fields.assessmentFocus.text,/自知力/);
  assert.match(profile.fields.assessmentFocus.text,/因人而异/);
  assert.match(points('differentialClues')[2],/不能只凭|不能仅凭/);
  assert.match(points('differentialClues')[2],/不能单独.*诊断|不能仅凭.*确诊/);
});

test('unwanted harm thoughts are not equated with intent or treated as an assurance of safety',()=>{
  const point=points('differentialClues')[3];
  assert.match(point,/不能直接证明实施意图/);
  assert.match(point,/不能.*保证.*安全/);
  assert.match(point,/伤害意图或计划/);
  assert.match(point,/专业人员/);
  assert.ok(profile.fields.differentialClues.evidence[3].refs.includes('nice-ocd-cg31'));
});

test('ERP and family support retain trained care, gradual safe practice and participation without coercion',()=>{
  const treatment=points('safetyNote')[2];
  assert.match(treatment,/暴露与反应预防/);
  assert.match(treatment,/安全环境/);
  assert.match(treatment,/相应训练/);
  assert.match(treatment,/专业人员/);
  assert.match(treatment,/逐步/);
  assert.match(treatment,/内心仪式/);
  assert.match(treatment,/不能.*煤气.*现实危险.*练习/);
  const family=points('safetyNote')[4];
  assert.match(family,/逐步减少/);
  assert.match(family,/关心与实际帮助/);
  assert.match(family,/听取.*想法/);
  assert.match(family,/不突然.*强迫/);
});

test('checking-case safety advice differentiates timely care from immediate action and rejects safety promises',()=>{
  const risk=points('riskSignals');
  assert.match(risk[0],/及时.*医疗评估/);
  assert.match(risk[0],/立即.*当地急救|立即.*急诊/);
  assert.match(risk[1],/直接问/);
  assert.match(risk[2],/立即.*当地急救|立即.*急诊/);
  assert.match(risk[2],/陪伴/);
  assert.match(risk[2],/不.*完成症状记录/);
  assert.match(risk[2],/不靠.*保证.*结束评估/);
  const boundary=profile.sources.find(source=>source.id==='nimh-bssa-safety-boundary');
  assert.match(boundary.region,/仅采用/);
  assert.ok(profile.fields.riskSignals.evidence[2].refs.includes(boundary.id));
});

test('the portable case pack includes the accepted body and does not overwrite personal edits or empty fields',async()=>{
  const material=await readFile(new URL('../public/teaching/cases/case-ocd-01.md',import.meta.url),'utf8');
  const prompt=teachingPrompt('cases',base,knowledge);
  for(const section of attributedCaseBody(base)) for(const point of medicalPoints(section.text)) {
    assert.ok(prompt.includes(`- ${point}`),section.label);
    assert.ok(material.includes(point),section.label);
  }
  assert.match(prompt,/不要求我访问网站才能交流/);
  assert.doesNotMatch(prompt,/清洁MD|清洁OCR|sourceRevision|候选证据|待核问题|[A-Z]:\\/);
  assert.ok(caseLinks(base)[0].region.startsWith('中国大陆'));
  const edited={...base,summary:'本地自写的虚构情景',presentation:[],conversation:''};
  const display=caseFor(edited);
  assert.equal(display.summary,edited.summary);
  assert.deepEqual(display.presentation,[]);
  assert.equal(display.conversation,'');
  assert.equal(display.fieldSources.summary,undefined);
  assert.equal(display.fieldSources.presentation,undefined);
  assert.equal(display.fieldSources.conversation,undefined);
});
