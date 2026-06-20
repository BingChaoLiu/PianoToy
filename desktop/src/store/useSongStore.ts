//  + /Phase 4 

import { create } from "zustand";
import type { Song } from "@/types/midi";
import { usePracticeStore } from "@/store/usePracticeStore";

interface SongState {
  song: Song | null;
  loadSong: (song: Song) => void;
  unload: () => void;
}

export const useSongStore = create<SongState>((set) => ({
  song: null,
  loadSong: (song) => set({ song }),
  unload: () => {
    set({ song: null });
    // No song => practice mode has nothing to score. Disable it and clear
    // stats so the StatsPanel hides and stale numbers don't bleed into the
    // next session. See the systematic-debugging note for the bug this fixes:
    // practice icon went gray (button disabled) but StatsPanel lingered.
    const practice = usePracticeStore.getState();
    practice.setEnabled(false);
    practice.resetStats();
  },
}));
