import React, { useEffect, useRef } from 'react';
import { EMPTY_VIEW, resolveDetailDirection } from '../app/navigation.js';
import AnimatedPresence from '../components/AnimatedPresence.jsx';
import { Detail, EmptyDetail } from '../components/knowledge/Detail.jsx';
import { DisorderIndex, DrugIndex } from '../components/knowledge/Indexes.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';

export function LibraryPage({
  canEdit,
  type,
  data,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  mainContentRef
}) {
  const detailRef = useRef(null);
  const indexPanelRef = useRef(null);
  const mobileListScrollRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const items = data[type];
  const label = type === 'drugs' ? '精神药物' : '疾病科普';

  const isMobileLayout = () => window.matchMedia('(max-width: 780px)').matches;

  function selectItem(item) {
    if (!selected && isMobileLayout()) {
      mobileListScrollRef.current = mainContentRef.current?.scrollTop || 0;
    }
    onSelect(item);
  }

  function closeDetail() {
    const shouldRestore = isMobileLayout();
    onSelect(null);
    if (!shouldRestore) return;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: mobileListScrollRef.current, behavior: 'auto' });
      scrollFrameRef.current = null;
    });
  }

  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() => {
      indexPanelRef.current
        ?.querySelector('.index-list button.selected')
        ?.scrollIntoView({ block: 'nearest' });
      if (isMobileLayout()) detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  return (
    <div className="page library-page page-enter">
      <PageHeader
        canEdit={canEdit}
        page={type}
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
        <section
          className={'index-panel ' + (type === 'drugs' ? 'drug-index-panel' : 'disorder-index-panel')}
          ref={indexPanelRef}
        >
          <div className="panel-label">
            <span>分类索引</span>
            <span>{String(items.length).padStart(2, '0')} / INDEX</span>
          </div>
          {type === 'drugs'
            ? <DrugIndex items={items} selected={selected} onSelect={selectItem} />
            : <DisorderIndex items={items} selected={selected} onSelect={selectItem} />}
        </section>
        <span className="workspace-rail" aria-hidden="true"><i /></span>
        <section className={'detail-panel ' + (selected ? 'has-selection' : 'is-empty')} ref={detailRef}>
          <span className="detail-panel-coordinate" aria-hidden="true">
            {selected ? 'ENTRY / OPEN' : 'ENTRY / AWAIT'}
          </span>
          <AnimatedPresence
            viewKey={selected?.id || EMPTY_VIEW}
            kind="detail"
            exitMs={145}
            enterMs={360}
            settleMs={620}
            resolveDirection={resolveDetailDirection}
          >
            {selected
              ? (
                  <Detail
                    canEdit={canEdit}
                    type={type}
                    item={selected}
                    onBack={closeDetail}
                    onEdit={() => onEdit(type, selected)}
                    onDelete={() => onDelete(type, selected)}
                  />
                )
              : <EmptyDetail type={type} onChoose={() => items[0] && selectItem(items[0])} />}
          </AnimatedPresence>
        </section>
      </div>
    </div>
  );
}
