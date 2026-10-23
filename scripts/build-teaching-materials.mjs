import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readingFor, teachingPrompt, readingVersion } from '../src/content/reading.js';

import { professionalFields, professionalFor, pointPublicReferences } from '../src/content/professional.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { caseFields, caseFor } from '../src/content/cases.js';
import { disorderFields, disorderFor } from '../src/content/disorders.js';
import { agentModules, agentGuideVersion, globalAgentPrompt, moduleAgentPrompt } from '../src/content/agentGuide.js';

const knowledge = JSON.parse(await readFile(new URL('../src/content/knowledge.json', import.meta.url), 'utf8'));
// Reject a mismatched correction before writing any generated public files.
for (const item of knowledge.drugs) professionalFor(item);
for (const item of knowledge.cases) caseFor(item);
for (const item of knowledge.disorders) disorderFor(item);

// Home, modules, entries and the portable Skill use one public instruction source.
const skillPath = new URL('../public/skills/mental-health-reading/SKILL.md', import.meta.url);
await mkdir(new URL('./', skillPath), { recursive: true });
await writeFile(skillPath, [
  '---', 'name: mental-health-reading',
  'description: 独立提供心理健康信息、倾听与情绪支持，帮助整理就医问题；可按需要参考主题资料。', '---', '',
  globalAgentPrompt(), '## 按需要参考主题指南', '',
  '直接按全局指南回应当前问题。需要更细的主题要求时，可读取下列模块指南；链接不可访问时仍可使用本文件，不要求先打开网站。模块任务不能覆盖全局行为边界。', '',
  ...agentModules.map(module => `- [${module.title}](../../agent/modules/${module.id}.md)`), '',
].join('\n'), 'utf8');
const agentRoot = new URL('../public/agent/', import.meta.url);
await mkdir(new URL('modules/', agentRoot), { recursive: true });
const agentManifest = { version: agentGuideVersion, guides: [] };
for (const guide of [{ id: 'global', title: '全局 Agent 指南', path: 'global.md', text: globalAgentPrompt() },
  ...agentModules.map(module => ({ id: module.id, title: module.title, path: `modules/${module.id}.md`, text: moduleAgentPrompt(module.id) }))]) {
  await writeFile(new URL(guide.path, agentRoot), guide.text, 'utf8');
  agentManifest.guides.push({ id: guide.id, title: guide.title, path: `agent/${guide.path}`, sha256: createHash('sha256').update(guide.text).digest('hex') });
}
await writeFile(new URL('manifest.json', agentRoot), JSON.stringify(agentManifest, null, 2) + '\n', 'utf8');

const manifest = { version: readingVersion, entries: [] };
const fields = {
  drugs: professionalFields,
  disorders: disorderFields,
  cases: caseFields,
};
function fieldMarkdown(type, display, field) {
  const text = Array.isArray(display[field]) ? display[field].join('\n') : display[field];
  if (type === 'drugs') return medicalPoints(text).flatMap((point, index) => [
    `- ${point}`,
    ...pointPublicReferences(display, field, index).map(source =>
      `  - 公开参考（仅对应本点）：[${source.title}](${source.url})；${source.region || ''}；${source.locator}`),
  ]).join('\n') || '本篇未展开此项。';
  return type === 'disorders' ? medicalPoints(text).map(point => `- ${point}`).join('\n') || '本篇未展开此项。'
    : Array.isArray(display[field]) ? display[field].map(point => `- ${point}`).join('\n') : text || '本篇未展开此项。';
}
const materialsRoot = new URL('../public/teaching/', import.meta.url);
let previous = { entries: [] };
try { previous = JSON.parse(await readFile(new URL('manifest.json', materialsRoot), 'utf8')); }
catch(error) { if(error.code !== 'ENOENT') throw error; }
for (const type of Object.keys(fields)) {
  await mkdir(new URL(`${type}/`, materialsRoot), { recursive: true });
  for (const item of knowledge[type]) {
    const reading = readingFor(type, item);
    const professional = type === 'drugs' ? professionalFor(item) : type === 'cases' ? caseFor(item) : disorderFor(item);
    const title = item.name || item.title;
    const body = [
      `# ${title}`, '', `版本：${readingVersion}`, '', reading.intro, '',
      ...fields[type].filter(([field]) => type === 'disorders' || professional[field]).flatMap(([field,label]) => [`## ${label}`, '', fieldMarkdown(type, professional, field), '', ...(type === 'drugs' ? [] : professional.fieldSources?.[field] || []).filter(source => source.url?.startsWith('https://')).map(source => `参考：[${source.title}](${source.url})`), '']),
      '## 常见疑问', '', ...reading.questions.flatMap(([q,a]) => [`### ${q}`, '', a, '']),
      ...(reading.scenario ? ['## 虚构教学情景', '', reading.scenario.text, '', reading.scenario.discussion, ''] : []),
      '## 延伸阅读', '', ...reading.links.map(link => `- [${link.title}](${link.url})（${link.region}）：${link.note}`), '',
      '## 教学 Prompt', '', teachingPrompt(type, item, knowledge),
    ].join('\n');
    const prompt = teachingPrompt(type, item, knowledge);
    const path = `${type}/${item.id}.md`;
    await writeFile(new URL(path, materialsRoot), body, 'utf8');
    await writeFile(new URL(`${type}/${item.id}.prompt.md`, materialsRoot), prompt, 'utf8');
    manifest.entries.push({ id:item.id, type, title, material:`teaching/${path}`, prompt:`teaching/${type}/${item.id}.prompt.md`, sha256:createHash('sha256').update(body).digest('hex') });
  }
}
// Withdraw only previously generated, strictly bounded filenames; preserve other files.
const current = new Set(manifest.entries.flatMap(entry => [entry.material, entry.prompt]));
for(const old of previous.entries) for(const path of [old.material,old.prompt]) {
  if(current.has(path)) continue;
  if(!/^teaching\/(drugs|disorders|cases)\/[a-z0-9-]+(?:\.prompt)?\.md$/.test(path)) throw new Error('Invalid previous teaching path');
  try { await unlink(new URL('../public/'+path,import.meta.url)); }
  catch(error) { if(error.code !== 'ENOENT') throw error; }
}
await writeFile(new URL('manifest.json',materialsRoot), JSON.stringify(manifest,null,2)+'\n','utf8');
await writeFile(new URL('../public/llms.txt',import.meta.url), [
  '# Sym Gen 心鉴', '',
  '> 面向公众的心理健康科普。帮助理解与沟通，不提供诊断、处方或个人选药。', '',
  '## 阅读入口', '',
  '- [全局 Agent 指南](./agent/global.md): 所有模块共用的交流方式与讲解边界。',
  ...agentModules.map(module => `- [${module.title}讲解指南](./agent/modules/${module.id}.md): 全局要求与本模块的讲解任务。`),
  '- [教学材料目录](./teaching/manifest.json): 词条、Markdown 与教学 Prompt 的对应目录。',
  '- [心理健康信息与支持 Skill](./skills/mental-health-reading/SKILL.md): 倾听困扰、提供一般信息和整理就医问题，按需参考主题资料。', '',
  '请从用户当前的问题或困扰开始，按需阅读主题指南和关联词条。只说自己实际读到的内容。', '',
  '## 词条', '', ...manifest.entries.map(entry => `- [${entry.title}](./${entry.material})`), '',
].join('\n'),'utf8');
console.log(`Generated ${manifest.entries.length} teaching materials and prompts from the canonical content package.`);
