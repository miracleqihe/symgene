export const PAPER_PLANE_FPS = 30;
export const PAPER_PLANE_UNFOLD_FRAMES = 58;
export const PAPER_PLANE_PREPARE_END_FRAME = 6;
export const PAPER_PLANE_UNFOLD_END_FRAME = PAPER_PLANE_UNFOLD_FRAMES - 1;
export const PAPER_PLANE_SETTLE_END_FRAME = 67;
export const PAPER_PLANE_HOLD_END_FRAME = 88;
export const PAPER_PLANE_REVEAL_FRAMES = 17;
export const PAPER_PLANE_REDUCED_HOLD_FRAMES = 9;
export const PAPER_PLANE_REDUCED_REVEAL_FRAMES = 3;
export const PAPER_PLANE_CLOSE_FRAMES = 50;
export const PAPER_PLANE_CONTENT_FADE_OUT_FRAMES = 4;
export const PAPER_PLANE_IDLE_FRAMES = 120;
export const PAPER_PLANE_FRAMES = PAPER_PLANE_IDLE_FRAMES;
export const PAPER_PLANE_WIDTH = 900;
export const PAPER_PLANE_HEIGHT = 600;

export const PAPER_PLANE_CENTER = [438, 322];
export const PAPER_PLANE_BOUNDARY = [
  [150, 285],
  [790, 135],
  [610, 435],
  [420, 365],
  [340, 455],
  [315, 340],
];

export const LETTER_CENTER = [455, 300];
export const LETTER_BOUNDARY = [
  [205, 105],
  [455, 105],
  [705, 105],
  [705, 495],
  [455, 495],
  [205, 495],
];

export const OPEN_PAPER_CENTER = [455, 318];
export const OPEN_PAPER_BOUNDARY = [
  [190, 230],
  [680, 125],
  [725, 245],
  [665, 440],
  [455, 485],
  [235, 420],
];

export const PLANE_FILLS = [
  '#fbfaf5',
  '#f2e6d2',
  '#e7f2ef',
  '#d9ece9',
  '#e7d4b5',
  '#eff8f6',
];

export const LETTER_FILL = '#fffdf8';

export const PIECE_WINDOWS = [
  [15, 41],
  [18, 44],
  [12, 34],
  [5, 22],
  [7, 26],
  [9, 30],
];

export const PLANE_DETAIL_PATHS = [
  'M150 285 L315 340 L790 135',
  'M315 340 L340 455 L420 365 L790 135',
];

export function pointsToPath(points) {
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`;
}

export function mixPoint(from, to, progress) {
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
  ];
}

export function getPiece(points, center, index) {
  return [
    center,
    points[index],
    points[(index + 1) % points.length],
  ];
}
