import React from 'react';
import { DISEASES } from '../../atlas/index.js';
import { SPECTRUMS } from '../../atlas/spectrum.js';

// 谱系图例：按谱系簇组织疾病条目，说明谱系概念与配色规则
export default function SpectrumLegend() {
  return (
    <section className="atlas-panel atlas-spectrum-panel" aria-labelledby="atlas-spectrum-title">
      <div className="atlas-panel-head">
        <div>
          <span className="eyebrow">SPECTRUM LEGEND</span>
          <h2 id="atlas-spectrum-title">疾病谱系图例</h2>
          <p className="atlas-panel-note">
            本页的疾病按“谱系”组织：现代分类学（如 HiTOP 层级分类体系）发现，精神疾病按症状结构自然聚成若干连续谱系，
            而不是彼此孤立的类别。同一谱系在图中使用同一色相，深浅表示患病率。
          </p>
        </div>
      </div>
      <div className="atlas-spectrum-grid">
        {SPECTRUMS.map((spectrum) => {
          const members = DISEASES.filter((d) => d.spectrum === spectrum.id);
          return (
            <article key={spectrum.id} className="atlas-spectrum-card">
              <header>
                <i style={{ background: spectrum.color }} aria-hidden="true" />
                <h3>{spectrum.label}</h3>
                <span className="atlas-spectrum-en">{spectrum.en}</span>
              </header>
              <p>{spectrum.blurb}</p>
              <ul aria-label={`${spectrum.label}包含的疾病条目`}>
                {members.map((disease) => <li key={disease.key}>{disease.zh}</li>)}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
