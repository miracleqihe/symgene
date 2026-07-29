import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export function EntryRow({ index, title, text, count, onClick, accent, icon }) {
  return (
    <button className="entry-row" onClick={onClick}>
      <span className={'entry-icon ' + accent}>{icon}</span>
      <span className="entry-index">{index}</span>
      <span className="entry-copy"><strong>{title}</strong><small>{text}</small></span>
      <span className="entry-count">{count}</span>
      <ArrowUpRight className="entry-arrow" size={18} />
    </button>
  );
}
