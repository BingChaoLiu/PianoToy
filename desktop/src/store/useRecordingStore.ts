// Recording store: captures raw on/off events from any input, finalizes into a Song on stop.

import { create } from "zustand";
import type { Song, Note } from "@/types/midi";

export interface RecordEvent {
  t: number;          // seconds since recording start
  type: "on" | "off";
  midi: number;
  velocity: number;
}

interface RecordingState {
  isRecording: boolean;
  startTime: number;       // performance.now()/1000 when recording started
  events: RecordEvent[];
  lastRecording: Song | null;

  /** Returns true if recording state actually changed. */
  toggle: () => boolean;
  start: () => void;
  stop: () => Song | null;
  /** Called by useInputStore on every on/off; no-op when not recording. */
  recordEvent: (type: "on" | "off", midi: number, velocity: number) => void;
  clearLast: () => void;
}

function buildSong(events: RecordEvent[]): Song | null {
  if (events.length === 0) return null;
  const notes: Note[] = [];
  const open = new Map<number, number>(); // midi -> startT
  for (const ev of events) {
    if (ev.type === "on") {
      // Re-on without off: close previous (>= 10ms apart)
      if (open.has(ev.midi)) {
        const startT = open.get(ev.midi)!;
        if (ev.t > startT + 0.01) {
          notes.push({
            midi: ev.midi, start: startT, duration: ev.t - startT,
            velocity: ev.velocity, track: 0,
          });
        }
      }
      open.set(ev.midi, ev.t);
    } else {
      const startT = open.get(ev.midi);
      if (startT === undefined) continue;
      const dur = Math.max(0.05, ev.t - startT);
      notes.push({
        midi: ev.midi, start: startT, duration: dur,
        velocity: ev.velocity || 96, track: 0,
      });
      open.delete(ev.midi);
    }
  }
  // Close leftover open notes
  const lastT = events[events.length - 1].t;
  open.forEach((s, m) => notes.push({
    midi: m, start: s, duration: Math.max(0.1, lastT - s + 0.2),
    velocity: 96, track: 0,
  }));
  notes.sort((a, b) => a.start - b.start);
  const duration = notes.length
    ? notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)
    : 0;
  return {
    name: `?? ${new Date().toLocaleTimeString()}`,
    notes,
    duration,
    tracks: [{ index: 0, channel: 0 }],
  };
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  isRecording: false,
  startTime: 0,
  events: [],
  lastRecording: null,

  start: () => {
    if (get().isRecording) return;
    set({ isRecording: true, startTime: performance.now() / 1000, events: [] });
  },

  stop: () => {
    if (!get().isRecording) return null;
    const events = get().events.slice();
    set({ isRecording: false, events: [] });
    const song = buildSong(events);
    if (song) set({ lastRecording: song });
    return song;
  },

  toggle: () => {
    const was = get().isRecording;
    if (was) get().stop();
    else get().start();
    return was === get().isRecording ? false : true;
  },

  recordEvent: (type, midi, velocity) => {
    if (!get().isRecording) return;
    const t = performance.now() / 1000 - get().startTime;
    set((s) => ({ events: s.events.concat({ t, type, midi, velocity }) }));
  },

  clearLast: () => set({ lastRecording: null }),
}));
