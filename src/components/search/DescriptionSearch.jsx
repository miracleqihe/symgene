import React from 'react';
import { ArrowUpRight, FlaskConical, Search, ShieldCheck, X } from 'lucide-react';
import { typeLabels } from '../../data.js';

function SearchGroup({ label, note, children }) {
  return (
    <section className="search-group">
      <div className="search-group-heading"><strong>{label}</strong><span>{note}</span></div>
      {children}
    </section>
  );
}

function SearchResult({ type, item, hits, onOpen }) {
  const title = item.name || item.title;
  const subtitle = type === 'cases' ? item.stage : type === 'drugs' ? item.aliases : item.category;
  return (
    <button className="search-result" onClick={() => onOpen(type, item)}>
      <span className={'result-type ' + type}>{typeLabels[type]}</span>
      <span className="result-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
        {hits?.length > 0 && <em>命中：{hits.join('、')}</em>}
      </span>
      <ArrowUpRight size={17} />
    </button>
  );
}

export function DescriptionSearch({ query, setQuery, results, onOpen, searchInputRef }) {
  const hasKnowledge = results.disorders.length || results.cases.length || results.drugs.length;
  return (
    <section className="search-block description-search">
      <div className="section-heading">
        <div><span className="eyebrow">描述式检索</span><h2>把正在经历的情况写下来</h2></div>
        <span className="section-index">01 / 05</span>
      </div>
      <div className="search-wrap">
        <Search size={19} />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：三个月都很累，早醒，不想见人"
          aria-label="描述你正在经历的情况"
        />
        {query && (
          <button className="clear-search" onClick={() => setQuery('')} aria-label="清除描述">
            <X size={16} />
          </button>
        )}
        <kbd>Ctrl/⌘ K</kbd>
      </div>
      {query && (
        <div className="search-results search-results-rich">
          {results.risk && (
            <div className={'risk-banner ' + results.risk.level}>
              <ShieldCheck size={18} />
              <div><strong>{results.risk.labels.join(' · ')}</strong><p>{results.risk.message}</p></div>
            </div>
          )}
          {results.disorders.length > 0 && (
            <SearchGroup label="可能相关的疾病线索" note="按症状、时间线和功能影响排序">
              <div className="search-result-list">
                {results.disorders.map(({ item, hits }) => (
                  <SearchResult key={'disorder-' + item.id} type="disorders" item={item} hits={hits} onOpen={onOpen} />
                ))}
              </div>
            </SearchGroup>
          )}
          {results.cases.length > 0 && (
            <SearchGroup label="相似案例" note="用于理解评估重点，不代表与你相同">
              <div className="search-result-list">
                {results.cases.map(({ item, hits }) => (
                  <SearchResult key={'case-' + item.id} type="cases" item={item} hits={hits} onOpen={onOpen} />
                ))}
              </div>
            </SearchGroup>
          )}
          {results.drugs.length > 0 && (
            <SearchGroup label="关联治疗与药物资料" note="来自已匹配的疾病线索，仅供阅读">
              <div className="search-result-list">
                {results.drugs.map((item) => (
                  <SearchResult key={'drug-' + item.id} type="drugs" item={item} hits={[item.categoryLabel]} onOpen={onOpen} />
                ))}
              </div>
            </SearchGroup>
          )}
          {results.directDrugHint && (
            <div className="search-hint">
              <FlaskConical size={16} />
              <span>你输入了药物名称。心鉴先从疾病和案例解释它可能出现的治疗语境；完整药物分类请打开“药物”目录查看。</span>
            </div>
          )}
          {!hasKnowledge && !results.risk && !results.directDrugHint && (
            <div className="empty-search">
              暂时没有足够的匹配线索。可以补充持续多久、睡眠/精力变化，以及对工作或关系的影响。
            </div>
          )}
        </div>
      )}
    </section>
  );
}
