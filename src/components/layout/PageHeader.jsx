import React from 'react';
import { Plus } from 'lucide-react';
import KineticTitle from '../KineticTitle.jsx';

export function PageHeader({ canEdit, page, eyebrow, title, description, count, onAdd, addLabel }) {
  const meta = {
    drugs: { number: '02', accent: 'cyan' },
    disorders: { number: '03', accent: 'yellow' },
    cases: { number: '04', accent: 'ink' },
    resources: { number: '05', accent: 'teal' }
  }[page] || { number: '00', accent: 'cyan' };

  return (
    <div className={`page-header page-header-${meta.accent}`}>
      <span className="page-header-number" aria-hidden="true">{meta.number}</span>
      <div className="page-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <KineticTitle as="h1" text={title} mode="converge" replayKey={title} />
        <p>{description}</p>
        <span className="page-header-line" aria-hidden="true" />
      </div>
      <div className="page-header-actions">
        <span className="count-label">{count}</span>
        {canEdit && (
          <button className="primary-button local-add-button" onClick={onAdd}>
            <Plus size={16} /> {addLabel}
          </button>
        )}
      </div>
      <span className="page-header-coordinate" aria-hidden="true">SG / {meta.number} · 122.00E</span>
    </div>
  );
}
