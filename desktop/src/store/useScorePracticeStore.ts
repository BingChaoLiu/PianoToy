// Score practice mode store: tracks whether we are in practice or challenge mode.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScorePracticeMode = "practice" | "challenge";

interface ScorePracticeState {
  mode: ScorePracticeMode;
  setMode: (m: ScorePracticeMode) => void;
}

export const useScorePracticeStore = create<ScorePracticeState>()(
  persist(
    (set) => ({
      mode: "challenge" as ScorePracticeMode,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "piano.score-practice-mode",
      version: 1,
    },
  ),
);
