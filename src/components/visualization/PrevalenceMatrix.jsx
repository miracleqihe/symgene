import React, { useMemo, useState } from 'react';
import { Layers3, Play, Pause } from 'lucide-react';
import {
  LOCS, DISEASES, YEARS, PREVALENCE,
  getPrevalence, getRegionGroups, getPsychiatrists, shadeColor
} from '../../atlas/index.js';
import { SPECTRUM_BY_ID } from '../../atlas/spectrum.js';

// 治疗可及性代理柱的归一化上限：精神科医生密度普遍低于 30/10万
const ACCESS_CAP = 25;

const DEFAULT_EXPANDED = ['北美', '欧洲与中亚'];

export default function PrevalenceMatrix({
  yearIdx, setYearIdx, playing, setPlaying,
  diseaseKeys, setDiseaseKeys, stdMode, setStdMode,
  highlightLocIdx, onHighlightLoc
}) {
  const [expanded, setExpanded] = useState(() => new Set(DEFAULT_EXPANDED));
  const regionGroups = useMemo(getRegionGroups, []);

  // 每个疾病使用固定满刻度（数据中的最大值），保证跨国家/年份可比
  const maxByDisease = useMemo(() => {
    const maxes = new Array(DISEASES.length).fill(1);
    for (const [, , di, val] of PREVALENCE[stdMode]) {
      if (val > maxes[di]) maxes[di] = val;
    }
    return maxes.map((m) => Math.ceil(m * 10) / 10 || 1);
  }, [stdMode]);

  const selectedDiseases = useMemo(
    () => diseaseKeys.map((key) => DISEASES.find((d) => d.key === key)).filter(Boolean),
    [diseaseKeys]
  );

  function toggleRegion(label) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleDisease(key) {
    setDiseaseKeys((current) => {
      if (current.includes(key)) return current.length > 1 ? current.filter((k) => k !== key) : current;
      return [...current, key].slice(-3);
    });
  }

  return (
    <div className="atlas-panel atlas-matrix-panel">
      <div className="atlas-panel-head">
        <div>
          <span className="eyebrow">TIME × REGION MATRIX</span>
          <h2>患病率时空矩阵</h2>
          <p className="atlas-panel-note">行 = 国家/地区（按大区分组）；列 = 年份；颜色深浅 = 患病率；当前年份列的墨色小柱 = 精神科医生密度（供给侧代理）。</p>
        </div>
      </div>

      <div className="atlas-controls">
        <div className="atlas-time-control">
          <button
            type="button"
            className="atlas-play-button"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            <span>{playing ? '暂停' : '播放年份'}</span>
          </button>
          <label className="atlas-slider-label">
            <span className="atlas-slider-year">{YEARS[yearIdx]}<small>年</small></span>
            <input
              type="range"
              min="0"
              max={YEARS.length - 1}
              step="1"
              value={yearIdx}
              onChange={(event) => { setPlaying(false); setYearIdx(Number(event.target.value)); }}
              aria-label={`选择年份，当前 ${YEARS[yearIdx]} 年`}
              aria-valuetext={`${YEARS[yearIdx]}年`}
            />
          </label>
        </div>

        <div className="atlas-age-toggle" role="group" aria-label="年龄口径">
          <button
            type="button"
            aria-pressed={stdMode === 'all'}
            onClick={() => setStdMode('all')}
          >全年龄</button>
          <button
            type="button"
            aria-pressed={stdMode === 'std'}
            onClick={() => setStdMode('std')}
          >年龄标准化</button>
        </div>
      </div>

      <div className="atlas-disease-picker" role="group" aria-label="选择展示的疾病图层（最多三层）">
        <span className="atlas-picker-hint"><Layers3 size={14} aria-hidden="true" /> 疾病图层（可叠加，最多 3 层）：</span>
        {DISEASES.filter((d) => d.spectrum !== 'overview').map((disease) => {
          const active = diseaseKeys.includes(disease.key);
          const spectrum = SPECTRUM_BY_ID.get(disease.spectrum);
          return (
            <button
              key={disease.key}
              type="button"
              className={active ? 'atlas-chip active' : 'atlas-chip'}
              aria-pressed={active}
              onClick={() => toggleDisease(disease.key)}
            >
              <i style={{ background: spectrum?.color }} aria-hidden="true" />
              {disease.zh}
            </button>
          );
        })}
      </div>

      <div className="atlas-legend">
        {selectedDiseases.map((disease) => {
          const spectrum = SPECTRUM_BY_ID.get(disease.spectrum);
          const max = maxByDisease[disease.gbdId ? DISEASES.indexOf(disease) : 0];
          return (
            <span key={disease.key} className="atlas-legend-item">
              <i
                style={{
                  background: `linear-gradient(90deg, ${shadeColor(spectrum.color, 0, max)}, ${shadeColor(spectrum.color, max, max)})`
                }}
                aria-hidden="true"
              />
              {disease.zh}：浅 → 深 ≈ 0 → {max}%
            </span>
          );
        })}
      </div>

      <div className="atlas-matrix-scroll" tabIndex={0} role="region" aria-label="患病率矩阵，可左右滚动">
        <div className="atlas-matrix" aria-hidden="false">
          <div className="atlas-row atlas-head-row">
            <span className="atlas-loc-cell">国家/地区</span>
            {YEARS.map((year, yi) => (
              <span
                key={year}
                className={yi === yearIdx ? 'atlas-year-cell current' : 'atlas-year-cell'}
              >
                {year}
              </span>
            ))}
          </div>

          {regionGroups.map((group) => {
            const isOpen = expanded.has(group.label);
            return (
              <React.Fragment key={group.label}>
                <div className="atlas-row">
                  <button
                    type="button"
                    className="atlas-region-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleRegion(group.label)}
                  >
                    <span className="atlas-region-name">{group.label}</span>
                    <small>{group.locIdx.length} 个国家/地区</small>
                  </button>
                </div>
                {isOpen && group.locIdx.map((locIdx) => {
                  const loc = LOCS[locIdx];
                  const highlighted = highlightLocIdx === locIdx;
                  return (
                    <div
                      key={loc.iso3}
                      className={highlighted ? 'atlas-row highlighted' : 'atlas-row'}
                      onMouseEnter={() => onHighlightLoc(locIdx)}
                      onMouseLeave={() => onHighlightLoc(null)}
                      onFocus={() => onHighlightLoc(locIdx)}
                      onBlur={() => onHighlightLoc(null)}
                    >
                      <span
                        className={highlighted ? 'atlas-loc-cell highlighted' : 'atlas-loc-cell'}
                        tabIndex={0}
                      >
                        {loc.zh}
                      </span>
                      {YEARS.map((year, yi) => {
                        const isCurrent = yi === yearIdx;
                        const bands = selectedDiseases.map((disease) => {
                          const di = DISEASES.indexOf(disease);
                          const val = getPrevalence(stdMode, locIdx, yi, di);
                          const spectrum = SPECTRUM_BY_ID.get(disease.spectrum);
                          return { disease, spectrum, val, max: maxByDisease[di] };
                        });
                        const psych = getPsychiatrists(locIdx);
                        const accessHeight = psych ? Math.min(psych.val, ACCESS_CAP) / ACCESS_CAP : 0;
                        const missingAll = bands.every((band) => band.val === null);
                        const detail = bands
                          .map((band) => `${band.disease.zh} ${band.val === null ? '无数据' : band.val.toFixed(2) + '%'}`)
                          .join('；');
                        return (
                          <span
                            key={year}
                            role="img"
                            className={isCurrent ? 'atlas-cell current' : 'atlas-cell'}
                            aria-label={`${year}年：${detail}${isCurrent && psych ? `；精神科医生密度 ${psych.val.toFixed(1)}/10万` : ''}`}
                          >
                            <span className={missingAll ? 'atlas-bands empty' : 'atlas-bands'} aria-hidden="true">
                              {bands.map((band) => (
                                <span
                                  key={band.disease.key}
                                  className="atlas-band"
                                  style={{
                                    background: band.val === null
                                      ? 'transparent'
                                      : shadeColor(band.spectrum.color, band.val, band.max)
                                  }}
                                />
                              ))}
                            </span>
                            {isCurrent && accessHeight > 0 && (
                              <span
                                className="atlas-access-bar"
                                style={{ height: `${Math.round(accessHeight * 100)}%` }}
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <p className="atlas-footnote">
        当前年份列中的墨色小柱表示该国精神科医生密度（每 10 万人，WHO Mental Health Atlas 快照值，上限 25），
        柱越高代表专科服务供给越充足；它不是治疗覆盖率。灰色斜纹 = 该来源无此估计。
      </p>
    </div>
  );
}
