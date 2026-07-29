import React from 'react';
import { Menu } from 'lucide-react';
import symGenMark from '../../assets/sym-gen-mark.svg';

export function Topbar({ canEdit, mobileNav, onHome, onToggleNavigation }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onHome} aria-label="Sym Gen 心鉴，回到首页">
        <span className="brand-mark"><img src={symGenMark} alt="" /></span>
        <span><strong>Sym Gen</strong><em>心鉴 · WIKI</em></span>
      </button>
      <div className="topbar-actions">
        <span className="status-dot"><i /> {canEdit ? '本地编辑模式' : '公开阅读模式'}</span>
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
