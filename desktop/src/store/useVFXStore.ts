// Visual effects store: bridges rhythm game events with Stage canvas rendering.
// Stage subscribes to this store to spawn and render particles/shake/flash.

import { create } from "zustand";
import {
  createInitialState,
  spawnHitParticles,
  checkComboMilestone,
  triggerMissShake,
  type VisualEffectsState,
} from "@/lib/visual-effects";

export interface VFXStore extends VisualEffectsState {
  lastCombo: number;
  spawnHit: (x: number, y: number) => void;
  spawnMiss: () => void;
  updateCombo: (combo: number, centerX: number, centerY: number) => void;
}

export const useVFXStore = create<VFXStore>()((set, get) => ({
  ...createInitialState(),
  lastCombo: 0,

  spawnHit: (x, y) => {
    const s = get();
    spawnHitParticles(s, x, y, 8);
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
