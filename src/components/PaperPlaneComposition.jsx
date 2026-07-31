import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from 'remotion';
import {
  LETTER_BOUNDARY,
  LETTER_CENTER,
  LETTER_FILL,
  OPEN_PAPER_BOUNDARY,
  OPEN_PAPER_CENTER,
  PAPER_PLANE_BOUNDARY,
  PAPER_PLANE_CENTER,
  PAPER_PLANE_HOLD_END_FRAME,
  PAPER_PLANE_IDLE_FRAMES,
  PAPER_PLANE_SETTLE_END_FRAME,
  PAPER_PLANE_UNFOLD_END_FRAME,
  PIECE_WINDOWS,
  PLANE_DETAIL_PATHS,
  PLANE_FILLS,
  getPiece,
  mixPoint,
  pointsToPath,
} from './paperPlaneGeometry';
import { AMBIENT_MOTION, motionValue } from './ambientMotion';

const PAPER_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const SETTLE_EASE = Easing.bezier(0.22, 0.78, 0.28, 1);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeWindow(frame, start, end, easing = PAPER_EASE) {
  if (end <= start) return frame >= end ? 1 : 0;
  return easing(clamp01((frame - start) / (end - start)));
}

function getIdlePose(frame) {
  const cycle = (frame / PAPER_PLANE_IDLE_FRAMES) * Math.PI * 2;
  const travel = AMBIENT_MOTION.planeIdle.travel;
  const rotation = AMBIENT_MOTION.planeIdle.rotation;
  return {
    x: motionValue(
      Math.sin(cycle) * 3.05 + Math.sin(cycle * 2) * 0.42,
      travel,
    ),
    y: motionValue(
      Math.sin(cycle) * 6.15 + Math.sin(cycle * 2) * 0.95,
      travel,
    ),
    rotation: motionValue(
      Math.sin(cycle) * 1.24 + Math.sin(cycle * 2) * 0.18,
      rotation,
    ),
    scale: 1 + (1 - Math.cos(cycle)) * 0.003,
    glow: 0.24 + Math.sin(cycle) * 0.05,
  };
}

export default function PaperPlaneComposition({
  mode = 'idle',
  startIdleFrame = 0,
  outlineColor = '#315f64',
}) {
  const frame = useCurrentFrame();
  const idlePose = getIdlePose(mode === 'idle' ? frame : startIdleFrame);
  const recenter = mode === 'idle' ? 1 : 1 - easeWindow(frame, 0, 7);
  const anticipation = mode === 'idle'
    ? 0
    : Math.sin(easeWindow(frame, 0, 7, SETTLE_EASE) * Math.PI);
  const morphProgress = mode === 'idle' ? 0 : easeWindow(frame, 5, 53);
  const unlockProgress = mode === 'idle' ? 0 : easeWindow(frame, 5, 34);
  const flattenProgress = mode === 'idle' ? 0 : easeWindow(frame, 27, 53);
  const foldSettleProgress = mode === 'idle' ? 0 : easeWindow(frame, 44, 57, SETTLE_EASE);
  const landingProgress = mode === 'idle'
    ? 0
    : easeWindow(frame, PAPER_PLANE_UNFOLD_END_FRAME, PAPER_PLANE_SETTLE_END_FRAME, SETTLE_EASE);
  const holdingProgress = mode === 'idle'
    ? 0
    : easeWindow(frame, PAPER_PLANE_SETTLE_END_FRAME, PAPER_PLANE_HOLD_END_FRAME, PAPER_EASE);
  const landingLeadIn = mode === 'idle' ? 0 : easeWindow(frame, 48, 57, SETTLE_EASE);
  const landingEnvelope = landingLeadIn * (1 - landingProgress);

  const idleScale = 0.42;
  const letterScale = 1.15;
  const objectScale = interpolate(
    morphProgress,
    [0, 0.72, 1],
    [idleScale, 0.92, letterScale],
  )
    * (mode === 'idle' ? idlePose.scale : 1)
    * (1 + landingEnvelope * 0.015);
  const objectRotation = interpolate(morphProgress, [0, 1], [-8, 0])
    + idlePose.rotation * recenter
    - landingEnvelope * 0.48;
  const objectX = idlePose.x * recenter;
  const objectY = idlePose.y * recenter
    - anticipation * 13
    + interpolate(foldSettleProgress, [0, 1], [-4, 0])
    - landingEnvelope * 5
    + holdingProgress * 1.4;

  const unlockedCenter = mixPoint(PAPER_PLANE_CENTER, OPEN_PAPER_CENTER, unlockProgress);
  const shapeCenter = mixPoint(unlockedCenter, LETTER_CENTER, flattenProgress);
  const unlockedBoundary = PAPER_PLANE_BOUNDARY.map((point, index) =>
    mixPoint(point, OPEN_PAPER_BOUNDARY[index], unlockProgress)
  );
  const shapeBoundary = unlockedBoundary.map((point, index) =>
    mixPoint(point, LETTER_BOUNDARY[index], flattenProgress)
  );
  const underlayPath = pointsToPath(shapeBoundary);
  const planeLineOpacity = mode === 'idle' ? 0.78 : interpolate(
    frame,
    [0, 7, 21],
    [0.78, 0.74, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: PAPER_EASE },
  );
  const seamOpacity = mode === 'idle' ? 0 : interpolate(
    morphProgress,
    [0, 0.18, 0.55, 0.84, 1],
    [0, 0.06, 0.032, 0.012, 0],
  );
  const letterOutlineOpacity = mode === 'idle' ? 0 : interpolate(
    foldSettleProgress,
    [0, 0.55, 1],
    [0, 0.16, 0.24],
  ) - holdingProgress * 0.045;
  const glowOpacity = mode === 'idle'
    ? idlePose.glow
    : interpolate(morphProgress, [0, 0.3, 1], [0.22, 0.12, 0.05])
      - holdingProgress * 0.012;
  const shadowOpacity = mode === 'idle'
    ? 0.14 + idlePose.y * 0.0034
    : interpolate(morphProgress, [0, 0.7, 1], [0.14, 0.11, 0.09])
      + landingEnvelope * 0.026
      + (1 - holdingProgress) * landingProgress * 0.008;
  const shadowY = mode === 'idle'
    ? 448 - idlePose.y * 0.7
    : interpolate(morphProgress, [0, 1], [448, 510]) + holdingProgress * 1.6;
  const shadowWidth = interpolate(morphProgress, [0, 1], [250, 480]);
  const idleShadowWidth = mode === 'idle' ? 250 - idlePose.y * 3 : shadowWidth;
  const idleShadowHeight = mode === 'idle'
    ? 25 - idlePose.y * 0.34
    : interpolate(morphProgress, [0, 1], [25, 18]);
  const sheenOpacity = mode === 'idle'
    ? 0.18
    : interpolate(morphProgress, [0, 0.72, 1], [0.18, 0.08, 0.14])
      - holdingProgress * 0.025;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'transparent',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox="0 0 900 600"
        width="100%"
        height="100%"
        aria-hidden="true"
        overflow="visible"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id="paper-plane-shadow" x="-30%" y="-50%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <filter id="paper-plane-glow" x="-35%" y="-55%" width="170%" height="230%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <linearGradient id="paper-plane-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="0.58" stopColor="#dcefeb" stopOpacity="0.18" />
            <stop offset="1" stopColor="#e8c99b" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        <ellipse
          cx="455"
          cy={shadowY}
          rx={idleShadowWidth / 2}
          ry={idleShadowHeight}
          fill="#234b50"
          opacity={shadowOpacity}
          filter="url(#paper-plane-shadow)"
        />

        <g
          transform={[
            'translate(450 300)',
            `translate(${objectX} ${objectY})`,
            `rotate(${objectRotation})`,
            `scale(${objectScale})`,
            'translate(-450 -300)',
          ].join(' ')}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path
            d={underlayPath}
            fill="#8fd1e1"
            opacity={glowOpacity}
            filter="url(#paper-plane-glow)"
          />
          <path
            d={underlayPath}
            fill={LETTER_FILL}
            opacity="0.98"
          />

          {PAPER_PLANE_BOUNDARY.map((_, index) => {
            const [start, end] = PIECE_WINDOWS[index];
            const pieceProgress = mode === 'idle' ? 0 : easeWindow(frame, start, end);
            const points = getPiece(shapeBoundary, shapeCenter, index);
            const fill = interpolateColors(
              pieceProgress,
              [0, 1],
              [PLANE_FILLS[index], LETTER_FILL],
            );

            return (
              <path
                key={index}
                d={pointsToPath(points)}
                fill={fill}
                stroke={outlineColor}
                strokeWidth="1.25"
                strokeOpacity={seamOpacity}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path
            d={underlayPath}
            fill="url(#paper-plane-sheen)"
            opacity={sheenOpacity}
          />

          <path
            d={pointsToPath(PAPER_PLANE_BOUNDARY)}
            fill="none"
            stroke={outlineColor}
            strokeWidth="2.2"
            strokeOpacity={planeLineOpacity}
            vectorEffect="non-scaling-stroke"
          />
          {PLANE_DETAIL_PATHS.map((path) => (
            <path
              key={path}
              d={path}
              fill="none"
              stroke={outlineColor}
              strokeWidth="1.7"
              strokeOpacity={planeLineOpacity * 0.78}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path
            d={pointsToPath(LETTER_BOUNDARY)}
            fill="none"
            stroke={outlineColor}
            strokeWidth="1.25"
            strokeOpacity={letterOutlineOpacity}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
}
