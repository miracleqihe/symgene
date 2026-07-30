import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import PaperPlaneComposition from './PaperPlaneComposition';
import {
  PAPER_PLANE_CLOSE_FRAMES,
  PAPER_PLANE_CONTENT_FADE_OUT_FRAMES,
  PAPER_PLANE_FPS,
  PAPER_PLANE_FRAMES,
  PAPER_PLANE_HEIGHT,
  PAPER_PLANE_HOLD_END_FRAME,
  PAPER_PLANE_PREPARE_END_FRAME,
  PAPER_PLANE_REDUCED_HOLD_FRAMES,
  PAPER_PLANE_REDUCED_REVEAL_FRAMES,
  PAPER_PLANE_REVEAL_FRAMES,
  PAPER_PLANE_SETTLE_END_FRAME,
  PAPER_PLANE_UNFOLD_END_FRAME,
  PAPER_PLANE_WIDTH,
} from './paperPlaneGeometry';

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3;
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

const PAPER_PLANE_IDLE_DURATION_MS = 6800;
const PAPER_PLANE_IDLE_KEYFRAMES = [
  { offset: 0, transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', easing: 'cubic-bezier(.45, 0, .55, 1)' },
  { offset: 0.18, transform: 'translate3d(4px, -5px, 0) rotate(-1.1deg) scale(1.002)', easing: 'cubic-bezier(.16, 1, .3, 1)' },
  { offset: 0.43, transform: 'translate3d(1px, -13px, 0) rotate(-.35deg) scale(1.004)', easing: 'cubic-bezier(.45, 0, .2, 1)' },
  { offset: 0.68, transform: 'translate3d(-6px, -6px, 0) rotate(1.15deg) scale(1.001)', easing: 'cubic-bezier(.22, 1, .36, 1)' },
  { offset: 0.87, transform: 'translate3d(-3px, 4px, 0) rotate(.65deg) scale(.999)', easing: 'cubic-bezier(.4, 0, .2, 1)' },
  { offset: 1, transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

export default function PaperPlaneLetter({ onOpenChange }) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState('idle');
  const [animationMode, setAnimationMode] = useState('idle');
  const [startIdleFrame, setStartIdleFrame] = useState(0);
  const playerRef = useRef(null);
  const phaseRef = useRef('idle');
  const playFrameRef = useRef(null);
  const idleStartRef = useRef(null);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const idleStageRef = useRef(null);
  const idleMotionRef = useRef(null);
  const idleNeutralTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const expanded = phase !== 'idle';
  const contentVisible = phase === 'revealing' || phase === 'opened';
  const contentInteractive = phase === 'opened';

  const updatePhase = useCallback((nextPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const clearScheduledWork = useCallback(() => {
    if (playFrameRef.current !== null) {
      window.cancelAnimationFrame(playFrameRef.current);
      playFrameRef.current = null;
    }
  }, []);

  const clearIdleNeutralTimer = useCallback(() => {
    if (idleNeutralTimerRef.current !== null) {
      window.clearTimeout(idleNeutralTimerRef.current);
      idleNeutralTimerRef.current = null;
    }
  }, []);

  const startIdleMotion = useCallback(() => {
    const stage = idleStageRef.current;
    if (!stage || reducedMotion || phaseRef.current !== 'idle') return;

    clearIdleNeutralTimer();
    idleMotionRef.current?.cancel();
    stage.style.transition = '';
    stage.style.transform = '';
    idleMotionRef.current = stage.animate(
      PAPER_PLANE_IDLE_KEYFRAMES,
      {
        duration: PAPER_PLANE_IDLE_DURATION_MS,
        iterations: Infinity,
        easing: 'linear',
      },
    );
  }, [clearIdleNeutralTimer, reducedMotion]);

  const settleIdleMotion = useCallback(() => {
    const stage = idleStageRef.current;
    if (!stage) return;

    clearIdleNeutralTimer();
    const currentTransform = getComputedStyle(stage).transform;
    idleMotionRef.current?.cancel();
    idleMotionRef.current = null;
    stage.style.transition = 'none';
    stage.style.transform = currentTransform === 'none'
      ? 'translate3d(0, 0, 0)'
      : currentTransform;
    stage.getBoundingClientRect();
    stage.style.transition = 'transform 200ms cubic-bezier(.22, .78, .28, 1)';
    stage.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
    idleNeutralTimerRef.current = window.setTimeout(() => {
      idleNeutralTimerRef.current = null;
      if (!mountedRef.current) return;
      stage.style.transition = '';
      stage.style.transform = '';
    }, 220);
  }, [clearIdleNeutralTimer]);

  const runForFrames = useCallback((durationFrames, easing, onProgress, onComplete) => {
    let startedAt = null;
    const durationMs = durationFrames / PAPER_PLANE_FPS * 1000;

    const step = (timestamp) => {
      if (!mountedRef.current) return;
      if (startedAt === null) startedAt = timestamp;

      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      const easedProgress = easing(progress);
      onProgress?.(easedProgress);

      if (progress >= 1) {
        playFrameRef.current = null;
        onComplete();
        return;
      }

      playFrameRef.current = window.requestAnimationFrame(step);
    };

    playFrameRef.current = window.requestAnimationFrame(step);
  }, []);

  const playFrameRange = useCallback((from, to, durationFrames, easing, onComplete) => {
    const player = playerRef.current;
    if (!player) return;

    player.pause();
    player.seekTo(from);
    let lastFrame = from;

    runForFrames(
      durationFrames,
      easing,
      (progress) => {
        const nextFrame = Math.round(from + (to - from) * progress);
        if (nextFrame !== lastFrame) {
          player.seekTo(nextFrame);
          lastFrame = nextFrame;
        }
      },
      onComplete,
    );
  }, [runForFrames]);

  const focusTrigger = useCallback(() => {
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const finishRevealing = useCallback(() => {
    if (phaseRef.current !== 'revealing') return;
    updatePhase('opened');
    playerRef.current?.pause();
  }, [updatePhase]);

  const beginRevealing = useCallback((reduced = false) => {
    if (phaseRef.current !== 'holding') return;
    updatePhase('revealing');
    runForFrames(
      reduced ? PAPER_PLANE_REDUCED_REVEAL_FRAMES : PAPER_PLANE_REVEAL_FRAMES,
      easeOutCubic,
      null,
      finishRevealing,
    );
  }, [finishRevealing, runForFrames, updatePhase]);

  const beginHolding = useCallback(() => {
    if (phaseRef.current !== 'settling') return;
    updatePhase('holding');
    playFrameRange(
      PAPER_PLANE_SETTLE_END_FRAME,
      PAPER_PLANE_HOLD_END_FRAME,
      PAPER_PLANE_HOLD_END_FRAME - PAPER_PLANE_SETTLE_END_FRAME,
      easeInOutCubic,
      () => beginRevealing(false),
    );
  }, [beginRevealing, playFrameRange, updatePhase]);

  const beginSettling = useCallback(() => {
    if (phaseRef.current !== 'unfolding') return;
    updatePhase('settling');
    playFrameRange(
      PAPER_PLANE_UNFOLD_END_FRAME,
      PAPER_PLANE_SETTLE_END_FRAME,
      PAPER_PLANE_SETTLE_END_FRAME - PAPER_PLANE_UNFOLD_END_FRAME,
      easeInOutCubic,
      beginHolding,
    );
  }, [beginHolding, playFrameRange, updatePhase]);

  const beginUnfolding = useCallback(() => {
    if (phaseRef.current !== 'preparing') return;
    updatePhase('unfolding');
    playFrameRange(
      PAPER_PLANE_PREPARE_END_FRAME,
      PAPER_PLANE_UNFOLD_END_FRAME,
      PAPER_PLANE_UNFOLD_END_FRAME - PAPER_PLANE_PREPARE_END_FRAME,
      easeOutCubic,
      beginSettling,
    );
  }, [beginSettling, playFrameRange, updatePhase]);

  const finishClosing = useCallback(() => {
    if (phaseRef.current !== 'closing') return;
    updatePhase('idle');
    playerRef.current?.pause();
    setAnimationMode('idle');
    focusTrigger();

    if (!reducedMotion) {
      playFrameRef.current = window.requestAnimationFrame(() => {
        playFrameRef.current = null;
        startIdleMotion();
      });
    }
  }, [focusTrigger, reducedMotion, startIdleMotion, updatePhase]);

  useEffect(() => {
    mountedRef.current = true;
    idleStartRef.current = window.requestAnimationFrame(() => {
      idleStartRef.current = null;
      startIdleMotion();
    });

    return () => {
      mountedRef.current = false;
      clearScheduledWork();
      clearIdleNeutralTimer();
      idleMotionRef.current?.cancel();
      idleMotionRef.current = null;
      if (idleStartRef.current !== null) {
        window.cancelAnimationFrame(idleStartRef.current);
        idleStartRef.current = null;
      }
      playerRef.current?.pause();
    };
  }, [clearIdleNeutralTimer, clearScheduledWork, startIdleMotion]);

  const openLetter = useCallback(() => {
    const player = playerRef.current;
    if (phaseRef.current !== 'idle' || !player) return;

    clearScheduledWork();
    player.pause();
    settleIdleMotion();
    setStartIdleFrame(0);
    setAnimationMode('unfold');
    updatePhase('preparing');

    if (reducedMotion) {
      player.seekTo(PAPER_PLANE_HOLD_END_FRAME);
      updatePhase('holding');
      runForFrames(
        PAPER_PLANE_REDUCED_HOLD_FRAMES,
        easeInOutCubic,
        null,
        () => beginRevealing(true),
      );
      return;
    }

    playFrameRef.current = window.requestAnimationFrame(() => {
      playFrameRef.current = null;
      playFrameRange(
        0,
        PAPER_PLANE_PREPARE_END_FRAME,
        PAPER_PLANE_PREPARE_END_FRAME,
        easeInOutCubic,
        beginUnfolding,
      );
    });
  }, [
    beginRevealing,
    beginUnfolding,
    clearScheduledWork,
    playFrameRange,
    reducedMotion,
    runForFrames,
    settleIdleMotion,
    updatePhase,
  ]);

  const closeLetter = useCallback(() => {
    const player = playerRef.current;
    if (phaseRef.current !== 'opened' || !player) return;

    clearScheduledWork();
    updatePhase('closing');

    runForFrames(
      reducedMotion ? PAPER_PLANE_REDUCED_REVEAL_FRAMES : PAPER_PLANE_CONTENT_FADE_OUT_FRAMES,
      easeInOutCubic,
      null,
      () => {
        if (!mountedRef.current) return;

        if (reducedMotion) {
          updatePhase('idle');
          player.seekTo(0);
          setAnimationMode('idle');
          focusTrigger();
          return;
        }

        playFrameRange(
          PAPER_PLANE_HOLD_END_FRAME,
          0,
          PAPER_PLANE_CLOSE_FRAMES,
          easeInOutCubic,
          finishClosing,
        );
      },
    );
  }, [
    clearScheduledWork,
    finishClosing,
    focusTrigger,
    playFrameRange,
    reducedMotion,
    runForFrames,
    updatePhase,
  ]);

  useEffect(() => {
    if (phase !== 'opened') return undefined;
    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!expanded) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLetter();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeLetter, expanded]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    player.pause();
    if (!reducedMotion) {
      if (phaseRef.current === 'idle') startIdleMotion();
      return;
    }
    if (['preparing', 'unfolding', 'settling', 'holding'].includes(phaseRef.current)) {
      clearScheduledWork();
      player.seekTo(PAPER_PLANE_HOLD_END_FRAME);
      updatePhase('holding');
      runForFrames(
        PAPER_PLANE_REDUCED_HOLD_FRAMES,
        easeInOutCubic,
        null,
        () => beginRevealing(true),
      );
    } else if (phaseRef.current === 'revealing') {
      clearScheduledWork();
      runForFrames(
        PAPER_PLANE_REDUCED_REVEAL_FRAMES,
        easeOutCubic,
        null,
        finishRevealing,
      );
    } else if (phaseRef.current === 'closing') {
      clearScheduledWork();
      updatePhase('idle');
      player.seekTo(0);
      setAnimationMode('idle');
      focusTrigger();
    } else if (phaseRef.current === 'idle') {
      player.seekTo(0);
    }
  }, [
    beginRevealing,
    clearScheduledWork,
    finishRevealing,
    focusTrigger,
    reducedMotion,
    runForFrames,
    startIdleMotion,
    updatePhase,
  ]);

  useEffect(() => {
    onOpenChange?.(expanded);
    return () => {
      if (expanded) onOpenChange?.(false);
    };
  }, [expanded, onOpenChange]);

  const inputProps = useMemo(() => ({
    mode: animationMode,
    startIdleFrame,
    outlineColor: '#315f64',
  }), [animationMode, startIdleFrame]);

  return (
    <div className="paper-plane-letter" data-phase={phase} data-open={expanded ? 'true' : 'false'}>
      <button
        ref={triggerRef}
        className="paper-plane-trigger"
        type="button"
        onClick={openLetter}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.currentTarget.click();
        }}
        disabled={phase !== 'idle'}
        aria-label="展开纸飞机，打开一封给来到这里的信"
        aria-expanded={expanded}
        aria-controls="sym-gen-letter"
      />
      {expanded && (
        <button
          className="letter-scrim"
          type="button"
          aria-label="点击背景关闭信件"
          tabIndex="-1"
          onClick={closeLetter}
        />
      )}
      <div
        id="sym-gen-letter"
        className="paper-plane-letter-object"
        role={contentVisible ? 'dialog' : undefined}
        aria-modal={contentVisible ? 'true' : undefined}
        aria-labelledby={contentVisible ? 'sym-gen-letter-title' : undefined}
        aria-hidden={contentVisible ? undefined : 'true'}
        onClick={(event) => event.stopPropagation()}
      >
        <svg
          className="paper-plane-guide-rings"
          viewBox="0 0 900 600"
          aria-hidden="true"
          overflow="visible"
        >
          <ellipse className="paper-plane-guide-ring paper-plane-guide-ring--outer" cx="450" cy="324" rx="150" ry="98" />
          <ellipse className="paper-plane-guide-ring paper-plane-guide-ring--inner" cx="450" cy="324" rx="150" ry="98" />
        </svg>
        <div ref={idleStageRef} className="paper-plane-idle-stage">
          <Player
            ref={playerRef}
            component={PaperPlaneComposition}
            inputProps={inputProps}
            durationInFrames={PAPER_PLANE_FRAMES}
            compositionWidth={PAPER_PLANE_WIDTH}
            compositionHeight={PAPER_PLANE_HEIGHT}
            fps={PAPER_PLANE_FPS}
            className="paper-plane-player"
            style={{ width: '100%', height: '100%' }}
            autoPlay={false}
            loop={false}
            playbackRate={1}
            moveToBeginningWhenEnded={false}
            clickToPlay={false}
            controls={false}
            overflowVisible
            acknowledgeRemotionLicense
            numberOfSharedAudioTags={0}
          />
        </div>
        <article className="letter-sheet">
          <button
            ref={closeRef}
            className="letter-close"
            type="button"
            onClick={closeLetter}
            aria-label="关闭信件"
            tabIndex={contentInteractive ? 0 : -1}
          >
            <XMark />
          </button>
          <div className="letter-copy">
            <div className="letter-copy-heading">
              <span>SYM GEN · 心鉴</span>
              <h2 id="sym-gen-letter-title">你好，欢迎来到心鉴。</h2>
            </div>
            <div className="letter-copy-body">
              <p>
                愿这里的文字，
                <br />
                能陪你更从容地理解自己。
              </p>
              <p>
                每一次认真感受，
                <br />
                都是照顾自己的开始。
              </p>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
