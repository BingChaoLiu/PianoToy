// Score library store. Built-in catalog (code) + custom scores (file system).
// customScores is an in-memory cache filled by rescan() at startup — it is NOT
// persisted to localStorage (the file system is the source of truth).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song } from "@/types/midi";
import { listScores } from "@/lib/score-storage";

export type ScoreDifficulty = "easy" | "medium" | "hard";

const VALID_DIFFICULTIES: ScoreDifficulty[] = ["easy", "medium", "hard"];

/** Coerce a meta.json difficulty string into a known value (defensive). */
function toDifficulty(raw: string): ScoreDifficulty {
  return (VALID_DIFFICULTIES as string[]).includes(raw) ? (raw as ScoreDifficulty) : "medium";
}

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
  /** True if the score has an accompanying PDF (file-system scores only). */
  hasPdf?: boolean;
}

interface ScoreLibraryState {
  /** Custom imported scores (in-memory cache from file system). */
  customScores: ScoreEntry[];
  /** Whether the initial rescan has completed. */
  loaded: boolean;
  /** Rescan the file system and refresh customScores. */
  rescan: () => Promise<void>;
  addCustomScore: (entry: ScoreEntry) => void;
  removeCustomScore: (id: string) => void;
  setCustomScores: (scores: ScoreEntry[]) => void;
}

export const useScoreLibraryStore = create<ScoreLibraryState>()(
  persist(
    (set) => ({
      customScores: [],
      loaded: false,
      rescan: async () => {
        try {
          const metas = await listScores();
          const entries: ScoreEntry[] = metas.map((m) => ({
            id: m.id,
            name: m.name,
            composer: m.composer,
            difficulty: toDifficulty(m.difficulty),
            duration: m.duration,
            category: "custom",
            build: null,
            filePath: null,
            hasPdf: !!m.hasPdf,
          }));
          set({ customScores: entries, loaded: true });
        } catch (err) {
          console.error("[score-library] rescan failed", err);
          set({ loaded: true }); // don't block the UI on scan failure
        }
      },
      addCustomScore: (entry) =>
        set((s) => ({ customScores: [...s.customScores, entry] })),
      removeCustomScore: (id) =>
        set((s) => ({ customScores: s.customScores.filter((e) => e.id !== id) })),
      setCustomScores: (customScores) => set({ customScores }),
    }),
    {
      name: "piano.score-library",
      version: 2,
      // Persist nothing — the file system is the source of truth. We keep the
      // persist wrapper so the storage key/version exists for any legacy data
      // to be silently replaced on rehydrate.
      partialize: () => ({}),
    },
  ),
);
