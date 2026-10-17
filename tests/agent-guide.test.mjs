import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { agentModules, globalAgentPrompt, moduleAgentPrompt } from '../src/content/agentGuide.js';
import { teachingPrompt } from '../src/content/reading.js';
import { seedData, navItems } from '../src/data.js';
import { professionalFor } from '../src/content/professional.js';
import { medicalPoints } from '../src/content/medicalText.js';

test('every module and entry inherits the public global guide without a private source inventory', async () => {
  const global = globalAgentPrompt();
  assert.deepEqual(agentModules.map(module => module.id).sort(), navItems.filter(item => item.id !== 'home').map(item => item.id).sort());
  const skill = await readFile(new URL('../public/skills/mental-health-reading/SKILL.md', import.meta.url), 'utf8');
  assert.ok(skill.includes(global));
  const guides = [global, skill, ...agentModules.map(module => moduleAgentPrompt(module.id))];
  for (const type of ['drugs','disorders','cases']) for (const item of seedData[type]) {
    const prompt = teachingPrompt(type, item, seedData);
    assert.ok(prompt.includes(moduleAgentPrompt(type)), `${type}/${item.id}`);
    guides.push(prompt);
  }
  for (const guide of guides) {
    assert.doesNotMatch(guide, /Kaplan|Sadock|《精神科药物临床手册》|《精神疾病案例诊疗思路》|企业级实施方案|附录 [BCD]|claimIds|sourceIds|Markdown行|逐点对应位置/);
    assert.doesNotMatch(guide, /[A-Z]:[\\/]|file:\/\//);
  }
});

test('public safety and dialogue instructions do not force disclosure or delay real-world help', () => {
  const guide = globalAgentPrompt();
  assert.match(guide, /消息长度、标点、表情和回复间隔不能证明心理状态/);
  assert.match(guide, /不强制生成故事、症状清单或长篇分析/);
  assert.match(guide, /安全信号时，先暂停普通讲解/);
  assert.match(guide, /不因等待入口核验而延误现实求助/);
  assert.match(guide, /非紧急情境下/);
  assert.match(guide, /不编造所用平台的保存、删除、设置或隐私政策/);
  assert.doesNotMatch(guide, /至多一轮|最多追问一个|全程只出现一次|每个选项都是/);
});

test('global, module and entry prompts can be used without the website or network tools', async () => {
  const prompts = [globalAgentPrompt(), ...agentModules.map(module => moduleAgentPrompt(module.id))];
  for (const type of ['drugs', 'disorders', 'cases']) for (const item of seedData[type]) prompts.push(teachingPrompt(type, item, seedData));
  for (const prompt of prompts) {
    assert.match(prompt, /不要求先访问心鉴、选择模块、粘贴词条或安装 Skill/);
    assert.match(prompt, /想倾诉时，先听具体经历/);
    assert.match(prompt, /没有联网或不能打开链接时，仍可倾听、整理问题/);
    assert.match(prompt, /不要声称已安装功能、接入心鉴数据库或获得诊疗资质/);
    assert.match(prompt, /不要声称能够访问或记得其他聊天中的内容/);
    assert.match(prompt, /不要替我诊断、按症状选药/);
    assert.doesNotMatch(prompt, /先读取当前模块指南，再/);
  }
  for (const module of agentModules) assert.match(moduleAgentPrompt(module.id), /话题转向个人困扰或其他主题时/);
  const entry = teachingPrompt('drugs', seedData.drugs.find(item => item.id === 'citalopram'), seedData);
  assert.match(entry, /方括号只是心鉴词条编号，不是你已接入的数据库/);
  const skill = await readFile(new URL('../public/skills/mental-health-reading/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /链接不可访问时仍可使用本文件/);
});

test('generated public guides are synchronized, hashed and discoverable at relative paths', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/agent/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.guides.length, 7);
  const llms = await readFile(new URL('../public/llms.txt', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/agent\/global\.md"/);
  for (const guide of manifest.guides) {
    assert.match(guide.path, /^agent\/(global|modules\/(drugs|disorders|cases|resources|reviews|atlas))\.md$/);
    const text = await readFile(new URL('../public/' + guide.path, import.meta.url), 'utf8');
    assert.equal(text, guide.id === 'global' ? globalAgentPrompt() : moduleAgentPrompt(guide.id));
    assert.equal(createHash('sha256').update(text).digest('hex'), guide.sha256);
    assert.ok(llms.includes(`./${guide.path}`));
  }
});

test('entry prompts preserve actual manual text and local edits without borrowing source attribution', () => {
  const item = seedData.drugs.find(item => item.id === 'citalopram');
  const prompt = teachingPrompt('drugs', item, seedData);
  for (const point of medicalPoints(professionalFor(item).action)) assert.ok(prompt.includes(`- ${point}`));
  const base = seedData.drugs.find(item => item.id === 'sertraline');
  const edited = { ...base, action: '本地编辑的虚构测试文字', indication: '' };
  const local = teachingPrompt('drugs', edited, seedData);
  assert.ok(local.includes(edited.action));
  assert.doesNotMatch(local, /### 用途\n/);
  assert.match(local, /### 作用\n- 本地编辑的虚构测试文字\n\n\n\n### 药代动力学/);
});
