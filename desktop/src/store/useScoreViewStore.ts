// Score view mode: waterfall (falling notes) vs score (Verovio sheet music).

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScoreViewMode = "waterfall" | "score";

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
      version: 3,
      // Older builds persisted "staff" or "pdf" modes that no longer exist;
      // fall back to "waterfall" so a stale value never lands in an invalid state.
      migrate: (persisted: unknown, fromVersion: number) => {
        const m = (persisted as { mode?: string } | null)?.mode;
        if (fromVersion < 3 || (m !== "waterfall" && m !== "score")) {
          return { mode: "waterfall" } as ScoreViewState;
        }
        return persisted as ScoreViewState;
      },
    },
  ),
);
