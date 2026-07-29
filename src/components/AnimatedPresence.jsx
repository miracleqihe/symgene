import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

function defaultDirection() {
  return 'lateral-forward';
}

export default function AnimatedPresence({
  viewKey,
  children,
  kind = 'page',
  className = '',
  emptyKey,
  mode = 'sync',
  exitMs = 150,
  enterMs = 420,
  settleMs = enterMs,
  resolveDirection = defaultDirection
}) {
  const currentKey = String(viewKey);
  const normalizedEmptyKey = emptyKey === undefined ? undefined : String(emptyKey);
  const reducedMotion = useReducedMotion();
  const nextLayerIdRef = useRef(1);
  const exitTimersRef = useRef(new Map());
  const enterTimersRef = useRef(new Map());
  const pendingLayerRef = useRef(null);
  const initialHasContent = currentKey !== normalizedEmptyKey && children != null;
  const [layers, setLayers] = useState(() => [{
    id: 0,
    key: currentKey,
    child: children,
    phase: 'current',
    direction: 'lateral-forward',
    entering: initialHasContent
  }]);
  const layersRef = useRef(layers);

  const clearTimer = useCallback((timerMap, layerId) => {
    const timer = timerMap.current.get(layerId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timerMap.current.delete(layerId);
    }
  }, []);

  const clearTimers = useCallback(() => {
    exitTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    enterTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    exitTimersRef.current.clear();
    enterTimersRef.current.clear();
  }, []);

  const commitLayers = useCallback((nextLayers) => {
    layersRef.current = nextLayers;
    setLayers(nextLayers);
  }, []);

  const finishExit = useCallback((layerId) => {
    clearTimer(exitTimersRef, layerId);
    const remainingLayers = layersRef.current.filter((layer) => layer.id !== layerId);
    const pendingLayer = mode === 'wait' ? pendingLayerRef.current : null;
    if (pendingLayer) pendingLayerRef.current = null;
    commitLayers(pendingLayer ? [pendingLayer] : remainingLayers);
  }, [clearTimer, commitLayers, mode]);

  const finishEnter = useCallback((layerId) => {
    clearTimer(enterTimersRef, layerId);
    setLayers((currentLayers) => {
      let changed = false;
      const nextLayers = currentLayers.map((layer) => {
        if (layer.id !== layerId || !layer.entering) return layer;
        changed = true;
        return { ...layer, entering: false };
      });
      if (!changed) return currentLayers;
      layersRef.current = nextLayers;
      return nextLayers;
    });
  }, [clearTimer]);

  const scheduleExitFallback = useCallback((layerId) => {
    clearTimer(exitTimersRef, layerId);
    const timer = window.setTimeout(() => finishExit(layerId), exitMs + 80);
    exitTimersRef.current.set(layerId, timer);
  }, [clearTimer, exitMs, finishExit]);

  const scheduleEnterFallback = useCallback((layerId) => {
    clearTimer(enterTimersRef, layerId);
    const timer = window.setTimeout(() => finishEnter(layerId), settleMs);
    enterTimersRef.current.set(layerId, timer);
  }, [clearTimer, finishEnter, settleMs]);

  const renderedCurrentLayer = layers.find((layer) => layer.phase === 'current');
  if (renderedCurrentLayer?.key === currentKey) renderedCurrentLayer.child = children;
  layersRef.current = layers;

  useLayoutEffect(() => {
    const previousCurrent = layersRef.current.find((layer) => layer.phase === 'current');
    if (previousCurrent?.key === currentKey) return;

    const exitingLayer = layersRef.current.find((layer) => layer.phase === 'exiting');
    if (mode === 'wait' && exitingLayer) {
      if (exitingLayer.key === currentKey) {
        clearTimer(exitTimersRef, exitingLayer.id);
        pendingLayerRef.current = null;
        commitLayers([{ ...exitingLayer, child: children, phase: 'current', entering: false }]);
        return;
      }

      const pendingLayer = pendingLayerRef.current;
      const direction = resolveDirection(exitingLayer.key, currentKey);
      pendingLayerRef.current = pendingLayer?.key === currentKey
        ? { ...pendingLayer, child: children, direction }
        : {
            id: nextLayerIdRef.current++,
            key: currentKey,
            child: children,
            phase: 'current',
            direction,
            entering: !reducedMotion && currentKey !== normalizedEmptyKey && children != null
          };
      return;
    }

    const previousKey = previousCurrent?.key ?? currentKey;
    const direction = resolveDirection(previousKey, currentKey);
    const nextHasContent = currentKey !== normalizedEmptyKey && children != null;
    const nextLayer = {
      id: nextLayerIdRef.current++,
      key: currentKey,
      child: children,
      phase: 'current',
      direction,
      entering: !reducedMotion && nextHasContent
    };

    clearTimers();

    if (reducedMotion) {
      pendingLayerRef.current = null;
      commitLayers([nextLayer]);
      return;
    }

    const previousHasContent = previousCurrent
      && previousCurrent.key !== normalizedEmptyKey
      && previousCurrent.child != null;
    if (mode === 'wait' && previousHasContent) {
      pendingLayerRef.current = nextLayer;
      commitLayers([{ ...previousCurrent, phase: 'exiting', direction, entering: false }]);
      scheduleExitFallback(previousCurrent.id);
      return;
    }

    const nextLayers = [
      ...(previousHasContent
        ? [{ ...previousCurrent, phase: 'exiting', direction, entering: false }]
        : []),
      nextLayer
    ];
    commitLayers(nextLayers);
    if (previousHasContent) scheduleExitFallback(previousCurrent.id);
  }, [
    children,
    clearTimer,
    clearTimers,
    commitLayers,
    currentKey,
    mode,
    normalizedEmptyKey,
    reducedMotion,
    resolveDirection,
    scheduleExitFallback
  ]);

  useEffect(() => {
    layers
      .filter((layer) => layer.phase === 'current' && layer.entering)
      .forEach((layer) => scheduleEnterFallback(layer.id));
  }, [layers, scheduleEnterFallback]);

  useEffect(() => {
    if (!reducedMotion) return;
    clearTimers();
    const pendingLayer = pendingLayerRef.current;
    if (pendingLayer) {
      pendingLayerRef.current = null;
      commitLayers([{ ...pendingLayer, entering: false }]);
      return;
    }
    const latestCurrent = layersRef.current.find((layer) => layer.phase === 'current');
    if (latestCurrent) commitLayers([{ ...latestCurrent, entering: false }]);
  }, [clearTimers, commitLayers, reducedMotion]);

  useEffect(() => () => {
    pendingLayerRef.current = null;
    clearTimers();
  }, [clearTimers]);

  const hasTransition = layers.some((layer) => layer.phase === 'exiting' || layer.entering);
  const currentDirection = layers.find((layer) => layer.phase === 'current')?.direction || 'lateral-forward';
  const classes = [
    'animated-presence',
    `presence-${kind}`,
    `direction-${currentDirection}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      data-phase={hasTransition ? 'transitioning' : 'idle'}
      data-direction={currentDirection}
      aria-busy={hasTransition ? 'true' : 'false'}
      style={{
        '--presence-exit-duration': `${exitMs}ms`,
        '--presence-enter-duration': `${enterMs}ms`
      }}
    >
      {layers.map((layer) => {
        if (layer.child == null) return null;
        const exiting = layer.phase === 'exiting';
        const layerClasses = [
          'presence-layer',
          exiting ? 'presence-exiting' : 'presence-current',
          `direction-${layer.direction}`,
          !exiting && (layer.entering ? 'is-entering' : 'is-idle')
        ].filter(Boolean).join(' ');

        return (
          <div
            className={layerClasses}
            key={layer.id}
            data-layer-id={layer.id}
            data-layer-key={layer.key}
            aria-hidden={exiting ? 'true' : undefined}
            inert={exiting ? true : undefined}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (exiting) finishExit(layer.id);
            }}
          >
            {layer.child}
          </div>
        );
      })}
    </div>
  );
}
