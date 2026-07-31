export const AMBIENT_MOTION = Object.freeze({
  intensity: 1.65,
  aurora: {
    opacity: 1,
    travel: 1,
    speed: 1,
  },
  ribbons: {
    opacity: 1,
    travel: 1,
    speed: 1,
  },
  particles: {
    opacity: 1,
    count: 1,
    speed: 1,
  },
  rings: {
    opacity: 1,
    travel: 1,
    speed: 1,
  },
  parallax: {
    travel: 1,
    response: 1,
  },
  planeIdle: {
    travel: 1,
    rotation: 1,
    speed: 1,
  },
});

export function motionValue(baseValue, channel = 1) {
  return baseValue * AMBIENT_MOTION.intensity * channel;
}
