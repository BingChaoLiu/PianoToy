// Score library preferences store (localStorage persistence).
// Tracks viewMode (grid vs list) and favorites.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScoreLibraryViewMode = "grid" | "list";

interface ScoreLibraryPrefsState {
  viewMode: ScoreLibraryViewMode;
  favorites: string[];
  setViewMode: (mode: ScoreLibraryViewMode) => void;
  toggleFavorite: (id: string) => void;
}

export const useScoreLibraryPrefsStore = create<ScoreLibraryPrefsState>()(
  persist(
    (set) => ({
      viewMode: "grid" as ScoreLibraryViewMode,
      favorites: [] as string[],
      setViewMode: (viewMode) => set({ viewMode }),
      toggleFavorite: (id) =>
        set((s) => {
          const isFav = s.favorites.includes(id);
          const newFavs = isFav
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id];
          return { favorites: newFavs };
        }),
    }),
    {
      name: "piano.score-library-prefs",
      version: 1,
      partialize: (s) => ({
        viewMode: s.viewMode,
        favorites: s.favorites,
      }),
    },
  ),
);
