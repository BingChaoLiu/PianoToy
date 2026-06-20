//  + matchLiveNote / updateMissedNotes  lib/practice?

import { create } from "zustand";
import type { Song } from "@/types/midi";
import {
  createEmptyStats, matchLiveNote, updateMissedNotes, resetNoteFlags,
  accuracy, averageDeltaMs,
  type PracticeStats, type MatchResult,
} from "@/lib/practice";

interface PracticeState {
  enabled: boolean;
  stats: PracticeStats;
  /**  _matched/_missed  toggle  */
  resetForSong: (song: Song | null) => void;
  setEnabled: (v: boolean) => void;
  /**  hit/wrong? */
  match: (song: Song, midi: number, songT: number, hitWindow: number) => MatchResult;
  /** ? RAF  missed? */
  tickMissed: (song: Song, songT: number, hitWindow: number) => void;
  resetStats: () => void;
  /**  0..1? */
  accuracy: () => number;
  /**  |delta|  */
  averageDeltaMs: () => number | null;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  enabled: false,
  stats: createEmptyStats(),

  resetForSong: (song) => {
    resetNoteFlags(song);
    set({ stats: createEmptyStats() });
  },

  setEnabled: (v) => {
    set({ enabled: v });
  },

  match: (song, midi, songT, hitWindow) => {
    const stats = get().stats;
    const result = matchLiveNote({ song, midi, songT, hitWindow });
    if (result.kind === "hit") {
      stats.hits++;
      stats.timingSum += Math.abs(result.deltaTime ?? 0);
      stats.timingCount++;
      set({ stats: { ...stats } });
    } else {
      stats.wrong++;
      set({ stats: { ...stats } });
    }
    return result;
  },

  tickMissed: (song, songT, hitWindow) => {
    const stats = get().stats;
    const before = stats.missed;
    updateMissedNotes({ song, songT, hitWindow }, stats);
    if (stats.missed !== before) {
      set({ stats: { ...stats } });
    }
  },

  resetStats: () => set({ stats: createEmptyStats() }),

  accuracy: () => accuracy(get().stats),
  averageDeltaMs: () => averageDeltaMs(get().stats),
}));
