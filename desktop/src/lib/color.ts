//  / 

import type { ColorMode } from "@/store/useSettingsStore";
import { MIDDLE_C } from "@/lib/note-utils";
import type { Note } from "@/types/midi";

export const TRACK_PALETTE: Array<{ fill: string; glow: string }> = [
  { fill: "#f5b942", glow: "rgba(245,185,66,0.45)" },   // gold
  { fill: "#4dd4c0", glow: "rgba(77,212,192,0.45)" },   // teal
  { fill: "#c084fc", glow: "rgba(192,132,252,0.45)" },  // purple
  { fill: "#fb7185", glow: "rgba(251,113,133,0.45)" },  // rose
  { fill: "#60a5fa", glow: "rgba(96,165,250,0.45)" },   // sky
  { fill: "#fbbf24", glow: "rgba(251,191,36,0.45)" },   // amber
];

export function trackColor(track: number | undefined): { fill: string; glow: string } {
  const t = track ?? 0;
  const idx = ((t % TRACK_PALETTE.length) + TRACK_PALETTE.length) % TRACK_PALETTE.length;
  return TRACK_PALETTE[idx];
}

/** live input */
export function pianoKeyActiveColor(midi: number, colorMode: ColorMode): string {
  if (colorMode === "none") return "#f5b942";
  return midi < MIDDLE_C ? "#4dd4c0" : "#f5b942";
}

/**  practice  */
export interface SongNoteColorContext {
  practice?: boolean;
  matched?: boolean;
  missed?: boolean;
  isNow: boolean;
}

export function colorForSongNote(
  note: Note, ctx: SongNoteColorContext, colorMode: ColorMode,
): string {
  if (ctx.practice) {
    if (ctx.matched) return "#4ade80";
    if (ctx.missed)  return "rgba(120, 124, 140, 0.35)";
    if (ctx.isNow)   return "#ffffff";
    return "rgba(180, 200, 255, 0.55)";
  }
  if (ctx.isNow) return "#ffffff";
  if (colorMode === "track") return trackColor(note.track).fill;
  if (colorMode === "none")  return "rgba(180, 200, 255, 0.55)";
  // split
  return note.midi >= MIDDLE_C
    ? "rgba(245, 185, 66, 0.85)"
    : "rgba(77, 212, 192, 0.85)";
}

export function glowForSongNote(
  note: Note, ctx: SongNoteColorContext, colorMode: ColorMode,
): string {
  if (ctx.practice) {
    if (ctx.matched) return "rgba(74, 222, 128, 0.55)";
    return "rgba(255,255,255,0.7)";
  }
  if (colorMode === "track") return trackColor(note.track).glow;
  return note.midi >= MIDDLE_C ? "rgba(245,185,66,0.45)" : "rgba(77,212,192,0.45)";
}

/**  active live input */
export function pianoKeySongColor(
  note: { midi: number; track?: number }, colorMode: ColorMode,
): string {
  if (colorMode === "track") return trackColor(note.track).fill;
  if (colorMode === "none")  return "#ffffff";
  return note.midi >= MIDDLE_C ? "#f5b942" : "#4dd4c0";
}

export function glowForMidi(midi: number): string {
  return midi < MIDDLE_C ? "rgba(77,212,192,0.55)" : "rgba(245,185,66,0.55)";
}

/** live input  velocity alpha */
export function colorForMidi(midi: number, velocity: number, colorMode: ColorMode): string {
  const a = 0.55 + 0.35 * (velocity / 127);
  if (colorMode === "none") return `rgba(245, 185, 66, ${a})`;
  return midi >= MIDDLE_C
    ? `rgba(245, 185, 66, ${a})`
    : `rgba(77, 212, 192, ${a})`;
}
