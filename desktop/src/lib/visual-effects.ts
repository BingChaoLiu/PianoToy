// Visual effects: hit particles, miss screen shake, combo milestones.
// Pure functions / tiny state machine; consumed by Stage canvas RAF loop.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface ScreenShake {
  intensity: number;
  remaining: number;
}

export interface ComboFlash {
  combo: number;
  remaining: number;
  scale: number;
}

export interface VisualEffectsState {
  particles: Particle[];
  shake: ScreenShake | null;
  comboFlash: ComboFlash | null;
}

export function createInitialState(): VisualEffectsState {
  return { particles: [], shake: null, comboFlash: null };
}

const HIT_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"];
const MILESTONE_COLORS = ["#fbbf24", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export function spawnHitParticles(
  state: VisualEffectsState,
  x: number,
  y: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 80;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 3,
      color: HIT_COLORS[Math.floor(Math.random() * HIT_COLORS.length)],
    });
  }
}

const MILESTONES = [10, 25, 50, 100];

export function checkComboMilestone(
  state: VisualEffectsState,
  newCombo: number,
  centerX: number,
  centerY: number,
): void {
  if (!MILESTONES.includes(newCombo)) return;
  const count = 20 + Math.floor(newCombo / 2);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 140;
    state.particles.push({
      x: centerX, y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 50,
      life: 1,
      maxLife: 0.6 + Math.random() * 0.4,
      size: 3 + Math.random() * 4,
      color: MILESTONE_COLORS[Math.floor(Math.random() * MILESTONE_COLORS.length)],
    });
  }
  state.comboFlash = { combo: newCombo, remaining: 0.8, scale: 1.5 };
}

export function triggerMissShake(state: VisualEffectsState): void {
  state.shake = { intensity: 6, remaining: 0.25 };
}

export function tickEffects(state: VisualEffectsState, dt: number): void {
  state.particles = state.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 120 * dt;
    p.life -= dt / p.maxLife;
    return p.life > 0;
  });
  if (state.shake) {
    state.shake.remaining -= dt;
    if (state.shake.remaining <= 0) state.shake = null;
  }
  if (state.comboFlash) {
    state.comboFlash.remaining -= dt;
    state.comboFlash.scale = 1 + (state.comboFlash.scale - 1) * Math.pow(0.05, dt);
    if (state.comboFlash.remaining <= 0) state.comboFlash = null;
  }
}

export function renderEffects(
  ctx: CanvasRenderingContext2D,
  state: VisualEffectsState,
  width: number,
  height: number,
): void {
  let shakeX = 0, shakeY = 0;
  if (state.shake) {
    const factor = state.shake.remaining / 0.25;
    shakeX = (Math.random() - 0.5) * 2 * state.shake.intensity * factor;
    shakeY = (Math.random() - 0.5) * 2 * state.shake.intensity * factor;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (state.comboFlash) {
    const flash = state.comboFlash;
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash.remaining / 0.3);
    ctx.font = `bold ${Math.round(48 * flash.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    const text = `${flash.combo}x COMBO!`;
    ctx.strokeText(text, width / 2, height * 0.35);
    ctx.fillText(text, width / 2, height * 0.35);
    ctx.restore();
  }
}
