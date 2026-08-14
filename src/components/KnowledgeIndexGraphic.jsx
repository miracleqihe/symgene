import React, { useState } from 'react';

const INDEX_ITEMS = [
  { id: 'drugs', label: '精神药物' },
  { id: 'disorders', label: '疾病科普' },
  { id: 'cases', label: '案例分析' },
  { id: 'resources', label: '网络资源' },
  { id: 'reviews', label: '前沿综述' }
];

export default function KnowledgeIndexGraphic({ onNavigate }) {
  const [open, setOpen] = useState(false);

  const navigate = (id) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <div className={'home-navigation ' + (open ? 'is-open' : '')}>
      <button
        className="home-menu-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="home-primary-navigation"
      >
        <span>栏目</span>
        <i aria-hidden="true" />
      </button>
      <nav id="home-primary-navigation" className="home-primary-nav" aria-label="知识栏目">
        {INDEX_ITEMS.map((item) => (
          <button key={item.id} onClick={() => navigate(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
