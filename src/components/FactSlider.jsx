import React, { useCallback, useEffect, useRef, useState } from 'react';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

export default function FactSlider({ items, label = '核心信息' }) {
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoing, setOutgoing] = useState(null);
  const activeIndexRef = useRef(0);
  const timersRef = useRef([]);
  const tabRefs = useRef([]);
  const currentSlideRef = useRef(null);
  const pointerRef = useRef(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const goTo = useCallback((nextIndex, focusTab = false) => {
    const boundedIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
    const currentIndex = activeIndexRef.current;
    if (boundedIndex === currentIndex) return;
    const direction = boundedIndex > currentIndex ? 1 : -1;
    clearTimers();
    if (!reducedMotion) {
      setOutgoing({ item: items[currentIndex], index: currentIndex, direction });
      const exitTimer = window.setTimeout(() => setOutgoing(null), 170);
      timersRef.current.push(exitTimer);
    } else {
      setOutgoing(null);
    }
    activeIndexRef.current = boundedIndex;
    setActiveIndex(boundedIndex);
    window.requestAnimationFrame(() => {
      const nextTab = tabRefs.current[boundedIndex];
      nextTab?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      if (focusTab) nextTab?.focus({ preventScroll: true });
      if (!reducedMotion && currentSlideRef.current) {
        currentSlideRef.current.getAnimations().forEach((animation) => animation.cancel());
        currentSlideRef.current.animate(
          [
            { opacity: 0, transform: `translate3d(${direction > 0 ? 22 : -22}px, 0, 0)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' }
          ],
          { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' }
        );
      }
    });
  }, [clearTimers, items, reducedMotion]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const onTabsKeyDown = (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(activeIndexRef.current + 1, true);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(activeIndexRef.current - 1, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(items.length - 1, true);
    }
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse') return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || event.pointerType === 'mouse') return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    goTo(activeIndexRef.current + (deltaX < 0 ? 1 : -1));
  };

  const activeItem = items[activeIndex];

  return (
    <section className="fact-slider" aria-label={label}>
      <div className="fact-slider-head">
        <div
          className="fact-tabs"
          role="tablist"
          aria-label={label}
          onKeyDown={onTabsKeyDown}
          style={{
            '--tab-count': items.length,
            '--indicator-shift': `calc(${activeIndex * 100}% + ${activeIndex * 4}px)`
          }}
        >
          <span className="fact-tab-indicator" aria-hidden="true" />
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`fact-tab-${index}`}
              aria-selected={index === activeIndex}
              aria-controls="fact-slider-panel"
              tabIndex={index === activeIndex ? 0 : -1}
              className={index === activeIndex ? 'active' : ''}
              onClick={() => goTo(index)}
            >
              <i className={`fact-tone fact-tone-${item.tone}`} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
        <span className="fact-slider-progress" aria-live="polite">{activeIndex + 1} / {items.length}</span>
      </div>
      <div
        className="fact-slider-viewport"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerRef.current = null; }}
      >
        {outgoing && (
          <div
            key={`${outgoing.index}-${activeIndex}`}
            className={`fact-slide fact-slide-out fact-slide-out-${outgoing.direction > 0 ? 'left' : 'right'} tone-${outgoing.item.tone}`}
            aria-hidden="true"
            inert
          >
            <p>{outgoing.item.text || '待补充'}</p>
          </div>
        )}
        <div
          ref={currentSlideRef}
          id="fact-slider-panel"
          className={`fact-slide fact-slide-current tone-${activeItem.tone}`}
          role="tabpanel"
          tabIndex="0"
          aria-labelledby={`fact-tab-${activeIndex}`}
        >
          <p>{activeItem.text || '待补充'}</p>
        </div>
      </div>
    </section>
  );
}
