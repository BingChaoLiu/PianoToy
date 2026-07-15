// Keyboard-location target generator (T10): generates random target pitches
// for each location-strategy card. Pure functions — the PRNG is passed in so
// tests are deterministic (same seed → same target).
//
// Card identity = location STRATEGY (not a fixed pitch). Each card generates a
// fresh random concrete target (a MIDI note) within the strategy's scope. The
// learner taps the correct physical key on the piano.
//
// Answer modes:
//   - "pitch-class" (levels 1-2): any octave of the target letter is correct.
//   - "exact" (levels 3-5): only the exact MIDI note is correct.

import { noteName, FIRST_MIDI, LAST_MIDI } from "@/lib/note-utils";

/** The 5 level kinds for the keyboard-location branch. */
export type KeyLocLevelKind =
  | "white-landmarks"
  | "black-landmarks"
  | "cross-octave"
  | "short-jumps"
  | "full-range";

/** White-key letter names (card IDs for white-key levels). */
export const KEYLOC_WHITE_LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

/** Black-key names using 's' suffix for sharps (card IDs for black-key levels). */
export const KEYLOC_BLACK_NAMES = ["Cs", "Ds", "Fs", "Gs", "As"] as const;

/** Pitch class (0-11) for each letter name. */
const LETTER_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Pitch class for black-key card IDs (Cs=1, Ds=3, etc.). */
const BLACK_NAME_PC: Record<string, number> = {
  Cs: 1, Ds: 3, Fs: 6, Gs: 8, As: 10,
};

/** Display name for a black-key card ID (Cs → "C♯"). */
const BLACK_DISPLAY: Record<string, string> = {
  Cs: "C\u266F", Ds: "D\u266F", Fs: "F\u266F", Gs: "G\u266F", As: "A\u266F",
};

/** How a target should be matched against the learner's tap. */
export type KeyLocMatchMode = "pitch-class" | "exact";

/** A concrete target for a keyboard-location prompt. */
export interface KeyLocTarget {
  /** The MIDI note the learner should tap. */
  midi: number;
  /** Human-readable name for the prompt label (e.g. "C4", "F♯"). */
  displayName: string;
  /** How to compare the learner's tap against this target. */
  matchMode: KeyLocMatchMode;
}

// --- Entity key encoder/decoder ----------------------------------------------

/** Prefix for keyboard-location entity keys. */
export const KEYLOC_ENTITY_PREFIX = "keyloc:";

/** Encode a level-kind + card-id as an entity key string. */
export function keyLocEntityKeyToString(kind: KeyLocLevelKind, cardId: string): string {
  return `${KEYLOC_ENTITY_PREFIX}${kind}:${cardId}`;
}

/** Decode an entity key to its parts, or null if invalid/not a keyloc key. */
export function keyLocEntityKeyFromString(
  s: string,
): { kind: KeyLocLevelKind; cardId: string } | null {
  if (!s.startsWith(KEYLOC_ENTITY_PREFIX)) return null;
  const rest = s.slice(KEYLOC_ENTITY_PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx < 0) return null;
  const kind = rest.slice(0, colonIdx) as KeyLocLevelKind;
  const cardId = rest.slice(colonIdx + 1);
  const validKinds: KeyLocLevelKind[] = [
    "white-landmarks", "black-landmarks", "cross-octave", "short-jumps", "full-range",
  ];
  if (!validKinds.includes(kind)) return null;
  return { kind, cardId };
}

// --- Target generation -------------------------------------------------------

/** Pick a random element from a non-empty array. */
function pickRandom<T>(arr: readonly T[], prng: () => number): T {
  return arr[Math.floor(prng() * arr.length)];
}

/**
 * Find a MIDI note with the given pitch class within [lo, hi], at a random
 * octave. Returns the first valid MIDI note found scanning from `lo` upward
 * at each octave boundary.
 */
function randomMidiWithPC(pc: number, lo: number, hi: number, prng: () => number): number {
  const candidates: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (m % 12 === pc) candidates.push(m);
  }
  if (candidates.length === 0) return lo + pc; // safety fallback
  return pickRandom(candidates, prng);
}

/**
 * Per-level scope: the MIDI range [lo, hi] and match mode for each strategy.
 * The kind determines how wide a range the target can fall in and whether any
 * octave of the target letter counts (pitch-class) or only the exact MIDI.
 */
const LEVEL_SCOPE: Record<KeyLocLevelKind, { lo: number; hi: number; matchMode: KeyLocMatchMode; isBlack: boolean }> = {
  "white-landmarks": { lo: 48, hi: 83, matchMode: "pitch-class", isBlack: false },
  "black-landmarks": { lo: 48, hi: 83, matchMode: "pitch-class", isBlack: true },
  "cross-octave": { lo: 48, hi: 83, matchMode: "exact", isBlack: false },
  "short-jumps": { lo: 36, hi: 95, matchMode: "exact", isBlack: false },
  "full-range": { lo: FIRST_MIDI, hi: LAST_MIDI, matchMode: "exact", isBlack: false },
};

/**
 * Generate a random target for a keyboard-location entity key. The strategy
 * (level kind) determines the pitch-class scope, octave range, and match mode
 * via the LEVEL_SCOPE table — no per-kind branching needed.
 *
 * Pure: pass `mulberry32(seed)` for deterministic output.
 */
export function generateKeyLocTarget(entityKey: string, prng: () => number): KeyLocTarget {
  const decoded = keyLocEntityKeyFromString(entityKey);
  if (!decoded) {
    return { midi: 60, displayName: "C4", matchMode: "exact" };
  }
  const { kind, cardId } = decoded;
  const scope = LEVEL_SCOPE[kind];

  const pc = scope.isBlack ? (BLACK_NAME_PC[cardId] ?? 1) : (LETTER_PC[cardId] ?? 0);
  const midi = randomMidiWithPC(pc, scope.lo, scope.hi, prng);

  // Display name: letter for pitch-class levels (any octave), full note name
  // for exact levels (must identify the specific octave).
  const displayName = scope.matchMode === "pitch-class"
    ? (scope.isBlack ? (BLACK_DISPLAY[cardId] ?? "?") : cardId)
    : noteName(midi);

  return { midi, displayName, matchMode: scope.matchMode };
}

/**
 * Check if a clicked MIDI matches the target, per the target's match mode.
 * "pitch-class" = any octave correct; "exact" = must be the exact MIDI.
 */
export function keyLocMatches(target: KeyLocTarget, clickedMidi: number): boolean {
  if (target.matchMode === "pitch-class") {
    return clickedMidi % 12 === target.midi % 12;
  }
  return clickedMidi === target.midi;
}
