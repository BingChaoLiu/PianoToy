// Note-reading prompt generator: deterministic single-note selection per
// key signature and difficulty tier. Pure function (no DOM), unit-testable.

export type NoteKey = "C" | "G" | "D" | "A" | "E" | "F" | "Bb" | "Eb";
export type ReadingDifficulty = "easy" | "medium" | "hard";

// Deterministic PRNG (same as sight-reading) so a given seed reproduces notes.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which letter-name pitch classes belong to a key signature (0..11 semitones).
// Accidental adjustments are tracked separately for rendering.
export const SCALE_PITCH_CLASS: Record<NoteKey, number[]> = {
  // C major: C D E F G A B
  C: [0, 2, 4, 5, 7, 9, 11],
  // G major: F is sharped -> natural letters C D E F G A B with F altered
  G: [0, 2, 4, 6, 7, 9, 11],
  D: [0, 2, 4, 6, 7, 9, 10],
  A: [0, 1, 4, 6, 7, 9, 10],
  E: [0, 1, 4, 6, 8, 9, 10],
  F: [0, 2, 4, 5, 7, 9, 10],
  Bb: [0, 2, 3, 5, 7, 9, 10],
  Eb: [0, 2, 3, 5, 7, 8, 10],
};

// Key signature display: ordered list of altered letter degrees with accidental.
export interface KeySignatureAccidental {
  letter: number; // 0=C .. 6=B (diatonic letter index)
  kind: "sharp" | "flat";
}
export const KEY_SIGNATURE: Record<NoteKey, KeySignatureAccidental[]> = {
  C: [],
  G: [{ letter: 3, kind: "sharp" }], // F#
  D: [{ letter: 3, kind: "sharp" }, { letter: 0, kind: "sharp" }], // F# C#
  A: [{ letter: 3, kind: "sharp" }, { letter: 0, kind: "sharp" }, { letter: 4, kind: "sharp" }],
  E: [
    { letter: 3, kind: "sharp" },
    { letter: 0, kind: "sharp" },
    { letter: 4, kind: "sharp" },
    { letter: 1, kind: "sharp" },
  ],
  F: [{ letter: 6, kind: "flat" }], // Bb
  Bb: [{ letter: 6, kind: "flat" }, { letter: 2, kind: "flat" }], // Bb Eb
  Eb: [{ letter: 6, kind: "flat" }, { letter: 2, kind: "flat" }, { letter: 5, kind: "flat" }],
};

export const KEY_LABELS: Record<NoteKey, string> = {
  C: "C",
  G: "G",
  D: "D",
  A: "A",
  E: "E",
  F: "F",
  Bb: "B\u266d",
  Eb: "E\u266d",
};

// MIDI range per difficulty tier (treble/bass inclusive bounds).
interface Tier {
  trebleLo: number;
  trebleHi: number;
  bassLo: number;
  bassHi: number;
  keys: NoteKey[];
  allowBass: boolean;
}
const TIERS: Record<ReadingDifficulty, Tier> = {
  // Easy: treble only, within-staff notes, C major.
  easy: { trebleLo: 60, trebleHi: 79, bassLo: 40, bassHi: 57, keys: ["C"], allowBass: false },
  // Medium: treble + bass, slight ledger lines, C/G/F keys.
  medium: { trebleLo: 57, trebleHi: 81, bassLo: 38, bassHi: 60, keys: ["C", "G", "F"], allowBass: true },
  // Hard: both staves, wide range with ledger lines, all keys.
  hard: { trebleLo: 55, trebleHi: 84, bassLo: 36, bassHi: 64, keys: ["C", "G", "D", "A", "E", "F", "Bb", "Eb"], allowBass: true },
};

export function keysForDifficulty(d: ReadingDifficulty): NoteKey[] {
  return TIERS[d].keys;
}

// Build the set of in-scale MIDI pitches within [lo, hi] for a key.
function scaleMidiIn(key: NoteKey, lo: number, hi: number): number[] {
  const pcs = SCALE_PITCH_CLASS[key];
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (pcs.includes(m % 12)) out.push(m);
  }
  return out;
}

/**
 * Produce the next prompt note for note-reading practice.
 * Returns a MIDI note number within the difficulty/key constraints.
 */
export function nextNoteForReading(key: NoteKey, difficulty: ReadingDifficulty, prng: () => number): number {
  const tier = TIERS[difficulty];
  const useBass = tier.allowBass && prng() < 0.5;
  const lo = useBass ? tier.bassLo : tier.trebleLo;
  const hi = useBass ? tier.bassHi : tier.trebleHi;
  const pool = scaleMidiIn(key, lo, hi);
  if (pool.length === 0) return 60; // safety fallback
  return pool[Math.floor(prng() * pool.length)];
}

/** Diatonic letter index (0=C .. 6=B) for a MIDI note, ignoring accidentals. */
const LETTER_BY_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
export function midiLetter(midi: number): number {
  return LETTER_BY_PC[midi % 12];
}

/** Accidental kind a given MIDI note needs beyond the key signature. */
export function accidentalForNote(midi: number, key: NoteKey): "sharp" | "flat" | "natural" | "none" {
  const pc = midi % 12;
  const letter = LETTER_BY_PC[pc];
  const ks = KEY_SIGNATURE[key];
  const altered = ks.find((a) => a.letter === letter);
  const inScale = SCALE_PITCH_CLASS[key].includes(pc);
  if (altered && inScale) return "none"; // covered by key signature
  if (!inScale) {
    // Chromatic alteration not in scale: pick sharp/flat by context.
    // If the natural letter would be a semitone lower, it's a sharp; else flat.
    const naturalPcs = [0, 2, 4, 5, 7, 9, 11];
    const natPc = naturalPcs[letter];
    if (pc > natPc) return "sharp";
    return "flat";
  }
  // In-scale but key wants an alteration on a different letter: natural needed.
  return "none";
}
