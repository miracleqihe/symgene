import React, { useCallback, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { agentModules, globalAgentPrompt, moduleAgentPrompt } from '../content/agentGuide.js';
import { PromptDialog } from './KnowledgeReading.jsx';

export default function AgentGuideEntry({ moduleId }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const module = agentModules.find(module => module.id === moduleId);
  const title = module ? `${module.title} · AI 讲解指南` : '全局 Agent 指南';
  const base = import.meta.env.BASE_URL;
  return <div className={module ? 'module-agent-entry' : 'home-agent-entry'}>
    <button type="button" className="agent-guide-trigger" onClick={() => setOpen(true)}>{module ? 'AI 讲解指南' : '全局 Agent · 一起读懂'}<ArrowUpRight size={16} aria-hidden="true" /></button>
    {!module && <span>复制到你常用的 AI，聊困扰、了解疾病与治疗</span>}
    {open && <PromptDialog prompt={module ? moduleAgentPrompt(module.id) : globalAgentPrompt()} name={module ? `${module.title}-讲解指南` : '心鉴-全局Agent指南'} title={title} onClose={close} description="复制到你常用的 AI，然后直接说想了解的事或眼下的困扰。可以独立使用；需要更多资料时，再参考心鉴或其他可靠来源。">
      <div className="agent-guide-links">
        <a href={`${base}agent/${module ? `modules/${module.id}` : 'global'}.md`} target="_blank" rel="noopener noreferrer">打开 Markdown 指南</a>
        <a href={`${base}skills/mental-health-reading/SKILL.md`} target="_blank" rel="noopener noreferrer">心理健康信息与支持 Skill</a>
      </div>
      {!module && <nav className="agent-module-links" aria-label="分模块 Agent 指南">{agentModules.map(module => <a key={module.id} href={`${base}agent/modules/${module.id}.md`} target="_blank" rel="noopener noreferrer">{module.title}</a>)}</nav>}
    </PromptDialog>}
  </div>;
}
