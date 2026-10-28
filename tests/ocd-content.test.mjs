import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/disorderProfiles.json' with { type: 'json' };
import { disorderFor, attributedDisorderBody, disorderLinks } from '../src/content/disorders.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { teachingPrompt } from '../src/content/reading.js';

const base=knowledge.disorders.find(item=>item.id==='ocd');
const profile=profiles.ocd;
const points=field=>medicalPoints(profile.fields[field].text);

test('OCD distinguishes invisible rituals and variable insight without making seriousness or checking a diagnosis',()=>{
  assert.match(profile.fields.summary.text,/内心活动/);
  assert.match(points('details')[1],/前者是内心活动/);
  assert.match(points('details')[1],/后者.*其他人参与/);
  assert.match(points('details')[2],/不能.*确认或排除强迫症/);
  assert.match(points('functionalImpact')[0],/不必等到/);
  assert.match(points('differentials')[0],/仅凭.*不能判断/);
});

test('OCD assessment preserves childhood, perinatal and biomarker limits with cross-chapter evidence',()=>{
  assert.match(points('assessment')[1],/不能.*脑扫描或基因检测.*确诊/);
  assert.match(points('assessment')[3],/说不清/);
  assert.match(points('assessment')[3],/不表示.*装病/);
  assert.match(points('assessment')[4],/孕期或产后/);
  assert.match(profile.fields.assessment.evidence[3].locations['kaplan11-ocd'],/CH51.xhtml/);
  assert.match(profile.fields.assessment.evidence[4].locations['kaplan11-ocd'],/CH30.xhtml/);
});

test('OCD treatment retains gradual trained ERP, mental responses, real-world safety and continued family care',()=>{
  const erp=points('treatmentOverview')[1];
  assert.match(erp,/相应训练.*专业人员/);
  assert.match(erp,/共同制定.*渐进/);
  assert.match(erp,/安全情境/);
  assert.match(erp,/内心反复确认/);
  assert.match(erp,/不是忽略真实的卫生、用火或其他安全要求/);
  const family=points('treatmentOverview')[4];
  assert.match(family,/不等于撤走关心/);
  assert.match(family,/当事人一起商量.*逐步调整/);
  assert.match(family,/不要突然.*惩罚.*强迫暴露/);
  assert.match(points('treatmentOverview')[2],/在中国用药时.*具体产品说明书.*适用年龄和用途/);
  assert.match(points('treatmentOverview')[2],/不能.*国外批准.*直接套/);
  assert.match(points('treatmentOverview')[3],/不自行加量、换药或停药/);
});

test('OCD harm thoughts neither prove intent nor excuse ignoring danger, and urgent care never waits for routine tasks',()=>{
  const risk=points('emergencySignals');
  assert.match(risk[0],/及时.*医疗评估/);
  assert.match(risk[0],/立即.*当地急救.*就近急诊/);
  assert.match(risk[1],/不能直接等同于想付诸行动/);
  assert.match(risk[1],/不能仅凭.*保证安全/);
  assert.match(risk[1],/当下是否有行动意图、计划或已经采取行动/);
  assert.match(risk[1],/不能靠.*安全保证/);
  assert.match(risk[2],/可信任的人陪伴/);
  assert.match(risk[2],/不等记录.*不等日常复诊/);
  assert.match(risk[2],/不要只依靠与AI继续聊天/);
  assert.ok(profile.fields.emergencySignals.evidence[1].refs.includes('nice-ocd-cg31'));
});

test('OCD uses the identified book and Chinese standard while portable materials preserve every accepted point and local edits',async()=>{
  assert.equal(profile.sources.find(source=>source.format==='epub').sourceRevision,
    '99b1a73b67d3ed41733a250fcbb36079627d422f0289e6a4958bfd052713805f');
  assert.equal(profile.sources.find(source=>source.id==='nhc-ocd-2020').sourceRevision,
    'a789d0b61f34d6724d383ad5ac3ffa01064f8c83e88722ebb5031b426c62a8cc');
  assert.equal(profile.sources.find(source=>source.id==='nhc-ocd-2020').updated,'2020');
  assert.ok(profile.fields.patientPhrases.evidence[0].refs.some(ref=>profile.sources.find(source=>source.id===ref)?.kind==='fiction'));
  const prompt=teachingPrompt('disorders',base,knowledge);
  const material=await readFile(new URL('../public/teaching/disorders/ocd.md',import.meta.url),'utf8');
  for(const section of attributedDisorderBody(base)) for(const point of medicalPoints(section.text)) {
    assert.ok(prompt.includes(`- ${point}`),section.label);
    assert.ok(material.includes(point),section.label);
  }
  assert.match(prompt,/不要求我访问网站才能交流/);
  assert.doesNotMatch(prompt,/Kaplan|Sadock|候选证据|待核问题|sourceRevision|[A-Z]:\\/);
  assert.ok(disorderLinks(base)[0].region.startsWith('中国大陆'));
  const edited={...base,summary:'本地自写的虚构测试正文',assessment:[],details:''};
  const display=disorderFor(edited);
  assert.equal(display.summary,edited.summary);
  assert.deepEqual(display.assessment,[]);
  assert.equal(display.details,'');
  assert.equal(display.fieldSources.summary,undefined);
  assert.equal(display.fieldSources.assessment,undefined);
  assert.equal(display.fieldSources.details,undefined);
  assert.deepEqual(display.relatedDrugIds,base.relatedDrugIds);
});
