//  +  + Phase 6  practice match?
// Phase 7  recorder events

import { create } from "zustand";
import { useRecordingStore } from "@/store/useRecordingStore";

export type NoteSource = "midi" | "keyboard" | "demo";

export interface ActiveNote {
  velocity: number;
  startTime: number;  // performance.now()/1000
  source: NoteSource;
}

export interface HistoryEntry {
  midi: number;
  velocity: number;
  source: NoteSource;
  start: number;
  end: number | null;
}

interface InputState {
  active: Map<number, ActiveNote>;
  history: HistoryEntry[];
  /** midi ? performance.now()/1000 */
  wrongFlash: Map<number, number>;

  onNoteOn: (midi: number, velocity: number, source: NoteSource) => void;
  onNoteOff: (midi: number) => void;

  flashWrong: (midi: number, durationSec?: number) => void;
  pruneWrongFlash: (now: number) => void;
  pruneHistory: (now: number, maxAgeSec?: number) => void;
  clear: () => void;
}

export const useInputStore = create<InputState>((set, get) => ({
  active: new Map(),
  history: [],
  wrongFlash: new Map(),

  onNoteOn: (midi, velocity, source) => {
    const now = performance.now() / 1000;
    set((s) => {
      const active = new Map(s.active);
      active.set(midi, { velocity, startTime: now, source });
      const history = s.history.concat({ midi, velocity, source, start: now, end: null });
      return { active, history };
    });
    useRecordingStore.getState().recordEvent("on", midi, velocity);
  },

  onNoteOff: (midi) => {
    const now = performance.now() / 1000;
    set((s) => {
      const active = new Map(s.active);
      active.delete(midi);
      //  midi 
      const history = s.history.slice();
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].midi === midi && history[i].end === null) {
          history[i] = { ...history[i], end: now };
          break;
        }
      }
      return { active, history };
    });
    useRecordingStore.getState().recordEvent("off", midi, 0);
  },

  flashWrong: (midi, durationSec = 0.6) => {
    const expire = performance.now() / 1000 + durationSec;
    set((s) => {
      const wrongFlash = new Map(s.wrongFlash);
      wrongFlash.set(midi, expire);
      return { wrongFlash };
    });
  },

  pruneWrongFlash: (now) => {
    const cur = get().wrongFlash;
    let dirty = false;
    const next = new Map<number, number>();
    for (const [k, v] of cur) {
      if (v > now) next.set(k, v);
      else dirty = true;
    }
    if (dirty) set({ wrongFlash: next });
  },

  pruneHistory: (now, maxAgeSec = 8) => {
    const cur = get().history;
    const cutoff = now - maxAgeSec;
    const next = cur.filter((e) => e.end === null || e.end > cutoff);
    if (next.length !== cur.length) set({ history: next });
  },

  clear: () => set({ active: new Map(), history: [], wrongFlash: new Map() }),
}));
