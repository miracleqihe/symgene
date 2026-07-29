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
  return (
    <aside className={'sidebar ' + (mobileNav ? 'is-open' : '')}>
      <div className="side-intro">
        <span className="eyebrow">OPEN KNOWLEDGE ROOM</span>
        <p>给每一种感受<br />一份可靠的解释</p>
      </div>
      <nav className="main-nav" aria-label="主导航">
        {navItems.map((item) => (
          <button
            key={item.id}
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
      {canEdit && (
        <button type="button" className="local-data-button" onClick={onOpenLocalData}>
          <Database size={15} />
          <span>本地数据</span>
        </button>
      )}
      <div className="side-foot">
        <ShieldCheck size={15} />
        <span>内容用于公共科普<br />不替代专业诊疗</span>
      </div>
    </aside>
  );
}
