import React from 'react';
import {
  ChevronRight,
  Database,
  FileText,
  FlaskConical,
  HeartPulse,
  Home,
  Library,
  ShieldCheck
} from 'lucide-react';
import symGenMark from '../../assets/sym-gen-mark.svg';
import { navItems } from '../../data.js';

function NavIcon({ id }) {
  const props = { size: 17, strokeWidth: 1.9 };
  if (id === 'home') return <Home {...props} />;
  if (id === 'drugs') return <FlaskConical {...props} />;
  if (id === 'disorders') return <HeartPulse {...props} />;
  if (id === 'cases') return <FileText {...props} />;
  return <Library {...props} />;
}

export function Sidebar({
  activePage,
  canEdit,
  counts,
  mobileNav,
  onNavigate,
  onOpenLocalData
}) {
  const activeNavIndex = Math.max(0, navItems.findIndex((item) => item.id === activePage));
  return (
    <aside className={'sidebar ' + (mobileNav ? 'is-open' : '')}>
      <div className="side-brand-block">
        <button className="brand side-brand" onClick={() => onNavigate('home')} aria-label="Sym Gen 心鉴，回到首页">
          <span className="brand-mark"><img src={symGenMark} alt="" /></span>
          <span><strong>Sym Gen</strong><em>心鉴 · WIKI</em></span>
        </button>
        <span className="side-coordinate">SG / 00</span>
      </div>
      <div className="side-intro">
        <span className="eyebrow">OPEN KNOWLEDGE ROOM</span>
        <p>给每一种感受<br />一份可靠的解释</p>
      </div>
      <nav className="main-nav" aria-label="主导航" style={{ '--active-index': activeNavIndex }}>
        <span className="nav-indicator" aria-hidden="true" />
        {navItems.map((item, itemIndex) => (
          <button
            key={item.id}
            style={{ '--nav-order': itemIndex }}
            className={activePage === item.id ? 'active' : ''}
            onClick={() => onNavigate(item.id)}
          >
            <NavIcon id={item.id} />
            <span>{item.label}</span>
            {item.id !== 'home' && <small>{counts[item.id]}</small>}
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      <div className="side-bottom">
        {canEdit && (
          <button type="button" className="local-data-button" onClick={onOpenLocalData}>
            <Database size={15} />
            <span>本地数据</span>
          </button>
        )}
        <span className="status-dot"><i /> {canEdit ? '本地编辑模式' : '公开阅读模式'}</span>
        <div className="side-foot">
          <ShieldCheck size={15} />
          <span>内容用于公共科普<br />不替代专业诊疗</span>
        </div>
        <span className="side-version">SYM GEN / LOCAL 0.2</span>
      </div>
    </aside>
  );
}
