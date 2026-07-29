import React from 'react';
import { CircleHelp, Sparkles } from 'lucide-react';

export function Toast({ message, error = false }) {
  if (!message) return null;
  return (
    <div className="toast">
      {error ? <CircleHelp size={16} /> : <Sparkles size={16} />}
      {message}
    </div>
  );
}
