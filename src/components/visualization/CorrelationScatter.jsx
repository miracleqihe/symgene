import React, { useMemo, useState } from 'react';
import { LOCS, DISEASES, pearson, linearFit } from '../../atlas/index.js';
import { SCATTER_DIMS, SCATTER_DIM_BY_ID, REGION_COLORS, REGION_ORDER_FOR_LEGEND } from '../../atlas/display.js';

const WIDTH = 560;
const HEIGHT = 400;
const MARGIN = { top: 24, right: 20, bottom: 52, left: 62 };
const YEAR0 = 2016;

const DIM_OPTIONS = SCATTER_DIMS.map((d) => ({ id: d.id, label: d.label }));

function transformValue(dim, value) {
  if (value === null || !Number.isFinite(value)) return null;
  return dim.log ? Math.log10(value) : value;
}

function formatTick(dim, value) {
  if (dim.log) return `${Math.round(10 ** value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Math.round(value * 10) / 10;
}

function axisText(dim, transformed) {
  const value = dim.log ? 10 ** transformed : transformed;
  if (dim.id === 'gdp') return `人均GDP ${Math.round(value).toLocaleString('en-US')} 美元`;
  if (dim.id === 'prevalence') return `患病率 ${value.toFixed(2)}%`;
  if (dim.id === 'suicide') return `自杀率 ${value.toFixed(1)}/10万`;
  if (dim.id === 'psychiatrists') return `精神科医生 ${value.toFixed(1)}/10万`;
  return `心理健康支出 ${value.toFixed(1)}%`;
}

function ticks(min, max) {
  const step = (max - min) / 4;
  if (!(step > 0)) return [min, max];
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const niceStep = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= step) ?? step * 10;
  const start = Math.ceil(min / niceStep) * niceStep;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += niceStep) out.push(Math.round(v * 1e6) / 1e6);
  return out.length ? out : [min, max];
}

export default function CorrelationScatter({ yearIdx, diseaseKeys, stdMode, highlightLocIdx, onHighlightLoc }) {
  const [xDimId, setXDimId] = useState('gdp');
  const [yDimId, setYDimId] = useState('prevalence');
  const xDim = SCATTER_DIM_BY_ID.get(xDimId);
  const yDim = SCATTER_DIM_BY_ID.get(yDimId);

  // 散点使用主图层（第一个选中的疾病）的患病率
  const primaryDiseaseIdx = useMemo(() => {
    const index = DISEASES.findIndex((d) => d.key === diseaseKeys[0]);
    return index === -1 ? DISEASES.findIndex((d) => d.key === 'depressive') : index;
  }, [diseaseKeys]);

  const points = useMemo(() => {
    const rows = [];
    LOCS.forEach((loc, locIdx) => {
      const x = transformValue(xDim, xDim.getValue(locIdx, yearIdx, primaryDiseaseIdx));
      const y = transformValue(yDim, yDim.getValue(locIdx, yearIdx, primaryDiseaseIdx));
      if (x === null || y === null) return;
      rows.push({ locIdx, loc, x, y });
    });
    return rows;
  }, [xDim, yDim, yearIdx, primaryDiseaseIdx]);

  const stats = useMemo(() => {
    const pairs = points.map((p) => [p.x, p.y]);
    const r = pearson(pairs);
    const fit = linearFit(pairs);
    return { r, fit, n: pairs.length };
  }, [points]);

  const domain = useMemo(() => {
    const extent = (values) => {
      if (!values.length) return [0, 1];
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.08;
      return [min - pad, max + pad];
    };
    return [extent(points.map((p) => p.x)), extent(points.map((p) => p.y))];
  }, [points]);

  const [xMin, xMax] = domain[0];
  const [yMin, yMax] = domain[1];
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const px = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const py = (y) => MARGIN.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const yearText = xDim.yearDependent || yDim.yearDependent ? `${YEAR0 + yearIdx} 年` : '快照值（不随年份变化）';
  const stdNote = stdMode === 'std' ? '年龄标准化' : '全年龄';

  return (
    <aside className="atlas-panel atlas-scatter-panel" aria-label="关联分析散点图">
      <div className="atlas-panel-head">
        <div>
          <span className="eyebrow">CORRELATION VIEW</span>
          <h2>关联分析副窗口</h2>
          <p className="atlas-panel-note">每个点是一个国家/地区；悬停可联动矩阵高亮。r 只描述相关，不构成因果结论。</p>
        </div>
      </div>

      <div className="atlas-axis-picker">
        <label>
          X 轴
          <select value={xDimId} onChange={(event) => setXDimId(event.target.value)}>
            {DIM_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Y 轴
          <select value={yDimId} onChange={(event) => setYDimId(event.target.value)}>
            {DIM_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <svg
        className="atlas-scatter-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${xDim.label}与${yDim.label}的散点图，共 ${stats.n} 个国家/地区，相关系数 ${stats.r === null ? '无法计算' : stats.r.toFixed(2)}`}
      >
        {ticks(yMin, yMax).map((tick) => (
          <g key={`y${tick}`}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={py(tick)} y2={py(tick)} className="atlas-gridline" />
            <text x={MARGIN.left - 8} y={py(tick) + 4} textAnchor="end" className="atlas-tick">{formatTick(yDim, tick)}</text>
          </g>
        ))}
        {ticks(xMin, xMax).map((tick) => (
          <g key={`x${tick}`}>
            <line x1={px(tick)} x2={px(tick)} y1={MARGIN.top} y2={MARGIN.top + plotH} className="atlas-gridline" />
            <text x={px(tick)} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle" className="atlas-tick">{formatTick(xDim, tick)}</text>
          </g>
        ))}

        {stats.r !== null && stats.fit && (
          <line
            x1={px(xMin)}
            y1={py(stats.fit.k * xMin + stats.fit.b)}
            x2={px(xMax)}
            y2={py(stats.fit.k * xMax + stats.fit.b)}
            className="atlas-fitline"
          />
        )}

        {points.map((point) => {
          const highlighted = highlightLocIdx === point.locIdx;
          return (
            <circle
              key={point.loc.iso3}
              cx={px(point.x)}
              cy={py(point.y)}
              r={highlighted ? 6.5 : 4}
              className={highlighted ? 'atlas-point highlighted' : 'atlas-point'}
              fill={REGION_COLORS[point.loc.regionLabel] ?? REGION_COLORS.其他}
              onMouseEnter={() => onHighlightLoc(point.locIdx)}
              onMouseLeave={() => onHighlightLoc(null)}
            >
              <title>{`${point.loc.zh}：${axisText(xDim, point.x)}，${axisText(yDim, point.y)}`}</title>
            </circle>
          );
        })}

        <text x={MARGIN.left + plotW / 2} y={HEIGHT - 8} textAnchor="middle" className="atlas-axis-title">
          {xDim.label}（{xDim.unit}）
        </text>
        <text
          x={14}
          y={MARGIN.top + plotH / 2}
          textAnchor="middle"
          className="atlas-axis-title"
          transform={`rotate(-90 14 ${MARGIN.top + plotH / 2})`}
        >
          {yDim.label}（{yDim.unit}）
        </text>
      </svg>

      <div className="atlas-scatter-stats" role="status">
        <span>Pearson r = {stats.r === null ? '—' : stats.r.toFixed(2)}</span>
        <span>n = {stats.n}</span>
        <span>{yearText} · {stdNote}</span>
      </div>

      <div className="atlas-region-legend" aria-hidden="true">
        {REGION_ORDER_FOR_LEGEND.filter((label) => points.some((p) => p.loc.regionLabel === label)).map((label) => (
          <span key={label}><i style={{ background: REGION_COLORS[label] }} />{label}</span>
        ))}
      </div>
    </aside>
  );
}
