// Free play session stats: duration, key count, range.

import { create } from "zustand";

export interface FreePlayStats {
  startTime: number;
  keyPresses: number;
  lowestMidi: number;
  highestMidi: number;
}

interface FreePlayState extends FreePlayStats {
  active: boolean;
  startSession: () => void;
  recordNote: (midi: number) => void;
  endSession: () => FreePlayStats;
}

const EMPTY: FreePlayStats = {
  startTime: 0,
  keyPresses: 0,
  lowestMidi: 127,
  highestMidi: 0,
};

export const useFreePlayStore = create<FreePlayState>((set, get) => ({
  ...EMPTY,
  active: false,

  startSession: () => set({
    ...EMPTY,
    startTime: Date.now(),
    active: true,
  }),

  recordNote: (midi) => {
    const s = get();
    if (!s.active) return;
    set({
      keyPresses: s.keyPresses + 1,
      lowestMidi: Math.min(s.lowestMidi, midi),
      highestMidi: Math.max(s.highestMidi, midi),
    });
  },

  endSession: () => {
    const s = get();
    const stats = { ...s };
    set({ ...EMPTY, active: false });
    return stats;
  },
}));
