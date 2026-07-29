import React from 'react';
import { Menu } from 'lucide-react';
import symGenMark from '../../assets/sym-gen-mark.svg';
import { navItems } from '../../data.js';

export function Topbar({ activePage, mobileNav, onHome, onToggleNavigation }) {
  const activePageLabel = navItems.find((item) => item.id === activePage)?.label || '首页';
  return (
    <header className="topbar">
      <button className="brand mobile-brand" onClick={onHome} aria-label="Sym Gen 心鉴，回到首页">
        <span className="brand-mark"><img src={symGenMark} alt="" /></span>
        <span><strong>Sym Gen</strong><em>{activePageLabel}</em></span>
      </button>
      <div className="topbar-actions">
        <button
          className="icon-button menu-toggle"
          onClick={onToggleNavigation}
          aria-label="打开导航"
          aria-expanded={mobileNav}
        >
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
}
