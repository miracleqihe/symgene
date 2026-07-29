import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { Fact, SourceLine } from './Detail.jsx';

export function CaseRow({ canEdit, item, selected, onSelect, onEdit, onDelete }) {
  return (
    <div className={'case-row ' + (selected ? 'selected' : '')}>
      <button onClick={() => onSelect(item)} className="case-main">
        <span className="case-stage">{item.stage}</span>
        <strong>{item.title}</strong>
        <p>{item.summary}</p>
        <span className="tag-line">{(item.tags || []).map((tag) => <em key={tag}>{tag}</em>)}</span>
      </button>
      {canEdit && (
        <div className="row-actions">
          <button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={16} /></button>
          <button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}

export function CaseDetail({ canEdit, item, disorder, onEdit, onDelete, detailRef }) {
  return (
    <article className="case-detail" ref={detailRef}>
      <div className="detail-top">
        <div>
          <span className="eyebrow">{disorder?.category || 'CASE NOTE'} · {item.stage}</span>
          <h2>{item.title}</h2>
          <p className="aliases">{disorder?.name || '教学性案例'} · 合成案例</p>
        </div>
        {canEdit && (
          <div className="detail-actions">
            <button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={17} /></button>
            <button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={17} /></button>
          </div>
        )}
      </div>
      <div className="fact-grid">
        <Fact label="案例摘要" text={item.summary} />
        <Fact label="表现" text={(item.presentation || []).join('；')} />
        <Fact label="时间线" text={item.timeline} />
        <Fact label="功能影响" text={item.functionImpact} />
        <Fact label="评估重点" text={(item.assessmentFocus || []).join('；')} />
        <Fact label="鉴别提示" text={(item.differentialClues || []).join('；')} />
        <Fact label="风险线索" text={item.riskSignals} warning />
        <Fact label="安全提醒" text={item.safetyNote} warning />
      </div>
      <SourceLine text={item.source} />
    </article>
  );
}
