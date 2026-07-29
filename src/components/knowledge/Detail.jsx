import React from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, Brain, Edit3, ShieldCheck, Trash2 } from 'lucide-react';

export function Fact({ label, text, warning, priority }) {
  return (
    <div className={'fact ' + (warning ? 'warning ' : '') + (priority ? 'fact-primary' : 'fact-secondary')}>
      <span>{warning && <ShieldCheck size={14} />}{label}</span>
      <p>{text || '待补充'}</p>
    </div>
  );
}

function ListFact({ label, items, warning, priority }) {
  return (
    <div className={'fact fact-list ' + (warning ? 'warning ' : '') + (priority ? 'fact-primary' : 'fact-secondary')}>
      <span>{warning && <ShieldCheck size={14} />}{label}</span>
      {items?.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>待补充</p>}
    </div>
  );
}

export function SourceLine({ text }) {
  return <div className="source-line"><BookOpen size={14} /><span>{text}</span></div>;
}

function DiseaseFacts({ item }) {
  return (
    <div className="disease-copy">
      <Fact label="介绍" text={item.summary} priority />
      <Fact label="如何理解" text={item.details} priority />
      <ListFact label="常见体验" items={item.symptoms} />
      <ListFact label="来访者可能这样描述" items={item.patientPhrases} />
      <ListFact label="病程线索" items={item.courseClues} />
      <ListFact label="可能影响" items={item.functionalImpact} />
      <ListFact label="评估时会关注" items={item.assessment} />
      <ListFact label="需要鉴别" items={item.differentials} />
      <ListFact label="治疗与支持概览" items={item.treatmentOverview} />
      <ListFact label="需要尽快求助的信号" items={item.emergencySignals} warning />
    </div>
  );
}

export function Detail({ canEdit, type, item, onBack, onEdit, onDelete }) {
  const isDrug = type === 'drugs';
  const aliasText = Array.isArray(item.aliases) ? item.aliases.join(' · ') : item.aliases || '';
  const latinName = aliasText.split(/\s*[·•]\s*/).find((part) => /[A-Za-z]/.test(part)) || item.name;
  return (
    <article className="detail-article">
      <button className="detail-back" onClick={onBack}><ArrowLeft size={15} /> 返回列表</button>
      <div className="detail-top">
        <span
          className={'detail-entry-number ' + (isDrug ? 'detail-entry-name' : '')}
          lang={isDrug ? 'en' : undefined}
          aria-hidden="true"
        >
          {isDrug ? latinName : 'ENTRY'}
        </span>
        <div>
          <span className="eyebrow">{isDrug ? (item.categoryLabel || item.className) : item.category}</span>
          <h2>{item.name}</h2>
          <p className="aliases">
            {isDrug ? item.aliases : item.aliases?.join(' · ') || '疾病词条 · 公共阅读版'}
          </p>
          {isDrug && item.className && item.className !== item.categoryLabel && (
            <p className="detail-class">{item.className}</p>
          )}
        </div>
        {canEdit && (
          <div className="detail-actions">
            <button className="icon-button" onClick={onEdit} aria-label="编辑词条"><Edit3 size={17} /></button>
            <button className="icon-button danger" onClick={onDelete} aria-label="删除词条"><Trash2 size={17} /></button>
          </div>
        )}
      </div>
      {isDrug ? (
        <div className="fact-grid">
          <Fact label="适用情境" text={item.indication} priority />
          <Fact label="药物作用" text={item.action} priority />
          <Fact label="药物动力学" text={item.kinetics} />
          <Fact label="药物联用效果" text={item.interactions} />
          <Fact label="禁忌与警示" text={item.contraindications} warning />
        </div>
      ) : <DiseaseFacts item={item} />}
      <SourceLine text={item.source} />
    </article>
  );
}

export function EmptyDetail({ type, onChoose }) {
  return (
    <div className="empty-detail">
      <span className="empty-mark"><Brain size={25} /></span>
      <h3>选择一个{type === 'drugs' ? '药物' : '疾病'}词条</h3>
      <p>从左侧索引开始，查看结构化内容与来源说明。</p>
      <button className="text-button" onClick={onChoose}>
        打开第一个词条 <ArrowUpRight size={15} />
      </button>
    </div>
  );
}
