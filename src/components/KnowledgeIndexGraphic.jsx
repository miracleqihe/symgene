import React from 'react';

const INDEX_ITEMS = [
  { id: 'drugs', number: '01', label: '精神药物', accent: 'cyan' },
  { id: 'disorders', number: '02', label: '疾病科普', accent: 'yellow' },
  { id: 'cases', number: '03', label: '案例分析', accent: 'ink' },
  { id: 'resources', number: '04', label: '网络资源', accent: 'teal' }
];

export default function KnowledgeIndexGraphic({ counts, onNavigate }) {
  const largestCount = Math.max(1, ...INDEX_ITEMS.map((item) => counts[item.id] || 0));

  return (
    <aside className="knowledge-index-graphic" aria-label="知识库内容索引">
      <div className="index-graphic-head">
        <span>KNOWLEDGE INDEX</span>
        <span>SYM / DATA 04</span>
      </div>
      <div className="index-graphic-orbit" aria-hidden="true">
        <i />
        <i />
        <span>心鉴</span>
      </div>
      <div className="index-graphic-list">
        {INDEX_ITEMS.map((item) => {
          const count = counts[item.id] || 0;
          return (
            <button
              className={`index-graphic-item accent-${item.accent}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{ '--index-ratio': count / largestCount }}
            >
              <span className="index-graphic-number">{item.number}</span>
              <span className="index-graphic-label">{item.label}</span>
              <span className="index-graphic-track" aria-hidden="true"><i /></span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
      <div className="index-graphic-foot">
        <span>LIVE CONTENT MAP</span>
        <span>122.00° / 31.20°</span>
      </div>
    </aside>
  );
}
