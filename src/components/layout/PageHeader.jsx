import React from 'react';
import { Plus } from 'lucide-react';

export function PageHeader({ canEdit, eyebrow, title, description, count, onAdd, addLabel }) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-header-actions">
        <span className="count-label">{count}</span>
        {canEdit && (
          <button className="primary-button" onClick={onAdd}>
            <Plus size={16} /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}
