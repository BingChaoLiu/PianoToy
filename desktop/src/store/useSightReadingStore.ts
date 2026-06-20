// Sight-reading store with localStorage persistence (excluding lastSeed to keep each
// session fresh unless the user explicitly generates one).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Difficulty, KeyLetter } from "@/lib/sight-reading";

interface SightReadingState {
  key: KeyLetter;
  octave: number;
  difficulty: Difficulty;
  bars: number;
  bpm: number;
  /** Seed of the most recently generated exercise; NOT persisted (per-session only). */
  lastSeed: number | null;

  setKey: (k: KeyLetter) => void;
  setOctave: (o: number) => void;
  setDifficulty: (d: Difficulty) => void;
  setBars: (b: number) => void;
  setBpm: (b: number) => void;
  setLastSeed: (s: number | null) => void;
}

export const useSightReadingStore = create<SightReadingState>()(
  persist(
    (set) => ({
      key: "C",
      octave: 4,
      difficulty: "intermediate",
      bars: 4,
      bpm: 80,
      lastSeed: null,
      setKey: (key) => set({ key }),
      setOctave: (octave) => set({ octave }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setBars: (bars) => set({ bars }),
      setBpm: (bpm) => set({ bpm }),
      setLastSeed: (lastSeed) => set({ lastSeed }),
    }),
    {
      name: "piano.sight-reading",
      version: 1,
      partialize: (s) => ({
        key: s.key,
        octave: s.octave,
        difficulty: s.difficulty,
        bars: s.bars,
        bpm: s.bpm,
      }),
    },
  ),
);
