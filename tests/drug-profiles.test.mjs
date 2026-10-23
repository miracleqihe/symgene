import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attributedTeachingBody, professionalFor } from '../src/content/professional.js';
import { teachingPrompt } from '../src/content/reading.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { resolveProfileAmendments } from '../src/content/profileAmendments.js';
import { auditDrugProfiles } from '../src/content/profileAudit.js';

const knowledge=JSON.parse(await readFile(new URL('../src/content/knowledge.json',import.meta.url),'utf8'));
const profiles=JSON.parse(await readFile(new URL('../src/content/drugProfiles.json',import.meta.url),'utf8'));
const fields=['indication','action','kinetics','interactions','sideEffects','contraindications','specialPopulations','monitoring'];

test('drug supplements have eight individually attributed fields and resolvable source locations',()=>{
  for(const [id,profile] of Object.entries(profiles)) {
    const base=knowledge.drugs.find(item=>item.id===id);
    assert.ok(base,id);
    const amended=resolveProfileAmendments(base,profile);
    assert.deepEqual([...Object.keys(profile.fields),...Object.keys(amended)].sort(),[...fields].sort(),id);
    assert.equal(auditDrugProfiles([base],{[id]:profile}).allStructurallyComplete,true,id);
    assert.equal(new Set(profile.sources.map(source=>source.id)).size,profile.sources.length,id);
    for(const [field,value] of Object.entries(profile.fields)) {
      assert.ok(value.text.trim(),`${id}.${field}`);
      assert.doesNotMatch(value.text,/\{\{FILL:|TODO|待核问题/,`${id}.${field}`);
      assert.ok(value.refs.length,`${id}.${field}`);
      for(const ref of value.refs) {
        const source=profile.sources.find(source=>source.id===ref);
        assert.ok(source,`${id}.${field}: ${ref}`);
        assert.ok(source.region && (source.updated || source.checkedAt),ref);
        assert.ok(source.locator || value.locations?.[ref],`${id}.${field}: missing location`);
        if(source.url) assert.equal(new URL(source.url).protocol,'https:');
      }
    }
  }
});

test('a local edit to an existing professional field takes precedence while other fields receive supplements',()=>{
  const base=knowledge.drugs.find(item=>item.id==='protriptyline');
  const edited={...base,action:'用户自行校订的示例文字'};
  const before=JSON.stringify(edited);
  const display=professionalFor(edited);
  assert.equal(display.action,edited.action);
  assert.equal(display.fieldSources.action,undefined);
  assert.ok(attributedTeachingBody(edited).every(section=>section.label!=='作用'));
  assert.equal(display.kinetics,profiles.protriptyline.fields.kinetics.text);
  assert.equal(JSON.stringify(edited),before);
});

test('portable teaching packs include attributed body and source positions without borrowing sources for manual text',()=>{
  for(const id of Object.keys(profiles)) {
    const item=knowledge.drugs.find(item=>item.id===id);
    const prompt=teachingPrompt('drugs',item,knowledge);
    for(const section of attributedTeachingBody(item)) {
      for(const point of medicalPoints(section.text)) assert.ok(prompt.includes(`- ${point}`),`${id}.${section.label}`);
      const references=section.partial ? section.evidence.flatMap(point=>point.sources) : section.sources;
      for(const source of references.filter(source => source.url?.startsWith('https://'))) assert.ok(prompt.includes(source.locator),`${id}.${source.id}`);
    }
    assert.doesNotMatch(prompt,/undefined|\{\{FILL:/);
  }
});

test('citalopram preserves the original manuscript and applies only the reviewed professional changes',()=>{
  const item=knowledge.drugs.find(item=>item.id==='citalopram');
  const before=JSON.stringify(item);
  const display=professionalFor(item);
  assert.equal(JSON.stringify(item),before);
  for(const [field,value] of Object.entries(item)) if(!fields.includes(field)) assert.deepEqual(display[field],value,field);
  assert.deepEqual(Object.keys(profiles.citalopram.fields).sort(),['monitoring','specialPopulations']);
  for(const field of fields.filter(field=>!['monitoring','specialPopulations'].includes(field))) {
    assert.ok(display.fieldAmendments[field],field);
    assert.equal(display.fieldSources[field],undefined,field);
  }
});

test('citalopram retains the specific Chinese product and directional switching restrictions',()=>{
  const item=knowledge.drugs.find(item=>item.id==='citalopram');
  const profile=profiles.citalopram;
  const cn=profile.sources.find(source=>source.id==='citalopram-cn-cipramil');
  const display=professionalFor(item);
  assert.equal(cn.updated,'2026-07-17');
  assert.deepEqual(cn.product.approvalNumbers,['国药准字HJ20170318']);
  assert.equal(cn.product.dosageForm,'薄膜衣片');
  assert.equal(profile.regionalReview.status,'cn_product_verified');
  assert.match(display.indication,/在中国，喜普妙氢溴酸西酞普兰片获批用于治疗抑郁症/);
  assert.match(display.interactions,/停不可逆MAOI后至少14天/);
  assert.match(display.interactions,/停本药后至少7天/);
  assert.match(display.interactions,/INR常用于华法林.*不适于判断阿哌沙班/);
  assert.match(display.interactions,/不自主肌肉抽动/);
  assert.match(display.interactions,/不必等齐这些表现/);
  assert.doesNotMatch(display.sideEffects,/100[–-]900\s*mg|应用劳拉西泮|赛庚啶2\s*mg/);
  assert.match(display.specialPopulations,/分娩前一个月内/);
});

test('portable corrected points carry exact public references without sourcing untouched or local text',()=>{
  const item=knowledge.drugs.find(item=>item.id==='citalopram');
  const prompt=teachingPrompt('drugs',item,knowledge);
  assert.match(prompt,/## 正文中的公开参考/);
  for(const section of attributedTeachingBody(item).filter(section=>section.partial)) {
    for(const point of section.evidence) for(const source of point.sources.filter(source=>source.url?.startsWith('https://'))) {
      assert.ok(prompt.includes(`${section.label}第${point.pointIndex+1}点：${source.title}；${source.region}；${source.locator}；${source.url}`));
    }
  }
  const local=teachingPrompt('drugs',{...item,kinetics:'本地编辑的虚构药代说明。'},knowledge);
  assert.ok(local.includes('本地编辑的虚构药代说明。'));
  assert.doesNotMatch(local,/药代动力学第\d+点：/);
  assert.doesNotMatch(prompt,/Kaplan|Sadock|Markdown行|原书第21版/);
});

test('an explicitly cleared existing field does not regain supplemented text or attribution',()=>{
  const base=knowledge.drugs.find(item=>item.id==='protriptyline');
  const display=professionalFor({...base,action:''});
  assert.equal(display.action,'');
  assert.equal(display.fieldSources.action,undefined);
});

test('trimipramine retains product-specific safety distinctions',()=>{
  const profile=profiles.trimipramine;
  const fields=profile.fields;
  assert.match(fields.interactions.text,/利奈唑胺/);
  assert.match(fields.interactions.text,/不可开始|不能开始/);
  assert.match(fields.interactions.text,/(?:5-羟色胺|血清素)综合征/);
  assert.match(fields.sideEffects.text,/并未在曲米帕明|未在曲米帕明/);
  assert.match(fields.monitoring.text,/血清素|肌肉异常/);
  assert.match(fields.sideEffects.text,/发热并伴咽痛/);
  assert.match(fields.specialPopulations.text,/对镇静和意识混乱更敏感/);
  assert.equal(profile.regionalReview.status,'cn_status_unverified');
  const label=profile.sources.find(source=>source.id==='trimipramine-us-label');
  assert.equal(label.updated,'2025-11');
  assert.equal(label.sourceRevision.pageUpdatedAt,'2026-03-17');
  assert.equal(label.sourceRevision.labelRevision,label.updated);
});

test('protriptyline does not turn a one-direction switching requirement or foreign label into a Chinese approval claim',()=>{
  const profile=profiles.protriptyline;
  const label=profile.sources.find(source=>source.id==='protriptyline-us-label');
  assert.equal(label.product.marketingAuthorisationHolder,'Epic Pharma, LLC');
  assert.equal(profile.regionalReview.status,'cn_status_unverified');
  assert.deepEqual(profile.regionalReview.productSourceIds,[]);
  assert.match(profile.fields.indication.text,/不能直接当作中国产品的批准用途/);
  assert.match(profile.fields.interactions.text,/停用单胺氧化酶抑制剂至少14天后/);
  assert.match(profile.fields.interactions.text,/反向转换还需核对下一种药物的说明书/);
  assert.match(profile.fields.kinetics.text,/半衰期.*并不是“多久起效”/);
  const switchingPoint=profile.fields.interactions.evidence.find(point=>point.pointIndex===0);
  assert.ok(switchingPoint.refs.includes(label.id));
  assert.ok(switchingPoint.locations[label.id]);
});

test('sertraline retains reviewed Chinese product distinctions rather than a foreign label substitution',()=>{
  const profile=profiles.sertraline;
  const cn=profile.sources.find(source=>source.id==='sertraline-cn-zoloft');
  assert.equal(cn.region,'中国大陆');
  assert.equal(cn.updated,'2026-03-01');
  assert.deepEqual(cn.product.approvalNumbers,['国药准字H10980141','国药准字H20204012']);
  assert.match(profile.fields.indication.text,/6～17岁强迫症/);
  assert.match(profile.fields.indication.text,/美国批准用途，不等于中国/);
  assert.match(profile.fields.kinetics.text,/22～36小时/);
  assert.match(profile.fields.specialPopulations.text,/中国左洛复说明书不推荐哺乳期使用/);
  assert.match(profile.fields.specialPopulations.text,/中重度损害的影响尚未评估/);
  for(const field of ['indication','kinetics','contraindications','specialPopulations']) {
    assert.ok(profile.fields[field].evidence.some(point=>point.refs.includes(cn.id)),field);
  }
});

test('generated teaching material uses the same supplemented professional body as the website',async()=>{
  for(const id of Object.keys(profiles)) {
    const item=knowledge.drugs.find(item=>item.id===id);
    const material=await readFile(new URL(`../public/teaching/drugs/${id}.md`,import.meta.url),'utf8');
    for(const field of fields) for(const point of medicalPoints(professionalFor(item)[field])) {
      assert.ok(material.includes(`- ${point}`),`${id}.${field}`);
    }
    assert.doesNotMatch(material,/依据本项目本地资料|面向公众改写，不保留页码/);
  }
});
