// Visual effects store: bridges rhythm game events with Stage canvas rendering.
// Stage subscribes to this store to spawn and render particles/shake/flash.

import { create } from "zustand";
import {
  createInitialState,
  spawnHitParticles,
  spawnSustainedParticles,
  checkComboMilestone,
  triggerMissShake,
  type VisualEffectsState,
} from "@/lib/visual-effects";

export interface VFXStore extends VisualEffectsState {
  lastCombo: number;
  hitEvents: number[];
  addHitEvent: (midi: number) => void;
  clearHitEvents: () => void;
  spawnHit: (x: number, y: number) => void;
  spawnSustained: (x: number, y: number, color: string, dt: number) => void;
  spawnMiss: () => void;
  updateCombo: (combo: number, centerX: number, centerY: number) => void;
}

export const useVFXStore = create<VFXStore>()((set, get) => ({
  ...createInitialState(),
  lastCombo: 0,
  hitEvents: [],

  addHitEvent: (midi) => {
    set((s) => ({ hitEvents: [...s.hitEvents, midi] }));
  },

  clearHitEvents: () => {
    set({ hitEvents: [] });
  },

  spawnHit: (x, y) => {
    const s = get();
    spawnHitParticles(s, x, y, 12);
    set({ particles: s.particles });
  },

  spawnSustained: (x, y, color, dt) => {
    const s = get();
    spawnSustainedParticles(s, x, y, color, dt);
    set({ particles: s.particles });
  },

  spawnMiss: () => {
    const s = get();
    triggerMissShake(s);
    set({ shake: s.shake });
  },

  updateCombo: (combo, centerX, centerY) => {
    const s = get();
    if (combo > s.lastCombo && combo !== s.lastCombo + 1) {
      // combo jumped ? could be a new session, skip milestone check
    } else if (combo > s.lastCombo) {
      checkComboMilestone(s, combo, centerX, centerY);
    }
    set({ comboFlash: s.comboFlash, particles: s.particles, lastCombo: combo });
  },
}));
