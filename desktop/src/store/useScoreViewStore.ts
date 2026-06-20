// Score view mode: waterfall (falling notes) vs staff (sheet music scroll).

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScoreViewMode = "waterfall" | "staff";

interface ScoreViewState {
  mode: ScoreViewMode;
  setMode: (m: ScoreViewMode) => void;
}

export const useScoreViewStore = create<ScoreViewState>()(
  persist(
    (set) => ({
      mode: "waterfall" as ScoreViewMode,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "piano.score-view",
      version: 1,
    },
  ),
);
