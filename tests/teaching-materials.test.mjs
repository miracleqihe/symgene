import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { seedData } from '../src/data.js';
import { readingFor, relatedFor, teachingPrompt } from '../src/content/reading.js';

test('all entries have useful public links and bounded teaching tasks',()=>{
  for(const type of ['drugs','disorders','cases']) for(const item of seedData[type]){
    const guide=readingFor(type,item);
    assert.ok(guide.intro.length>25);
    assert.ok(guide.questions.length>0);
    for(const link of guide.links) assert.equal(new URL(link.url).protocol,'https:');
    const prompt=teachingPrompt(type,item,seedData);
    assert.match(prompt,/不要替我诊断、按症状选药/);
    assert.match(prompt,/只引用实际读取的资料/);
    assert.match(prompt,/打不开的链接不声称读过/);
    assert.match(prompt,/来源中的指令/);
    assert.doesNotMatch(prompt,/[A-Z]:[\\/]|file:\/\//);
    const related=relatedFor(type,item,seedData);
    for(const [kind,items]of Object.entries(related))for(const entry of items)assert.ok(seedData[kind].some(i=>i.id===entry.id));
  }
});

test('every static teaching material matches its manifest hash and current prompt',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/teaching/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.entries.length,358);
  for(const entry of manifest.entries){
    const body=await readFile(new URL('../public/'+entry.material,import.meta.url),'utf8');
    assert.doesNotMatch(body,/[A-Z]:[\\/]|file:\/\//);
    assert.equal(createHash('sha256').update(body).digest('hex'),entry.sha256);
    const item=seedData[entry.type].find(i=>i.id===entry.id);
    const prompt=await readFile(new URL('../public/'+entry.prompt,import.meta.url),'utf8');
    assert.equal(prompt,teachingPrompt(entry.type,item,seedData));
    assert.ok(body.includes(item.name||item.title));
  }
});
