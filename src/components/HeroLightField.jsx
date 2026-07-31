import React, { useEffect, useRef } from 'react';
import { createAmbientParticles, drawAmbientParticles } from './ambientParticles';
import { AMBIENT_MOTION, motionValue } from './ambientMotion';

const FRAME_INTERVAL = 1000 / 30;
const TAU = Math.PI * 2;
const STATIC_TIME = 3.7;
const DEBUG_AMBIENT_FIELD = false;

function wave(time, period, phase = 0) {
  return Math.sin((time / period) * TAU + phase);
}

function breathe(time, period, phase = 0) {
  const value = 0.5 + wave(time, period, phase) * 0.5;
  return value * value * (3 - 2 * value);
}

function drift(time, period, phase = 0) {
  const primary = wave(time, period, phase);
  const secondary = wave(time, period * 0.57, phase + 1.37);
  return primary * 0.76 + secondary * 0.24;
}

function withOffset(context, x, y, draw) {
  context.save();
  context.translate(x, y);
  draw();
  context.restore();
}

function drawSoftBlob(context, width, height, time, blob) {
  const xDrift = drift(time, blob.period, blob.phase);
  const yDrift = drift(time, blob.period * 1.19, blob.phase + 1.84);
  const breath = breathe(time, blob.period * 0.91, blob.phase + 0.72);
  const radius = Math.max(width * blob.radius, height * 0.54);
  const centerX = width * blob.x + width * blob.travelX * xDrift;
  const centerY = height * blob.y + height * blob.travelY * yDrift;
  const scale = 1 + breath * blob.scale;
  const alpha = blob.alphaMin + breath * (blob.alphaMax - blob.alphaMin);

  context.save();
  context.translate(centerX, centerY);
  context.rotate(blob.rotation + wave(time, blob.period * 1.42, blob.phase) * 0.035);
  context.scale(scale * blob.stretchX, scale * blob.stretchY);
  context.globalCompositeOperation = 'screen';

  const gradient = context.createRadialGradient(0, 0, radius * 0.04, 0, 0, radius);
  gradient.addColorStop(0, `rgba(${blob.color}, ${alpha})`);
  gradient.addColorStop(0.28, `rgba(${blob.color}, ${alpha * 0.78})`);
  gradient.addColorStop(0.6, `rgba(${blob.color}, ${alpha * 0.3})`);
  gradient.addColorStop(1, `rgba(${blob.color}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);
  context.restore();
}

function drawAurora(context, width, height, time) {
  const aurora = AMBIENT_MOTION.aurora;
  const blobs = [
    {
      x: 0.68, y: 0.22, radius: 0.42, period: 9.2, phase: 0.2,
      travelX: motionValue(0.082, aurora.travel),
      travelY: motionValue(0.055, aurora.travel),
      scale: motionValue(0.04, aurora.travel),
      alphaMin: motionValue(0.11, aurora.opacity),
      alphaMax: motionValue(0.245, aurora.opacity),
      stretchX: 1.12, stretchY: 0.78, rotation: -0.17, color: '126, 214, 223',
    },
    {
      x: 0.22, y: 0.82, radius: 0.47, period: 12.8, phase: 2.15,
      travelX: motionValue(0.07, aurora.travel),
      travelY: motionValue(0.052, aurora.travel),
      scale: motionValue(0.032, aurora.travel),
      alphaMin: motionValue(0.105, aurora.opacity),
      alphaMax: motionValue(0.225, aurora.opacity),
      stretchX: 1.08, stretchY: 0.72, rotation: 0.11, color: '143, 218, 194',
    },
    {
      x: 0.91, y: 0.76, radius: 0.39, period: 15.4, phase: 4.25,
      travelX: motionValue(0.095, aurora.travel),
      travelY: motionValue(0.072, aurora.travel),
      scale: motionValue(0.03, aurora.travel),
      alphaMin: motionValue(0.09, aurora.opacity),
      alphaMax: motionValue(0.205, aurora.opacity),
      stretchX: 1.08, stretchY: 0.82, rotation: -0.12, color: '242, 213, 151',
    },
    {
      x: 0.08, y: 0.18, radius: 0.35, period: 10.7, phase: 3.08,
      travelX: motionValue(0.061, aurora.travel),
      travelY: motionValue(0.05, aurora.travel),
      scale: motionValue(0.026, aurora.travel),
      alphaMin: motionValue(0.07, aurora.opacity),
      alphaMax: motionValue(0.165, aurora.opacity),
      stretchX: 0.95, stretchY: 0.74, rotation: 0.16, color: '231, 197, 205',
    },
  ];

  blobs.forEach((blob) => drawSoftBlob(context, width, height, time, blob));

  const quietWash = context.createRadialGradient(
    width * 0.34,
    height * 0.51,
    0,
    width * 0.34,
    height * 0.51,
    width * 0.29,
  );
  quietWash.addColorStop(0, 'rgba(138, 207, 201, .08)');
  quietWash.addColorStop(0.65, 'rgba(138, 207, 201, .025)');
  quietWash.addColorStop(1, 'rgba(138, 207, 201, 0)');
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = quietWash;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawRibbon(context, width, height, time, ribbon) {
  const pulse = breathe(time, ribbon.period * 0.88, ribbon.phase + 0.5);
  const travel = drift(time, ribbon.period, ribbon.phase);
  const offsetX = width * ribbon.travelX * travel;
  const offsetY = height * ribbon.travelY * drift(
    time,
    ribbon.period * 1.27,
    ribbon.phase + 2.1,
  );
  const lineWidth = width * ribbon.width * (0.94 + pulse * 0.12);
  const alpha = ribbon.alphaMin + pulse * (ribbon.alphaMax - ribbon.alphaMin);
  const gradient = context.createLinearGradient(0, height, width, 0);
  gradient.addColorStop(0, 'rgba(126, 214, 223, 0)');
  gradient.addColorStop(0.26, `rgba(126, 214, 223, ${alpha * 0.55})`);
  gradient.addColorStop(0.52, `rgba(248, 255, 246, ${alpha})`);
  gradient.addColorStop(0.75, `rgba(242, 213, 151, ${alpha * 0.58})`);
  gradient.addColorStop(1, 'rgba(242, 213, 151, 0)');

  context.save();
  context.globalCompositeOperation = 'screen';
  context.strokeStyle = gradient;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(width * ribbon.fromX + offsetX, height * ribbon.fromY + offsetY);
  context.lineTo(width * ribbon.toX + offsetX, height * ribbon.toY + offsetY);
  context.lineWidth = lineWidth;
  context.globalAlpha = 0.42;
  context.stroke();

  context.beginPath();
  context.moveTo(width * ribbon.fromX + offsetX, height * ribbon.fromY + offsetY);
  context.lineTo(width * ribbon.toX + offsetX, height * ribbon.toY + offsetY);
  context.lineWidth = lineWidth * 0.38;
  context.globalAlpha = 0.82;
  context.stroke();
  context.restore();
}

function drawRibbons(context, width, height, time) {
  const ribbons = AMBIENT_MOTION.ribbons;
  [
    {
      fromX: 0.1, fromY: 1.13, toX: 1.05, toY: -0.06,
      period: 8.6, phase: 0.4,
      width: motionValue(0.075, ribbons.travel),
      travelX: motionValue(0.082, ribbons.travel),
      travelY: motionValue(0.025, ribbons.travel),
      alphaMin: motionValue(0.085, ribbons.opacity),
      alphaMax: motionValue(0.17, ribbons.opacity),
    },
    {
      fromX: 0.36, fromY: 1.08, toX: 1.08, toY: 0.02,
      period: 12.2, phase: 2.42,
      width: motionValue(0.047, ribbons.travel),
      travelX: motionValue(0.065, ribbons.travel),
      travelY: motionValue(0.022, ribbons.travel),
      alphaMin: motionValue(0.037, ribbons.opacity),
      alphaMax: motionValue(0.087, ribbons.opacity),
    },
    {
      fromX: -0.08, fromY: 0.78, toX: 0.78, toY: -0.12,
      period: 15.1, phase: 4.65,
      width: motionValue(0.038, ribbons.travel),
      travelX: motionValue(0.052, ribbons.travel),
      travelY: motionValue(0.018, ribbons.travel),
      alphaMin: motionValue(0.027, ribbons.opacity),
      alphaMax: motionValue(0.072, ribbons.opacity),
    },
  ].forEach((ribbon) => drawRibbon(context, width, height, time, ribbon));
}

function drawCornerRings(context, width, height, time) {
  const compact = width < 650;
  const unit = Math.min(width, height);
  const baseRadius = unit * (compact ? 0.34 : 0.3);
  const outer = breathe(time, 9.8, 0.55);
  const inner = breathe(time, 13.4, 2.82);
  const x = width * (compact ? 0.94 : 0.91)
    + motionValue(11.5, AMBIENT_MOTION.rings.travel) * drift(time, 10.7, 0.4);
  const y = height * 0.91
    + motionValue(8.5, AMBIENT_MOTION.rings.travel) * drift(time, 14.2, 2.0);

  context.save();
  context.translate(x, y);
  context.rotate(-0.18);
  context.lineCap = 'round';

  context.lineWidth = Math.max(1.25, unit * 0.0018);
  context.strokeStyle = `rgba(255, 252, 235, ${motionValue(0.05 + outer * 0.083, AMBIENT_MOTION.rings.opacity)})`;
  context.beginPath();
  context.arc(0, 0, baseRadius * (1 + outer * 0.07), 0.16, TAU - 0.5);
  context.stroke();

  context.lineWidth = Math.max(1, unit * 0.00145);
  context.strokeStyle = `rgba(38, 97, 101, ${motionValue(0.033 + inner * 0.06, AMBIENT_MOTION.rings.opacity)})`;
  context.beginPath();
  context.arc(0, 0, baseRadius * 0.72 * (1 + inner * 0.05), 0.7, TAU - 0.12);
  context.stroke();

  context.lineWidth = Math.max(1.35, unit * 0.00195);
  context.strokeStyle = `rgba(246, 229, 194, ${motionValue(0.043 + outer * 0.085, AMBIENT_MOTION.rings.opacity)})`;
  context.beginPath();
  context.arc(0, 0, baseRadius * 0.89 * (1 + outer * 0.06), 3.44, 4.78);
  context.stroke();
  context.restore();
}

function drawDebug(context, width, height, particleSystem) {
  if (!DEBUG_AMBIENT_FIELD) return;
  context.save();
  context.strokeStyle = 'rgba(255, 0, 80, .8)';
  context.strokeRect(1, 1, width - 2, height - 2);
  context.fillStyle = '#802040';
  context.font = '12px monospace';
  context.fillText(
    `${Math.round(width)}×${Math.round(height)} / ${particleSystem?.particles.length ?? 0} particles`,
    14,
    22,
  );
  context.restore();
}

export default function HeroLightField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !host || !context) return undefined;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    let reducedMotion = motionQuery.matches;
    let finePointer = finePointerQuery.matches;
    let visible = true;
    let frameId = 0;
    let lastPaint = -FRAME_INTERVAL;
    let lastSimulation = null;
    let width = 1;
    let height = 1;
    let particleSystem = null;
    let pointerActive = false;
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * (width > 1200 ? 0.82 : 0.92);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      particleSystem = createAmbientParticles(width, height);
    };

    const paint = (timestamp = 0, deltaSeconds = 0) => {
      const time = reducedMotion ? STATIC_TIME : timestamp / 1000;
      const responseRate = pointerActive ? 1.85 : 1.35;
      const response = finePointer && !reducedMotion
        ? 1 - Math.exp(-Math.max(deltaSeconds, 1 / 60) * responseRate)
        : 1;
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * response;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * response;
      context.clearRect(0, 0, width, height);

      withOffset(
        context,
        pointerCurrent.x * motionValue(15, AMBIENT_MOTION.parallax.travel),
        pointerCurrent.y * motionValue(12, AMBIENT_MOTION.parallax.travel),
        () => drawAurora(context, width, height, time),
      );
      withOffset(
        context,
        pointerCurrent.x * motionValue(10.5, AMBIENT_MOTION.parallax.travel),
        pointerCurrent.y * motionValue(8, AMBIENT_MOTION.parallax.travel),
        () => drawRibbons(context, width, height, time),
      );
      if (!reducedMotion) {
        withOffset(
          context,
          pointerCurrent.x * motionValue(4.6, AMBIENT_MOTION.parallax.travel),
          pointerCurrent.y * motionValue(3.4, AMBIENT_MOTION.parallax.travel),
          () => drawAmbientParticles(
            context,
            particleSystem,
            width,
            height,
            deltaSeconds,
            time,
          ),
        );
      }
      withOffset(
        context,
        pointerCurrent.x * motionValue(6.7, AMBIENT_MOTION.parallax.travel),
        pointerCurrent.y * motionValue(5, AMBIENT_MOTION.parallax.travel),
        () => drawCornerRings(context, width, height, time),
      );
      drawDebug(context, width, height, particleSystem);
    };

    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      lastSimulation = null;
    };

    const tick = (timestamp) => {
      frameId = 0;
      if (reducedMotion || !visible || document.hidden) return;
      if (timestamp - lastPaint >= FRAME_INTERVAL) {
        const delta = lastSimulation === null
          ? 1 / 30
          : Math.min(0.07, (timestamp - lastSimulation) / 1000);
        lastPaint = timestamp;
        lastSimulation = timestamp;
        paint(timestamp, delta);
      }
      frameId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (reducedMotion || !visible || document.hidden || frameId) return;
      frameId = window.requestAnimationFrame(tick);
    };

    const resetPointer = () => {
      pointerActive = false;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    const onPointerMove = (event) => {
      if (!finePointer || reducedMotion || event.pointerType === 'touch') return;
      const bounds = host.getBoundingClientRect();
      pointerActive = true;
      pointerTarget.x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      pointerTarget.y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    };

    const onMotionChange = () => {
      reducedMotion = motionQuery.matches;
      resetPointer();
      pointerCurrent.x = 0;
      pointerCurrent.y = 0;
      stop();
      paint(performance.now(), 0);
      start();
    };

    const onFinePointerChange = () => {
      finePointer = finePointerQuery.matches;
      if (!finePointer) resetPointer();
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      paint(performance.now(), 0);
    });
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    }, { threshold: 0.01 });

    resize();
    paint(performance.now(), 0);
    resizeObserver.observe(host);
    intersectionObserver.observe(canvas);
    motionQuery.addEventListener('change', onMotionChange);
    finePointerQuery.addEventListener('change', onFinePointerChange);
    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', resetPointer);
    document.addEventListener('visibilitychange', onVisibilityChange);
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionQuery.removeEventListener('change', onMotionChange);
      finePointerQuery.removeEventListener('change', onFinePointerChange);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', resetPointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-light-field" aria-hidden="true" />;
}
