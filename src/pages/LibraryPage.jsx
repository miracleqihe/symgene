import React, { useEffect, useRef } from 'react';
import { Detail, EmptyDetail } from '../components/knowledge/Detail.jsx';
import { DisorderIndex, DrugIndex } from '../components/knowledge/Indexes.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';

export function LibraryPage({ canEdit, type, data, selected, onSelect, onEdit, onDelete, onAdd }) {
  const detailRef = useRef(null);
  const items = data[type];
  const label = type === 'drugs' ? '精神药物' : '疾病科普';

  useEffect(() => {
    if (!selected || !window.matchMedia('(max-width: 720px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);

  return (
    <div className="page library-page page-enter">
      <PageHeader
        canEdit={canEdit}
        eyebrow={type === 'drugs' ? 'MEDICATIONS' : 'DISORDERS'}
        title={label}
        description={type === 'drugs'
          ? '按《精神药物手册》的章节与药理学分类整理常见精神科药物。'
          : '从症状、病程与功能影响出发，建立可读的疾病词条。'}
        count={items.length + ' 个词条'}
        onAdd={() => onAdd(type)}
        addLabel="新增词条"
      />
      <div className="workspace-grid">
        <section className={'index-panel ' + (type === 'drugs' ? 'drug-index-panel' : 'disorder-index-panel')}>
          <div className="panel-label">分类索引 <span>{String(items.length).padStart(2, '0')}</span></div>
          {type === 'drugs'
            ? <DrugIndex items={items} selected={selected} onSelect={onSelect} />
            : <DisorderIndex items={items} selected={selected} onSelect={onSelect} />}
        </section>
        <section className="detail-panel" ref={detailRef}>
          {selected
            ? <Detail canEdit={canEdit} type={type} item={selected} onEdit={() => onEdit(type, selected)} onDelete={() => onDelete(type, selected)} />
            : <EmptyDetail type={type} onChoose={() => items[0] && onSelect(items[0])} />}
        </section>
      </div>
    </div>
  );
}
