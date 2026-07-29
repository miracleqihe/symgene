import { useEffect, useRef } from 'react';

export function useSearchShortcut({ enabled, onActivate }) {
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    function focusSearch(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || !enabled) return;
      event.preventDefault();
      onActivateRef.current?.();
    }

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [enabled]);
}
