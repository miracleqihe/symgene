import React, { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { DISORDER_CATEGORY_ORDER } from '../app/navigation.js';
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
  onOpenDisorder
}) {
  const detailRef = useRef(null);
  const selectedDisorder = selected
    ? data.disorders.find((item) => item.id === selected.disorderId)
    : null;

  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);

  const disorders = [...data.disorders].sort((a, b) => {
    const ai = DISORDER_CATEGORY_ORDER.indexOf(a.category);
    const bi = DISORDER_CATEGORY_ORDER.indexOf(b.category);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
  });

  return (
    <div className="page library-page page-enter">
      <PageHeader
        canEdit={canEdit}
        eyebrow="CASE NOTES"
        title="案例分析"
        description="按疾病词条分组的教学性案例，用于练习观察、评估与沟通。"
        count={data.cases.length + ' 个案例'}
        onAdd={() => onAdd('cases')}
        addLabel="新增案例"
      />
      {selected && (
        <CaseDetail
          canEdit={canEdit}
          detailRef={detailRef}
          item={selected}
          disorder={selectedDisorder}
          onEdit={() => onEdit('cases', selected)}
          onDelete={() => onDelete('cases', selected)}
        />
      )}
      <div className="case-groups">
        {disorders.map((disorder) => {
          const cases = data.cases.filter((item) => item.disorderId === disorder.id);
          return (
            <section className="case-group" key={disorder.id}>
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
                      onSelect={onSelect}
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
