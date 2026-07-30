import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import symGenMark from '../assets/sym-gen-mark.svg';

export function WelcomePage({ onEnter }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-symbol" aria-hidden="true"><img src={symGenMark} alt="" /></div>
        <h1>Sym Gen</h1>
        <p className="welcome-subtitle">心鉴 · 精神与心理健康百科</p>
        <p className="welcome-description">
          系统整理精神疾病与药物的分类、诊疗思路和临床信息，<br />做一册可以随时查阅的公开知识库。
        </p>
        <div className="welcome-status"><i />内容持续整理中</div>
        <p className="welcome-date">更新于 2026.07</p>
        <span className="welcome-divider" aria-hidden="true" />
        <button className="welcome-enter" onClick={onEnter}>
          进入知识库 <ArrowUpRight size={18} />
        </button>
      </div>
      <p className="welcome-disclaimer">本站仅供信息参考，不替代医生的诊断与处方</p>
    </main>
  );
}
