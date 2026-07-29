import { useEffect, useRef } from 'react';

export function useSearchShortcut({ enabled, inputRef, onActivate }) {
  const focusFrameRef = useRef(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    function focusSearch(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || !enabled) return;
      event.preventDefault();
      onActivateRef.current?.();
      if (focusFrameRef.current) window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        focusFrameRef.current = null;
      });
    }

    window.addEventListener('keydown', focusSearch);
    return () => {
      window.removeEventListener('keydown', focusSearch);
      if (focusFrameRef.current) window.cancelAnimationFrame(focusFrameRef.current);
    };
  }, [enabled, inputRef]);
}
