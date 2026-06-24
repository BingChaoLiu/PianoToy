// App mode navigation: home / free / random-practice / score-practice

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "home" | "free" | "random-practice" | "score-practice" | "note-reading";

interface AppModeState {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  goHome: () => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    (set) => ({
      mode: "home" as AppMode,
      setMode: (mode) => set({ mode }),
      goHome: () => set({ mode: "home" }),
    }),
    {
      name: "piano.app-mode",
      version: 1,
      partialize: () => ({}),
    },
  ),
);
