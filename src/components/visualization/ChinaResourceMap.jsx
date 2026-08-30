import React, { useMemo, useState } from 'react';
import { MapPin, ShieldCheck, Database, Search } from 'lucide-react';
import {
  PROVINCES, INSTITUTIONS, INSTITUTIONS_BY_PROVINCE, CATEGORY_COUNTS,
  PROVINCE_RESOURCE_YEAR,
  SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS,
  CHINA_CATEGORY_ORDER, CHINA_CATEGORY_COLORS,
  quantileShade, withAlpha, project, computeScore
} from '../../atlas/china/index.js';

const MAP_W = 740;
const MAP_H = 600;
const STEPS = 5;

const METRICS = [
  { id: 'count', label: '收录机构数（持续更新）', get: (p) => p.institutionCount, unit: '家' },
  { id: 'beds', label: `开放床位（${PROVINCE_RESOURCE_YEAR}）`, get: (p) => p.openBeds, unit: '张' },
  { id: 'blank', label: `空白区县率（${PROVINCE_RESOURCE_YEAR}）`, get: (p) => p.blankCountyRate, unit: '%' }
];

const SOURCE_LABELS = { osm: 'OpenStreetMap', curated: '人工核校名录' };

function pathFor(polygons) {
  return polygons
    .map((ring) => ring
      .map(([lng, lat], index) => {
        const [x, y] = project(lng, lat);
        return `${index === 0 ? 'M' : 'L'}${(x * MAP_W).toFixed(1)} ${(y * MAP_H).toFixed(1)}`;
      })
      .join(' ') + 'Z')
    .join(' ');
}

function fmt(value, unit) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('zh-Hans')} ${unit}`;
}

export default function ChinaResourceMap() {
  const [metricId, setMetricId] = useState('count');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [selectedInstId, setSelectedInstId] = useState(null);

  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0];
  const metricMax = useMemo(
    () => Math.max(...PROVINCES.map((p) => metric.get(p) ?? 0), 1),
    [metric]
  );

  const filteredInstitutions = useMemo(() => {
    const q = query.trim();
    return INSTITUTIONS.filter((inst) => {
      if (categoryFilter && inst.category !== categoryFilter) return false;
      if (selectedProvince && inst.province !== selectedProvince) return false;
      if (q && !inst.name.includes(q)) return false;
      return true;
    });
  }, [categoryFilter, query, selectedProvince]);

  const selectedInst = useMemo(
    () => INSTITUTIONS.find((inst) => inst.id === selectedInstId) ?? null,
    [selectedInstId]
  );

  const visibleProvinceNames = useMemo(
    () => new Set(filteredInstitutions.map((inst) => inst.province)),
    [filteredInstitutions]
  );

  const provincePanelList = useMemo(() => {
    const rows = PROVINCES.filter((p) => p.institutionCount > 0 || p.openBeds !== null);
    return selectedProvince ? rows.filter((p) => p.name === selectedProvince) : rows;
  }, [selectedProvince]);

  return (
    <section className="atlas-panel china-map-panel" aria-label="中国心理治疗资源地图">
      <div className="atlas-panel-head">
        <div>
          <span className="eyebrow">CHINA RESOURCE MAP</span>
          <h2>中国心理治疗资源地图</h2>
          <p className="atlas-panel-note">
            地图按省份着色，圆点为收录的心理健康机构。点击省份或机构查看明细；
            机构名录来自 OpenStreetMap 与人工核校的知名专科机构（持续补充中），分省床位等公开统计截至 2015 年底。
          </p>
        </div>
      </div>

      <div className="china-controls">
        <div className="china-metric-toggle" role="group" aria-label="着色指标">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metricId === m.id}
              onClick={() => setMetricId(m.id)}
            >{m.label}</button>
          ))}
        </div>
        <label className="china-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="搜索机构名称"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索机构名称"
          />
        </label>
      </div>

      <div className="china-category-filter" role="group" aria-label="按机构类别筛选">
        <button
          type="button"
          className={categoryFilter === null ? 'atlas-chip active' : 'atlas-chip'}
          aria-pressed={categoryFilter === null}
          onClick={() => setCategoryFilter(null)}
        >全部（{INSTITUTIONS.length}）</button>
        {CATEGORY_COUNTS.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={categoryFilter === cat.id ? 'atlas-chip active' : 'atlas-chip'}
            aria-pressed={categoryFilter === cat.id}
            onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
          >
            <i style={{ background: CHINA_CATEGORY_COLORS[cat.id] }} aria-hidden="true" />
            {cat.label}（{cat.count}）
          </button>
        ))}
      </div>

      <div className="china-map-layout">
        <div className="china-map-holder">
          <svg
            className="china-map-svg"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            role="img"
            aria-label={`中国地图，按${metric.label}着色，共标注 ${filteredInstitutions.length} 家机构`}
          >
            {PROVINCES.map((province) => {
              const value = metric.get(province);
              const dimmed = visibleProvinceNames.size > 0 && !visibleProvinceNames.has(province.name);
              const step = value === null || value === undefined ? 0 : quantileShade(value, metricMax, STEPS);
              const shade = metricId === 'blank'
                ? withAlpha('#c26d5a', 0.1 + 0.75 * (step / (STEPS - 1)))
                : withAlpha('#4f948b', 0.12 + 0.72 * (step / (STEPS - 1)));
              const selected = selectedProvince === province.name;
              return (
                <path
                  key={province.adcode}
                  d={pathFor(province.polygons)}
                  fill={dimmed ? 'rgba(48, 91, 96, 0.06)' : shade}
                  stroke={selected ? '#103842' : 'rgba(255, 253, 248, 0.85)'}
                  strokeWidth={selected ? 1.6 : 0.7}
                  className="china-province"
                  onMouseEnter={(event) => { event.currentTarget.style.filter = 'brightness(0.94)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.filter = ''; }}
                  onClick={() => setSelectedProvince(selected ? null : province.name)}
                >
                  <title>{`${province.name}：${metric.label} ${fmt(value, metric.unit)}｜收录机构 ${province.institutionCount} 家${selected ? '（已选中，再次点击取消）' : ''}`}</title>
                </path>
              );
            })}
            {filteredInstitutions.map((inst) => {
              const [x, y] = project(inst.lng, inst.lat);
              const selected = selectedInstId === inst.id;
              return (
                <circle
                  key={inst.id}
                  cx={(x * MAP_W).toFixed(1)}
                  cy={(y * MAP_H).toFixed(1)}
                  r={selected ? 5 : 2.6}
                  className="china-inst-point"
                  fill={CHINA_CATEGORY_COLORS[inst.category] ?? '#7d8896'}
                  stroke={selected ? '#103842' : 'rgba(255, 253, 248, 0.9)'}
                  strokeWidth={selected ? 1.6 : 0.8}
                  onClick={() => setSelectedInstId(selected ? null : inst.id)}
                >
                  <title>{`${inst.name}（${inst.categoryLabel}）｜${inst.province}`}</title>
                </circle>
              );
            })}
          </svg>
          <p className="china-map-legend">
            <span><i className="china-legend-block" aria-hidden="true" style={{ background: 'rgba(79, 148, 139, .18)' }} />少</span>
            <i className="china-legend-gradient" aria-hidden="true" style={{ background: 'linear-gradient(90deg, rgba(79,148,139,.18), rgba(79,148,139,.84))' }} />
            <span>多（{metric.label}，{metric.unit}）</span>
            {metricId === 'blank' && <span className="china-legend-note">空白区县率使用珊瑚色：颜色越深，无精神卫生资源的区县越多</span>}
          </p>
        </div>

        <aside className="china-side" aria-label="机构明细与统计">
          {selectedInst ? (
            <article className="china-inst-card" aria-label="机构详情">
              <header>
                <MapPin size={15} aria-hidden="true" />
                <h3>{selectedInst.name}</h3>
              </header>
              <dl>
                <dt>类别</dt><dd>{selectedInst.categoryLabel}</dd>
                <dt>地区</dt><dd>{selectedInst.province}{selectedInst.city ? ` · ${String(selectedInst.city).slice(0, 24)}` : ''}</dd>
                <dt>综合评分</dt><dd><b className="china-score-pending">待数据接入</b></dd>
                <dt>大众口碑</dt><dd>待接入（社交平台聚合）</dd>
                <dt>资源设备</dt><dd>待接入（卫健委登记信息）</dd>
                <dt>专业度</dt><dd>待接入（公开介绍文本抽取）</dd>
                <dt>擅长方向</dt><dd>待接入</dd>
                <dt>坐标精度</dt><dd>{selectedInst.precision === 'city' ? '市级质心（未精确定位）' : '已核校'}</dd>
                <dt>数据来源</dt><dd>{SOURCE_LABELS[selectedInst.source] ?? selectedInst.source}</dd>
              </dl>
              <button type="button" className="china-card-close" onClick={() => setSelectedInstId(null)}>收起详情</button>
            </article>
          ) : (
            <div className="china-stats" aria-label="统计面板">
              <div className="china-stat-row">
                <span className="china-stat-num">{filteredInstitutions.length}</span>
                <span className="china-stat-label">当前筛选机构</span>
              </div>
              <div className="china-stat-row">
                <span className="china-stat-num">{visibleProvinceNames.size}</span>
                <span className="china-stat-label">覆盖省级地区</span>
              </div>
              <div className="china-stat-row">
                <span className="china-stat-num">32</span>
                <span className="china-stat-label">地图覆盖省级地区</span>
              </div>
              <p className="china-stats-note">
                评分模型已就绪（口碑 40% + 资源 30% + 专业度 30%）；
                口碑数据接入前，所有机构评分显示为“待数据接入”，不做无依据估算。
              </p>
            </div>
          )}

          <div className="china-province-list" role="list" aria-label="各省收录机构数">
            <div className="china-province-list-head">
              <span>{selectedProvince ? `${selectedProvince}（点击取消）` : '各省级地区'}</span>
              <span>收录 / 2015床位</span>
            </div>
            <div className="china-province-list-body" tabIndex={0}>
              {provincePanelList.map((province) => {
                const list = INSTITUTIONS_BY_PROVINCE.get(province.name) ?? [];
                return (
                  <div key={province.adcode} role="listitem">
                    <button
                      type="button"
                      className={selectedProvince === province.name ? 'china-province-row selected' : 'china-province-row'}
                      onClick={() => setSelectedProvince(selectedProvince === province.name ? null : province.name)}
                    >
                      <span>{province.name}</span>
                      <small>{province.institutionCount} 家 · {province.openBeds === null ? '—' : `${province.openBeds} 张`}</small>
                    </button>
                    {selectedProvince === province.name && list.length > 0 && (
                      <ul className="china-inst-list">
                        {list.map((inst) => (
                          <li key={inst.id}>
                            <button
                              type="button"
                              className={selectedInstId === inst.id ? 'china-inst-row selected' : 'china-inst-row'}
                              onClick={() => setSelectedInstId(inst.id)}
                            >
                              <i style={{ background: CHINA_CATEGORY_COLORS[inst.category] }} aria-hidden="true" />
                              <span>{inst.name}</span>
                              <small>{inst.categoryLabel}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <div className="china-score-panel" aria-labelledby="china-score-title">
        <div className="china-score-head">
          <Database size={16} aria-hidden="true" />
          <h3 id="china-score-title">综合评分模型（{SCORING_MODEL.version}）</h3>
        </div>
        <p className="china-score-formula">{SCORING_MODEL.formula}</p>
        <div className="china-score-dims">
          {SCORING_MODEL.dims.map((dim) => (
            <article key={dim.id} className="china-score-dim">
              <header>
                <strong>{dim.label}</strong>
                <span className="china-score-status" data-status={dim.status}>
                  {dim.status === 'pending' ? '待数据接入' : '部分可用'}
                </span>
              </header>
              <p>{dim.fields}</p>
              <p className="china-score-note">{dim.note}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="china-social-note" role="note">
        <ShieldCheck size={17} aria-hidden="true" />
        <p>
          <strong>口碑数据的来源与边界：</strong>{SOCIAL_CRAWL_STATUS.method}
          当前状态：{SOCIAL_CRAWL_STATUS.note}
        </p>
      </div>

      <div className="china-facts" aria-label="理解中国精神卫生的四个事实">
        {CHINA_FACTS.map((fact) => (
          <article key={fact.id} className={`china-fact-card tone-${fact.tone}`}>
            <h3>{fact.title}</h3>
            <p>{fact.body}</p>
            <small>来源：{fact.source}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
