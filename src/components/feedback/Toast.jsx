import React from 'react';
import { CircleHelp, Sparkles } from 'lucide-react';

export function Toast({ message, error = false }) {
  if (!message) return null;
  return (
    <div
      className="toast"
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {error
        ? <CircleHelp size={16} aria-hidden="true" />
        : <Sparkles size={16} aria-hidden="true" />}
      {message}
    </div>
  );
}
