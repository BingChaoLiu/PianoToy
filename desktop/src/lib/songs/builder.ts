// ? [midi, start, duration, velocity?, track?]  Song?

import type { Note, Song } from "@/types/midi";

export type Row = [number, number, number, number?, number?];

interface Defaults {
  velocity: number;
  track: number;
}

export function buildFromRows(name: string, rows: Row[], defaults: Defaults = { velocity: 92, track: 0 }): Song {
  const notes: Note[] = rows.map((r) => ({
    midi: r[0],
    start: r[1],
    duration: r[2],
    velocity: r[3] ?? defaults.velocity,
    track: r[4] ?? defaults.track,
  }));
  notes.sort((a, b) => a.start - b.start);
  const duration = notes.length
    ? notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)
    : 0;
  return { name, duration, notes, tracks: [{ index: 0 }, { index: 1 }] };
}
