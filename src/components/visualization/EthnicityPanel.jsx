import React from 'react';
import { ETHNICITY_GROUPS, ETHNICITY_INDICATORS } from '../../atlas/index.js';

// 患病率/可及性条的满刻度（%）
const PCT_CAP = 40;

export default function EthnicityPanel() {
  const byId = (id) => ETHNICITY_INDICATORS.find((indicator) => indicator.id === id);
  const prevalence = byId('ami');
  const treatment = byId('treatment');
  const suicide = byId('suicide');
  const overdose = byId('overdose');

  return (
    <section className="atlas-panel atlas-ethnicity-panel" aria-labelledby="atlas-ethnicity-title">
      <div className="atlas-panel-head">
        <div>
          <span className="eyebrow">RACE &amp; ETHNICITY · US SNAPSHOT</span>
          <h2 id="atlas-ethnicity-title">族裔视图：美国的经验</h2>
          <p className="atlas-panel-note">
            系统性的族裔患病率数据主要来自美国全国调查（NSDUH）。下图是 2024 年美国全国快照：
            上条为成人任何精神障碍（AMI）患病率，下条为患者过去一年接受精神健康服务的比例。
          </p>
        </div>
      </div>

      <div role="table" aria-label="美国各族裔精神障碍患病率与治疗可及性" className="atlas-ethnicity-table">
        <div role="row" className="atlas-ethnicity-head">
          <span role="columnheader">族裔</span>
          <span role="columnheader">患病率 {prevalence.year}（{prevalence.unit}）</span>
          <span role="columnheader">接受治疗 {treatment.year}（{treatment.unit}）</span>
          <span role="columnheader">自杀率 / 药物过量死亡（每 10 万人，{suicide.year}）</span>
        </div>
        {ETHNICITY_GROUPS.map((group) => {
          const pVal = prevalence.values[group.id];
          const tVal = treatment.values[group.id];
          const sVal = suicide.values[group.id];
          const oVal = overdose.values[group.id];
          return (
            <div key={group.id} role="row" className="atlas-ethnicity-row">
              <span role="rowheader" className="atlas-ethnicity-name">{group.zh}</span>
              <span role="cell" className="atlas-ethnicity-bar-cell">
                {pVal === undefined
                  ? <em className="atlas-missing">无公布值</em>
                  : (
                    <span className="atlas-ethnicity-bar prevalence" aria-hidden="true">
                      <i style={{ width: `${(pVal / PCT_CAP) * 100}%` }} />
                      <b>{pVal}%</b>
                    </span>
                  )}
              </span>
              <span role="cell" className="atlas-ethnicity-bar-cell">
                {tVal === undefined
                  ? <em className="atlas-missing">无公布值</em>
                  : (
                    <span className="atlas-ethnicity-bar treatment" aria-hidden="true">
                      <i style={{ width: `${(tVal / 100) * 100}%` }} />
                      <b>{tVal}%</b>
                    </span>
                  )}
              </span>
              <span role="cell" className="atlas-ethnicity-context">
                {sVal === undefined && oVal === undefined
                  ? <em className="atlas-missing">—</em>
                  : <span>{sVal !== undefined ? `自杀 ${sVal}` : '自杀 —'} · {oVal !== undefined ? `过量 ${oVal}` : '过量 —'}</span>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="atlas-footnote">
        读法示例：白人（非西裔）与西裔、黑人的患病率相近（约 21%–25%），但过去一年接受过精神健康服务的比例差距明显
        （白人 58%，亚裔仅 33%）。原住民（AIAN）的自杀与药物过量死亡率远高于其他族裔。
        这些差异主要是社会决定因素长期作用的结果。数据来源：KFF 对 NSDUH 2024 与 CDC 死因数据的整理。
      </p>
    </section>
  );
}
