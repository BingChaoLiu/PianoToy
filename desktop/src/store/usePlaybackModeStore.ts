// Playback mode: controls whether user input is active or auto-play only.

import { create } from "zustand";

interface PlaybackModeState {
  /** When true, keyboard/MIDI input is disabled and only song auto-plays */
  listenOnly: boolean;
  setListenOnly: (v: boolean) => void;
}

export const usePlaybackModeStore = create<PlaybackModeState>((set) => ({
  listenOnly: false,
  setListenOnly: (listenOnly) => set({ listenOnly }),
}));
