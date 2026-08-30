import React, { useMemo, useState } from 'react';
import { MapPin, ShieldCheck, Database, Search } from 'lucide-react';
import {
  PROVINCES, INSTITUTIONS, INSTITUTIONS_BY_PROVINCE, CATEGORY_COUNTS,
  PROVINCE_RESOURCE_YEAR,
  SCORING_MODEL, CHINA_FACTS, SOCIAL_CRAWL_STATUS,
  CHINA_CATEGORY_ORDER, CHINA_CATEGORY_COLORS,
  SOCIAL_REPUTATION_META, getReputation, SERVICE_2025,
  NATIONAL_TREND,
  quantileShade, withAlpha, project, computeScore
} from '../../atlas/china/index.js';
import { DATA_VERSION } from '../../atlas/sources.js';

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
  const [showReviews, setShowReviews] = useState(false);

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
                <dt>大众口碑</dt>
                <dd>
                  {selectedReputation?.reputationScore != null
                    ? <b className="china-rep-score">{selectedReputation.reputationScore} / 100</b>
                    : '待接入'}
                  {selectedReputation?.reputationScore != null && <small className="china-rep-note">好评词占比，非平台评分</small>}
                </dd>
                <dt>讨论热度</dt>
                <dd>
                  {selectedReputation
                    ? `${selectedReputation.mentions} 篇笔记 · ${selectedReputation.commentCount.toLocaleString('zh-Hans')} 条评论`
                    : '暂无匹配讨论'}
                </dd>
                <dt>资源设备</dt><dd>待接入（卫健委登记信息）</dd>
                <dt>专业度</dt><dd>待接入（公开介绍文本抽取）</dd>
                <dt>擅长方向</dt><dd>待接入</dd>
                <dt>坐标精度</dt><dd>{selectedInst.precision === 'city' ? '市级质心（未精确定位）' : '已核校'}</dd>
                <dt>数据来源</dt><dd>{SOURCE_LABELS[selectedInst.source] ?? selectedInst.source}</dd>
                <dt>数据更新</dt><dd>{DATA_VERSION}</dd>
              </dl>
              {selectedReputation?.notesList?.length > 0 && (
                <div className="china-reviews">
                  <button
                    type="button"
                    className="china-reviews-toggle"
                    aria-expanded={showReviews}
                    onClick={() => setShowReviews(!showReviews)}
                  >
                    {showReviews ? '收起评价' : `查看公开评价（${selectedReputation.notesList.length} 篇）`}
                  </button>
                  {showReviews && (
                    <ul className="china-review-list">
                      {selectedReputation.notesList.map((review) => (
                        <li key={review.url || review.title}>
                          <a href={review.url} target="_blank" rel="noreferrer">{review.title}</a>
                          <small>
                            {review.date ?? '日期不详'} · {review.liked.toLocaleString('zh-Hans')} 赞
                            {review.pos > 0 && <b className="china-review-pos"> 好评词 {review.pos}</b>}
                            {review.neg > 0 && <b className="china-review-neg"> 差评词 {review.neg}</b>}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="china-review-disclaimer">
                    以上为小红书公开笔记的标题与链接（观点属原作者），不涉及任何用户身份信息；
                    好评/差评为关键词命中，仅供参考。
                  </p>
                </div>
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
          {SOCIAL_REPUTATION_META.noteCount > 0
            ? `当前已接入小红书首批公开讨论（更新于 ${SOCIAL_REPUTATION_META.updatedAt}，覆盖 ${SOCIAL_REPUTATION_META.noteCount} 篇笔记、${SOCIAL_REPUTATION_META.commentCount.toLocaleString('zh-Hans')} 条评论），微博/抖音批次待采集。口碑分=好评词命中占比（0–100），样本不足时不评分。`
            : `当前状态：${SOCIAL_CRAWL_STATUS.note}`}
        </p>
      </div>

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
    </section>
  );
}
