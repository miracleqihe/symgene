import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Layers3, ShieldCheck, Globe2, MapPin } from 'lucide-react';
import KineticTitle from '../KineticTitle';
import PrevalenceMatrix from './PrevalenceMatrix';
import CorrelationScatter from './CorrelationScatter';
import EthnicityPanel from './EthnicityPanel';
import SpectrumLegend from './SpectrumLegend';
import ChinaResourceMap from './ChinaResourceMap';
import { SOURCES, DISCLAIMERS, DATA_VERSION } from '../../atlas/index.js';

const VIEWS = [
  { id: 'global', label: '全球图谱', icon: Globe2 },
  { id: 'china', label: '中国资源地图', icon: MapPin }
];

export default function DataAtlasPage({ focusOnMount, onPageFocused }) {
  const headerRef = useRef(null);
  const onPageFocusedRef = useRef(onPageFocused);
  onPageFocusedRef.current = onPageFocused;

  const [view, setView] = useState('global');
  const [yearIdx, setYearIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [diseaseKeys, setDiseaseKeys] = useState(['depressive']);
  const [stdMode, setStdMode] = useState('all');
  const [highlightLocIdx, setHighlightLocIdx] = useState(null);

  useEffect(() => {
    if (!focusOnMount) return undefined;
    const frame = window.requestAnimationFrame(() => {
      headerRef.current?.focus({ preventScroll: true });
      onPageFocusedRef.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnMount]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setYearIdx((current) => (current + 1) % 8);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className="page data-atlas-page page-enter">
      <header ref={headerRef} className="page-header page-header-mint" tabIndex={-1}>
        <div className="page-title-group">
          <span className="page-kicker">06 · DATA ATLAS</span>
          <KineticTitle as="h1" text="精神疾病数据图谱" mode="converge" replayKey="data-atlas" />
          <p>用流行病学数据观察精神疾病在全球的分布、变化，以及它与经济、医疗资源之间的关联。</p>
        </div>
        <div className="page-actions">
          <span className="count-label">204 个国家/地区 · 2016–2023 · 12 个疾病条目</span>
        </div>
      </header>

      <div className="atlas-view-tabs" role="tablist" aria-label="数据视图切换">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? 'atlas-view-tab active' : 'atlas-view-tab'}
            onClick={() => setView(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {view === 'china' ? (
        <ChinaResourceMap />
      ) : (
        <>
          <section className="atlas-intro" aria-labelledby="atlas-intro-title">
            <div>
              <span className="eyebrow">POPULATION DATA</span>
              <h2 id="atlas-intro-title">把看不见的负担画出来</h2>
              <p>
                精神疾病的负担很少被“看见”。这一页把来自 IHME 全球疾病负担研究（GBD 2023）的国家级患病率估计，
                与世界银行的经济数据、世界卫生组织的精神卫生系统指标放到同一张图里：
                每一行是一个国家或地区，每一列是一个年份；颜色越深，代表选中的疾病在人群中越常见；
                单元格下方的小柱越高，代表精神卫生服务的供给越充足。
              </p>
            </div>
            <div className="atlas-safety-note" role="note">
              <ShieldCheck size={19} aria-hidden="true" />
              <div>
                <strong>阅读前请了解</strong>
                <ul>
                  {DISCLAIMERS.slice(0, 3).map((line) => <li key={line.slice(0, 16)}>{line}</li>)}
                </ul>
              </div>
            </div>
          </section>

          <section className="atlas-main" aria-label="患病率时空矩阵与关联散点图">
            <PrevalenceMatrix
              yearIdx={yearIdx}
              setYearIdx={setYearIdx}
              playing={playing}
              setPlaying={setPlaying}
              diseaseKeys={diseaseKeys}
              setDiseaseKeys={setDiseaseKeys}
              stdMode={stdMode}
              setStdMode={setStdMode}
              highlightLocIdx={highlightLocIdx}
              onHighlightLoc={setHighlightLocIdx}
            />
            <CorrelationScatter
              yearIdx={yearIdx}
              diseaseKeys={diseaseKeys}
              stdMode={stdMode}
              highlightLocIdx={highlightLocIdx}
              onHighlightLoc={setHighlightLocIdx}
            />
          </section>

          <EthnicityPanel />

          <SpectrumLegend />
        </>
      )}

      <section className="atlas-sources" aria-labelledby="atlas-sources-title">
        <div>
          <span className="eyebrow">SOURCES</span>
          <h2 id="atlas-sources-title">数据从哪里来</h2>
          <p>所有数据均来自公开发表的权威数据库，可点击来源名称访问原始入口。</p>
        </div>
        <ol className="atlas-source-list">
          {SOURCES.map((source) => (
            <li key={source.id}>
              <div className="atlas-source-head">
                <a href={source.url} target="_blank" rel="noreferrer">{source.org}</a>
                <span className="atlas-source-label">{source.label}</span>
              </div>
              <p>{source.detail}</p>
              <p className="atlas-source-meta">覆盖：{source.coverage}</p>
              <p className="atlas-source-meta">使用条款：{source.license}</p>
            </li>
          ))}
        </ol>
        <p className="atlas-version">数据版本 {DATA_VERSION} · 本页为静态科普展示，数据不随用户输入变化，也不存储任何个人信息。</p>
      </section>
    </div>
  );
}
