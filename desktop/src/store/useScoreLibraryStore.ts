// Score library: built-in demos + public domain pieces + imported MIDI.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song } from "@/types/midi";

export type ScoreDifficulty = "easy" | "medium" | "hard";

export interface ScoreEntry {
  id: string;
  name: string;
  composer: string;
  difficulty: ScoreDifficulty;
  /** Duration in seconds, approximate */
  duration: number;
  /** Category for filtering */
  category: string;
  /** Build function for built-in songs, or null for file-based */
  build: (() => Song) | null;
  /** MIDI file path relative to public/ (for public domain pieces) */
  filePath: string | null;
}

interface ScoreLibraryState {
  /** Custom imported scores (metadata persisted, MIDI files stored on disk) */
  customScores: ScoreEntry[];
  addCustomScore: (entry: ScoreEntry) => void;
  removeCustomScore: (id: string) => void;
}

export const useScoreLibraryStore = create<ScoreLibraryState>()(
  persist(
    (set) => ({
      customScores: [],
      addCustomScore: (entry) =>
        set((s) => ({ customScores: [...s.customScores, entry] })),
      removeCustomScore: (id) =>
        set((s) => ({ customScores: s.customScores.filter((e) => e.id !== id) })),
    }),
    {
      name: "piano.score-library",
      version: 1,
      partialize: (s) => ({ customScores: s.customScores.map((e) => ({ ...e, build: null })) }),
    },
  ),
);
