import { describe, it, expect } from "vitest";
import {
  createInitialState,
  spawnHitParticles,
  checkComboMilestone,
  triggerMissShake,
  tickEffects,
} from "@/lib/visual-effects";

describe("visual-effects", () => {
  it("creates initial state with no effects", () => {
    const s = createInitialState();
    expect(s.particles).toHaveLength(0);
    expect(s.shake).toBeNull();
    expect(s.comboFlash).toBeNull();
  });

  it("spawnHitParticles adds particles", () => {
    const s = createInitialState();
    spawnHitParticles(s, 100, 200, 5);
    expect(s.particles).toHaveLength(5);
    expect(s.particles[0].x).toBe(100);
    expect(s.particles[0].y).toBe(200);
    expect(s.particles[0].life).toBe(1);
  });

  it("checkComboMilestone triggers at 10/25/50/100", () => {
    const s = createInitialState();
    checkComboMilestone(s, 10, 400, 300);
    expect(s.particles.length).toBeGreaterThan(0);
    expect(s.comboFlash).not.toBeNull();
    expect(s.comboFlash!.combo).toBe(10);
    expect(s.comboFlash!.remaining).toBeGreaterThan(0);

    // Non-milestone combo should not trigger
    const s2 = createInitialState();
    checkComboMilestone(s2, 7, 400, 300);
    expect(s2.particles).toHaveLength(0);
    expect(s2.comboFlash).toBeNull();
  });

  it("triggerMissShake sets shake state", () => {
    const s = createInitialState();
    triggerMissShake(s);
    expect(s.shake).not.toBeNull();
    expect(s.shake!.intensity).toBe(6);
    expect(s.shake!.remaining).toBe(0.25);
  });

  it("tickEffects updates particles and removes dead ones", () => {
    const s = createInitialState();
    spawnHitParticles(s, 100, 200, 3);
    expect(s.particles).toHaveLength(3);

    // Tick with large dt to kill all particles
    tickEffects(s, 10);
    expect(s.particles).toHaveLength(0);
  });

  it("tickEffects clears shake after duration", () => {
    const s = createInitialState();
    triggerMissShake(s);
    tickEffects(s, 0.3);
    expect(s.shake).toBeNull();
  });

  it("tickEffects clears comboFlash after duration", () => {
    const s = createInitialState();
    checkComboMilestone(s, 25, 400, 300);
    tickEffects(s, 1.0);
    expect(s.comboFlash).toBeNull();
  });

  it("particles move and have gravity applied", () => {
    const s = createInitialState();
    spawnHitParticles(s, 100, 200, 1);
    const p = s.particles[0];
    const origVy = p.vy;
    tickEffects(s, 0.1);
    // Should have moved
    expect(s.particles[0].x).not.toBe(100);
    // Gravity should increase vy
    expect(s.particles[0].vy).toBeGreaterThan(origVy);
  });
});
