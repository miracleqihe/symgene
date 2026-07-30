import { AMBIENT_MOTION, motionValue } from './ambientMotion';

const PARTICLE_COLORS = [
  [226, 250, 249],
  [179, 230, 219],
  [255, 239, 200],
  [231, 197, 205],
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function getParticleCount(width) {
  const baseCount = width <= 600 ? 4 : width <= 980 ? 8 : 12;
  return Math.round(motionValue(baseCount, AMBIENT_MOTION.particles.count));
}

function isExcludedPosition(x, y, width) {
  const inBrand = x < 0.17 && y < 0.14;
  const inNavigation = x > 0.69 && y < 0.14;

  if (width <= 780) {
    const inCopy = x > 0.02 && x < 0.96 && y > 0.13 && y < 0.4;
    const inSearch = x > 0.02 && x < 0.96 && y > 0.4 && y < 0.56;
    const inPlane = x > 0.2 && x < 0.8 && y > 0.54 && y < 0.84;
    return inBrand || inNavigation || inCopy || inSearch || inPlane;
  }

  const inCopy = x > 0.17 && x < 0.46 && y > 0.31 && y < 0.59;
  const inSearch = x > 0.17 && x < 0.57 && y > 0.57 && y < 0.72;
  const inPlane = x > 0.42 && x < 0.66 && y > 0.31 && y < 0.61;
  return inBrand || inNavigation || inCopy || inSearch || inPlane;
}

function findOpenPosition(random, width, height) {
  let fallback = { x: width * 0.9, y: height * 0.76 };

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const normalizedX = 0.035 + random() * 0.93;
    const normalizedY = 0.06 + random() * 0.88;
    fallback = { x: normalizedX * width, y: normalizedY * height };
    if (!isExcludedPosition(normalizedX, normalizedY, width)) return fallback;
  }

  return fallback;
}

function resetParticle(particle, random, width, height, initial = false) {
  const position = findOpenPosition(random, width, height);
  const color = PARTICLE_COLORS[Math.floor(random() * PARTICLE_COLORS.length)];
  const life = 10 + random() * 12;
  const speed = motionValue(
    4.25 + random() * 7.75,
    AMBIENT_MOTION.particles.speed,
  );
  const direction = random();
  let angle;

  if (direction < 0.52) {
    angle = -Math.PI / 2 + (random() - 0.5) * 0.44;
  } else if (direction < 0.82) {
    angle = (random() > 0.5 ? -Math.PI / 4 : -Math.PI * 0.75)
      + (random() - 0.5) * 0.28;
  } else {
    angle = (random() > 0.5 ? 0 : Math.PI) + (random() - 0.5) * 0.22;
  }

  particle.x = position.x;
  particle.y = position.y;
  particle.radius = particle.isDistant
    ? motionValue(3 + random() * 3)
    : motionValue(0.9 + random() * 1.5);
  particle.vx = Math.cos(angle) * speed;
  particle.vy = Math.sin(angle) * speed;
  particle.waveAmplitude = motionValue(1.6 + random() * 3.4);
  particle.waveSpeed = 0.5 + random() * 0.65;
  particle.phase = random() * Math.PI * 2;
  particle.age = initial ? random() * life : 0;
  particle.life = life;
  particle.opacity = particle.isDistant
    ? motionValue(0.022 + random() * 0.033, AMBIENT_MOTION.particles.opacity)
    : motionValue(0.061 + random() * 0.121, AMBIENT_MOTION.particles.opacity);
  particle.color = color;
}

export function createAmbientParticles(width, height) {
  const random = mulberry32(Math.round(width * 13 + height * 17 + 20260731));
  const count = getParticleCount(width);
  const distantCount = width > 980 ? 3 : width > 600 ? 2 : 1;
  const particles = Array.from({ length: count }, (_, index) => ({
    isDistant: index < distantCount,
  }));
  particles.forEach((particle) => resetParticle(particle, random, width, height, true));
  return { particles, random };
}

export function drawAmbientParticles(
  context,
  system,
  width,
  height,
  deltaSeconds,
  time,
) {
  if (!system) return;

  context.save();
  context.globalCompositeOperation = 'screen';

  system.particles.forEach((particle) => {
    particle.age += deltaSeconds;
    if (
      particle.age >= particle.life
      || particle.x < -30
      || particle.x > width + 30
      || particle.y < -30
      || particle.y > height + 30
    ) {
      resetParticle(particle, system.random, width, height);
    }

    particle.x += (
      particle.vx
      + Math.sin(time * particle.waveSpeed + particle.phase) * particle.waveAmplitude
    ) * deltaSeconds;
    particle.y += (
      particle.vy
      + Math.cos(time * particle.waveSpeed * 0.72 + particle.phase) * particle.waveAmplitude * 0.24
    ) * deltaSeconds;

    const lifecycle = Math.sin(Math.PI * Math.min(1, particle.age / particle.life));
    const shimmer = 0.76 + Math.sin(time * 0.74 + particle.phase) * 0.24;
    const alpha = particle.opacity * lifecycle * shimmer;
    const [red, green, blue] = particle.color;

    if (particle.isDistant) {
      const glow = context.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        particle.radius * 1.7,
      );
      glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
      glow.addColorStop(0.4, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.45})`);
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * 1.7, 0, Math.PI * 2);
      context.fill();
      return;
    }

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}
