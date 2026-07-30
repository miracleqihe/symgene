import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  DISORDER_CATEGORY_ORDER,
  EMPTY_VIEW,
  resolveDetailDirection
} from '../app/navigation.js';
import AnimatedPresence from '../components/AnimatedPresence.jsx';
import { CaseDetail, CaseRow } from '../components/knowledge/CaseComponents.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';

export function CasesPage({
  canEdit,
  data,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  onOpenDisorder,
  mainContentRef
}) {
  const detailRef = useRef(null);
  const mobileListScrollRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const selectedDisorder = selected
    ? data.disorders.find((item) => item.id === selected.disorderId)
    : null;

  function selectCase(item) {
    if (!selected && window.matchMedia('(max-width: 780px)').matches) {
      mobileListScrollRef.current = mainContentRef.current?.scrollTop || 0;
    }
    onSelect(item);
  }

  function closeCase() {
    const shouldRestore = window.matchMedia('(max-width: 780px)').matches;
    onSelect(null);
    if (!shouldRestore) return;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: mobileListScrollRef.current, behavior: 'auto' });
      scrollFrameRef.current = null;
    });
  }

  useEffect(() => {
    if (!selected || !window.matchMedia('(max-width: 780px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const { disorders, casesByDisorder } = useMemo(() => {
    const sortedDisorders = [...data.disorders].sort((a, b) => {
      const ai = DISORDER_CATEGORY_ORDER.indexOf(a.category);
      const bi = DISORDER_CATEGORY_ORDER.indexOf(b.category);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
    });
    const groupedCases = new Map();
    data.cases.forEach((item) => {
      const group = groupedCases.get(item.disorderId);
      if (group) group.push(item);
      else groupedCases.set(item.disorderId, [item]);
    });
    return { disorders: sortedDisorders, casesByDisorder: groupedCases };
  }, [data.cases, data.disorders]);

  return (
    <div className="page cases-page page-enter">
      <PageHeader
        canEdit={canEdit}
        page="cases"
        eyebrow="CASE NOTES"
        title="案例分析"
        description="按疾病词条分组的教学性案例，用于练习观察、评估与沟通。"
        count={data.cases.length + ' 个案例'}
        onAdd={() => onAdd('cases')}
        addLabel="新增案例"
      />
      <AnimatedPresence
        viewKey={selected?.id || EMPTY_VIEW}
        emptyKey={EMPTY_VIEW}
        kind="detail"
        className="case-detail-presence"
        exitMs={145}
        enterMs={360}
        settleMs={620}
        resolveDirection={resolveDetailDirection}
      >
        {selected && (
          <CaseDetail
            canEdit={canEdit}
            detailRef={detailRef}
            item={selected}
            disorder={selectedDisorder}
            onBack={closeCase}
            onEdit={() => onEdit('cases', selected)}
            onDelete={() => onDelete('cases', selected)}
          />
        )}
      </AnimatedPresence>
      <div className="case-groups">
        {disorders.map((disorder, disorderIndex) => {
          const cases = casesByDisorder.get(disorder.id) || [];
          return (
            <section className="case-group" key={disorder.id}>
              <span className="case-group-number" aria-hidden="true">
                {String(disorderIndex + 1).padStart(2, '0')}
              </span>
              <div className="case-group-heading">
                <div><span className="eyebrow">{disorder.category}</span><h2>{disorder.name}</h2></div>
                <button className="link-button" onClick={() => onOpenDisorder(disorder)}>
                  查看疾病词条 <ChevronRight size={15} />
                </button>
              </div>
              {cases.length ? (
                <div className="case-list">
                  {cases.map((item) => (
                    <CaseRow
                      canEdit={canEdit}
                      key={item.id}
                      item={item}
                      selected={selected?.id === item.id}
                      onSelect={selectCase}
                      onEdit={() => onEdit('cases', item)}
                      onDelete={() => onDelete('cases', item)}
                    />
                  ))}
                </div>
              ) : <p className="muted">还没有案例，点击右上角新增。</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
