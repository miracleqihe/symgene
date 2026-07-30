import React from 'react';
import { ArrowUpRight, BookOpen, Edit3, ExternalLink, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';

export function ResourcesPage({ canEdit, data, onEdit, onDelete, onAdd }) {
  return (
    <div className="page resources-page page-enter">
      <PageHeader
        canEdit={canEdit}
        page="resources"
        eyebrow="LIBRARY"
        title="网络资源"
        description="外部网站与开放资料的统一入口，原始书籍仅作为项目内部依据。"
        count={data.resources.length + ' 项资源'}
        onAdd={() => onAdd('resources')}
        addLabel="新增资源"
      />
      <div className="resource-list">
        {data.resources.map((item, itemIndex) => (
          <article className="resource-row" key={item.id}>
            <span className="resource-number" aria-hidden="true">
              {String(itemIndex + 1).padStart(2, '0')}
            </span>
            <div className={'resource-kind ' + (item.kind === '书籍' ? 'yellow' : 'blue')}>
              {item.kind === '书籍' ? <BookOpen size={18} /> : <ExternalLink size={18} />}
            </div>
            <div className="resource-copy">
              <span className="eyebrow">{item.source}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
            <span className="resource-direction" aria-hidden="true">OUT / ↗</span>
            <div className="row-actions">
              <a
                className="icon-button"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                aria-label="打开资源"
              >
                <ArrowUpRight size={17} />
              </a>
              {canEdit && (
                <>
                  <button className="icon-button" onClick={() => onEdit('resources', item)} aria-label="编辑资源">
                    <Edit3 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => onDelete('resources', item)} aria-label="删除资源">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="resource-note">
        <ExternalLink size={17} />
        <p>这里仅展示公开网络链接。项目内部原始资料不会作为网络资源开放。</p>
      </div>
    </div>
  );
}
