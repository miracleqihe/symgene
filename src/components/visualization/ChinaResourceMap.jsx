import React, { useMemo, useState } from 'react';
import { MapPin, ShieldCheck, Database, Search, Layers } from 'lucide-react';
import {
  PROVINCES, INSTITUTIONS, INSTITUTIONS_BY_PROVINCE, CATEGORY_COUNTS,
  PROVINCE_RESOURCE_YEAR,
  SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS,
  CHINA_CATEGORY_ORDER, CHINA_CATEGORY_COLORS,
  SOCIAL_REPUTATION_META, SOCIAL_REPUTATION, getReputation, SERVICE_2025,
  NATIONAL_TREND,
  quantileShade, withAlpha, project, computeScore, SOUTH_CHINA_SEA, CHINA_MAP_ASPECT
} from '../../atlas/china/index.js';
import { DATA_VERSION } from '../../atlas/sources.js';

// 等经纬投影画布：宽高比须为 (136-73)·cos36° : (54.5-17.5) ≈ 827:600，
// 否则东缘会被裁出画布（旧版 MAP_W=740 即有此缺陷）。
const MAP_H = 600;
const MAP_W = Math.round(MAP_H * CHINA_MAP_ASPECT);
const STEPS = 5;

// 南海诸岛附图（右下角）：覆盖三沙市全域（约 lng 105-122，lat 2-21）。
const INSET = { x: MAP_W - 176, y: MAP_H - 196, w: 168, h: 188 };
const INSET_LNG = [105, 122.5];
const INSET_LAT = [2, 21];
function projectInset(lng, lat) {
  const x = INSET.x + 8 + ((lng - INSET_LNG[0]) / (INSET_LNG[1] - INSET_LNG[0])) * (INSET.w - 16);
  const y = INSET.y + INSET.h - 20 - ((lat - INSET_LAT[0]) / (INSET_LAT[1] - INSET_LAT[0])) * (INSET.h - 34);
  return [x, y];
}

const METRICS = [
  { id: 'count', label: '收录机构数（持续更新）', get: (p) => p.institutionCount, unit: '家' },
  { id: 'beds', label: `开放床位（${PROVINCE_RESOURCE_YEAR}）`, get: (p) => p.openBeds, unit: '张' },
  { id: 'blank', label: `空白区县率（${PROVINCE_RESOURCE_YEAR}）`, get: (p) => p.blankCountyRate, unit: '%' }
];

const LAYERS = [
  { id: 'map', label: '地图概览' },
  { id: 'scoring', label: '评分与口碑' },
  { id: 'trend', label: '趋势与背景' }
];

// 非医学服务维度（与审阅队列 annotationSchema.aspects 一致）
const ASPECT_LABELS = {
  access_and_wait: '挂号与等待',
  cost_and_billing: '费用与结算',
  staff_interaction: '医患沟通',
  process_and_information: '流程与告知',
  environment_and_facilities: '环境与设施',
  continuity_and_follow_up: '复诊与连续性',
  self_reported_outcome: '自述结果',
  other: '其他'
};

const SOURCE_LABELS = { osm: 'OpenStreetMap', curated: '人工核校名录', amap: '高德地图开放平台', nominatim: 'OSM Nominatim 检索' };

function pathFor(polygons, projectFn = project, w = 1, h = 1) {
  return polygons
    .map((ring) => ring
      .map(([lng, lat], index) => {
        const [x, y] = projectFn(lng, lat);
        return `${index === 0 ? 'M' : 'L'}${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`;
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
  const [layer, setLayer] = useState('map');

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
  const selectedReputation = selectedInst ? getReputation(selectedInst.name) : null;
  const [expandedRepName, setExpandedRepName] = useState(null);

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

      <div className="china-layer-tabs" role="tablist" aria-label="地图内容分层">
        {LAYERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`china-layer-tab-${id}`}
            aria-controls={`china-layer-panel-${id}`}
            aria-selected={layer === id}
            className={layer === id ? 'china-layer-tab active' : 'china-layer-tab'}
            onClick={() => setLayer(id)}
          >
            <Layers size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {layer === 'map' && (
        <div role="tabpanel" id="china-layer-panel-map" aria-labelledby="china-layer-tab-map">
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
                      d={pathFor(province.polygons, project, MAP_W, MAP_H)}
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
                {/* 南海诸岛附图（右下角，覆盖三沙市全域，数据源见 chinaSeaGeo.js） */}
                <g role="img" aria-label="南海诸岛附图">
                  <rect
                    x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h}
                    fill="var(--paper, #fffdf8)" stroke="rgba(48, 91, 96, .3)" strokeWidth="1"
                  />
                  {SOUTH_CHINA_SEA.polygons.map((ring, i) => (
                    <path
                      key={i}
                      d={pathFor([ring], projectInset, 1, 1)}
                      fill="rgba(79, 148, 139, .45)"
                      stroke="rgba(48, 91, 96, .45)"
                      strokeWidth="0.5"
                    />
                  ))}
                  <text
                    x={INSET.x + INSET.w / 2} y={INSET.y + INSET.h - 7}
                    textAnchor="middle" fontSize="11" fill="var(--ink-strong, #1c2b2e)"
                  >南海诸岛</text>
                </g>
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
                    <dt>{SOCIAL_REPUTATION_META.scorePolicy?.scoreName ?? '服务体验倾向分'}</dt>
                    <dd>
                      {selectedReputation?.serviceScore != null
                        ? <b className="china-rep-score">{selectedReputation.serviceScore} / 100</b>
                        : <b className="china-score-pending">
                            {selectedReputation?.reviewStatus === 'profile_published' ? '达标维度不足，暂不合成总分' : '样本不足，暂不评分'}
                          </b>}
                      {selectedReputation && (
                        <small className="china-rep-note">
                          经人工核对的就医评论 {selectedReputation.mentions ?? 0} 条；不足 20 条时不生成统计，避免误导
                          {selectedReputation.mentions > 0 && (
                            <>
                              <br />
                              其中 {selectedReputation.strict} 条为评论中直接提到机构，{selectedReputation.relaxed} 条依据发帖上下文判断
                            </>
                          )}
                        </small>
                      )}
                    </dd>
                  </dl>

                  {selectedReputation?.mentions > 0 && (
                    <div className="china-polarity">
                      <span className="china-pol china-pol-pos">正面 {selectedReputation.polarity.positive}</span>
                      <span className="china-pol china-pol-neg">负面 {selectedReputation.polarity.negative}</span>
                      <span className="china-pol china-pol-neu">中性 {selectedReputation.polarity.neutral}</span>
                    </div>
                  )}

                  {SOCIAL_REPUTATION_META.scorePolicy && (
                    <p className="china-rep-policy">
                      {SOCIAL_REPUTATION_META.scorePolicy.formula}
                      <br />
                      <b>读法提醒：</b>{SOCIAL_REPUTATION_META.scorePolicy.reason}
                    </p>
                  )}

                  {selectedReputation?.dimensionScores && Object.keys(selectedReputation.dimensionScores).length > 0 && (
                    <div className="china-dimensions">
                      <h4>非医学服务维度（经人工逐条审阅）</h4>
                      <div className="china-dim-grid">
                        {Object.entries(selectedReputation.dimensionScores).map(([aspect, d]) => (
                          <div className="china-dim-item" key={aspect}>
                            <span className="china-dim-label">{ASPECT_LABELS[aspect] ?? aspect}</span>
                            <span className="china-dim-score">
                              {d.score != null ? `${d.score} / 100` : '—'}
                            </span>
                            <small className="china-dim-detail">
                              {d.n} 条提及 · {d.positive} 正 / {d.negative} 负 / {d.neutral} 中
                              {d.suppressed ? ` · ${d.suppressed}，不评分` : ''}
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <dl className="china-metadata">
                    <dt>就医评论</dt>
                    <dd>
                      {selectedReputation
                        ? `${selectedReputation.mentions ?? 0} 条经人工核对${selectedReputation.mentions > 0 ? '（可在“评分与口碑”分层展开查看）' : ''}`
                        : '暂无经核对的公开评论'}
                    </dd>
                    {selectedReputation?.byPlatform && Object.keys(selectedReputation.byPlatform).length > 0 && (
                      <>
                        <dt>来源平台</dt>
                        <dd>{Object.entries(selectedReputation.byPlatform).map(([p, n]) => `${p} ${n} 条`).join(' · ')}</dd>
                      </>
                    )}
                    <dt>坐标精度</dt><dd>{selectedInst.precision === 'city' ? '市级质心（未精确定位）' : '已核校'}</dd>
                    <dt>机构来源</dt><dd>{SOURCE_LABELS[selectedInst.source] ?? selectedInst.source}</dd>
                    <dt>数据更新</dt><dd>{DATA_VERSION}</dd>
                  </dl>
                  {selectedReputation && (
                    <p className="china-review-disclaimer">
                      展示的评论内容均已隐去姓名、账号等隐私信息，不提供原帖链接。
                      每条评论在收录前都经人工核对（确认就医经历真实、不含可识别信息），
                      评论仅代表个人经历，不构成就医推荐。
                    </p>
                  )}
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
                    <span className="china-stat-num">{PROVINCES.length}</span>
                    <span className="china-stat-label">地图覆盖省级地区</span>
                  </div>
                  <p className="china-stats-note">
                    评分模型已就绪（口碑 40% + 资源 30% + 专业度 30%）；
                    口碑数据接入前，所有机构评分显示为“待数据接入”，不做无依据估算。
                    评分与口碑明细见“评分与口碑”分层。
                  </p>
                </div>
              )}

              <div className="china-province-list" role="list" aria-label="各省收录机构数">
                <div className="china-province-list-head">
                  <span>{selectedProvince ? `${selectedProvince}（点击取消）` : '各省级地区'}</span>
                  <span>收录 / {PROVINCE_RESOURCE_YEAR}床位</span>
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
        </div>
      )}

      {layer === 'scoring' && (
        <div role="tabpanel" id="china-layer-panel-scoring" aria-labelledby="china-layer-tab-scoring">
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

          {SOCIAL_REPUTATION_META.review && (
            <div className="china-review-progress" aria-labelledby="china-review-progress-title">
              <div className="china-score-head">
                <ShieldCheck size={16} aria-hidden="true" />
                <h3 id="china-review-progress-title">评论口碑（逐条核对后的匿名就医反馈）</h3>
              </div>
              <p className="china-panel-note-small">
                下面每条评论都先经人工逐条核对——确认是真实的就医经历、且不含姓名与联系方式等隐私，
                才匿名展示。评论太少的机构只给数量、不出统计，以免少数几条声音被放大成整体印象。
              </p>
              <ul className="china-rep-list">
                {Object.entries(SOCIAL_REPUTATION).map(([name, agg]) => {
                  const open = expandedRepName === name;
                  const snippets = agg.snippets ?? [];
                  return (
                    <li key={name} className="china-rep-row" data-open={open || undefined}>
                      <button
                        type="button"
                        className="china-rep-row-toggle"
                        aria-expanded={open}
                        onClick={() => setExpandedRepName(open ? null : name)}
                      >
                        <span className="china-rep-row-name">{name}</span>
                        <small className="china-rep-row-meta">
                          {agg.mentions > 0
                            ? `${agg.mentions} 条核对通过的评论，点击查看`
                            : '暂无核对通过的公开评论'}
                        </small>
                        <span className="china-rep-row-dims" aria-hidden="true">
                          {Object.entries(agg.aspects ?? {}).slice(0, 4).map(([aspect, n]) => (
                            <span key={aspect} className="china-rep-dim-pill">{ASPECT_LABELS[aspect] ?? aspect} {n}</span>
                          ))}
                        </span>
                        <b className="china-rep-score">
                          {agg.serviceScore != null ? `${agg.serviceScore} 分` : (agg.mentions > 0 ? `${agg.mentions} 条` : '—')}
                        </b>
                        {agg.serviceScore != null && <span className="visually-hidden">{agg.serviceScore} / 100</span>}
                      </button>
                      {open && (
                        <div className="china-rep-comments">
                          {snippets.length === 0 && (
                            <p className="china-rep-empty">
                              暂无通过人工核对的公开评论。该机构在公开平台上的讨论量还很少，
                              或现有内容含隐私信息、不构成可核对的就医经历，按规则不予展示。
                            </p>
                          )}
                          {snippets.map((s, i) => (
                            <blockquote key={i} className="china-rep-snippet" data-overall={s.overall}>
                              <p>{s.text}</p>
                              <footer>
                                <span>{s.experience}</span>
                                <span>{s.platform}</span>
                                <span>{(s.aspects ?? []).map((a) => ASPECT_LABELS[a] ?? a).join(' · ')}</span>
                              </footer>
                            </blockquote>
                          ))}
                          {snippets.length > 0 && (
                            <p className="china-rep-empty">
                              以上内容已隐去姓名、账号等隐私信息，不提供原帖链接。
                              评论为个人经历，不代表机构整体水平，不构成就医推荐。
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="china-social-note" role="note">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              <strong>评论数据的来源与边界：</strong>{SOCIAL_CRAWL_STATUS.method}
              {' '}{SOCIAL_REPUTATION_META.statusNote}
            </p>
          </div>
        </div>
      )}

      {layer === 'trend' && (
        <div role="tabpanel" id="china-layer-panel-trend" aria-labelledby="china-layer-tab-trend">
          <div className="china-trend" aria-labelledby="china-trend-title">
            <div className="china-score-head">
              <Database size={16} aria-hidden="true" />
              <h3 id="china-trend-title">全国口径趋势：精神病医院数量（{NATIONAL_TREND.unit}）</h3>
            </div>
            <div className="china-trend-bars">
              {NATIONAL_TREND.rows.map((row) => {
                const max = Math.max(...NATIONAL_TREND.rows.map((r) => r.hospitals ?? 0));
                const fmtWan = (v) => v == null ? '—' : `${(v / 10000).toFixed(v >= 60000 ? 1 : 2)} 万`;
                return (
                  <div key={row.year} className="china-trend-row">
                    <span className="china-trend-year">
                      {row.year} <i className="china-trend-level" data-level={row.level} aria-hidden="true" />
                    </span>
                    <span className="china-trend-bar" aria-hidden="true">
                      {row.hospitals !== null && <i style={{ width: `${Math.round((row.hospitals / max) * 100)}%` }} />}
                    </span>
                    <span className="china-trend-value">
                      {row.hospitals !== null ? `${row.hospitals.toLocaleString('zh-Hans')} 家` : '待官方值'}
                      <small> · 医师 {fmtWan(row.physicians)} · 护士 {fmtWan(row.nurses)}{row.bedsMentalHospitals ? ` · 床位 ${(row.bedsMentalHospitals / 10000).toFixed(1)} 万` : ''}</small>
                    </span>
                    {row.note && <span className="china-trend-note">{row.note}</span>}
                  </div>
                );
              })}
            </div>
            <div className="china-service-2025">
              <strong>2025 年服务建设结果（国家卫健委）</strong>
              <ul>
                {SERVICE_2025.items.map((item) => (
                  <li key={item.label}><span>{item.label}</span>{item.value}</li>
                ))}
              </ul>
              <p className="china-trend-source">{SERVICE_2025.source}</p>
            </div>
            <p className="china-trend-source">来源：{NATIONAL_TREND.source}。注意口径：此处为精神病医院专科口径；广义“精神卫生机构”（含综合医院精神科等）2020 年为 5,936 家。</p>
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
        </div>
      )}
    </section>
  );
}
