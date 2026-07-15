// Interval prompt generator (T9): generates random pitch-pair instances of a
// given interval category. Pure functions — the PRNG is passed in so tests are
// deterministic (same seed → same instance).
//
// Design (from the T9 spec): a card is an abstract interval CATEGORY (size),
// not a fixed pitch pair. A learner who can recognize a major 3rd should
// recognize ANY major 3rd, so each prompt generates a fresh random instance.
// All instances are diatonic in C major (natural pitches only, no accidentals)
// to keep the staff clean for beginners.

import { midiLetter } from "@/lib/note-reading-generator";

/** The 7 interval sizes drilled (2nd through octave). */
export type IntervalSize = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** All 7 interval sizes in ascending order. */
export const INTERVAL_SIZES: readonly IntervalSize[] = [2, 3, 4, 5, 6, 7, 8];

/**
 * A concrete instance of an interval: two MIDI pitches with the correct
 * diatonic distance, plus whether to present them harmonically (stacked) or
 * melodically (sequential).
 */
export interface IntervalInstance {
  /** The lower of the two pitches. */
  lowPitch: number;
  /** The higher of the two pitches. */
  highPitch: number;
  /** The interval category this instance represents. */
  size: IntervalSize;
  /** True = stacked (harmonic), false = sequential (melodic). */
  harmonic: boolean;
}

// --- Treble staff range for generation ---------------------------------------
// C4 (60) up to F5 (77). An 8ve from F5 would reach F6 (89) — too high. So we
// constrain the LOW pitch so that low + size steps stays <= F5. The diatonic
// step table: C=0, D=1, E=2, F=3, G=4, A=5, B=6 per octave (7 per octave).
// We precompute the pool of valid root pitches per size at module load.

/** Natural MIDI pitches in C major within the treble staff range. */
const TREBLE_C_MAJOR_PITCHES: number[] = [];
for (let m = 60; m <= 77; m++) {
  // C-major naturals: PCs 0,2,4,5,7,9,11
  if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) {
    TREBLE_C_MAJOR_PITCHES.push(m);
  }
}

/**
 * The diatonic step of a MIDI note (C=0 per octave, 7 steps per octave).
 * Used to compute interval distance: two notes `size` steps apart form a
 * diatonic interval of that size.
 */
function diatonicStep(midi: number): number {
  const octave = Math.floor(midi / 12);
  return octave * 7 + midiLetter(midi);
}

/**
 * Pre-computed pools of valid root pitches per interval size: a root is valid
 * if the root + `size` diatonic steps up lands on a C-major natural within the
 * treble staff range (<= F5 = 77).
 */
const ROOT_POOLS: Record<IntervalSize, number[]> = {} as Record<IntervalSize, number[]>;
for (const size of INTERVAL_SIZES) {
  const pool: number[] = [];
  for (const root of TREBLE_C_MAJOR_PITCHES) {
    // The target pitch: root + size diatonic steps. We need to find the actual
    // MIDI note that is `size` diatonic steps above `root` and is a C-major
    // natural within range.
    const rootStep = diatonicStep(root);
    const targetStep = rootStep + size;
    // Search the pool for a pitch at this step.
    const target = TREBLE_C_MAJOR_PITCHES.find(
      (p) => diatonicStep(p) === targetStep && p <= 77,
    );
    if (target != null) pool.push(root);
  }
  ROOT_POOLS[size] = pool;
}

/** Pick a random element from a non-empty array using the PRNG. */
function pickRandom<T>(arr: readonly T[], prng: () => number): T {
  return arr[Math.floor(prng() * arr.length)];
}

/**
 * Generate a random instance of the given interval size. Both pitches are
 * C-major naturals within the treble staff range. The instance is ascending
 * (lowPitch < highPitch). Harmonic vs melodic is chosen 50/50.
 *
 * Pure: pass `mulberry32(seed)` for deterministic output.
 */
export function generateIntervalInstance(size: IntervalSize, prng: () => number): IntervalInstance {
  const pool = ROOT_POOLS[size];
  const root = pickRandom(pool, prng);
  const rootStep = diatonicStep(root);
  const targetStep = rootStep + size;
  const top = TREBLE_C_MAJOR_PITCHES.find((p) => diatonicStep(p) === targetStep)!;
  const harmonic = prng() < 0.5;
  return { lowPitch: root, highPitch: top, size, harmonic };
}

// --- Ordinal formatting ------------------------------------------------------

/** Format an interval size as an ordinal abbreviation: 2→"2nd", 8→"8ve". */
export function intervalSizeToString(size: IntervalSize): string {
  switch (size) {
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    case 4:
      return "4th";
    case 5:
      return "5th";
    case 6:
      return "6th";
    case 7:
      return "7th";
    case 8:
      return "8ve";
  }
}

// --- Entity key encoder/decoder ----------------------------------------------

/** Prefix for interval entity keys, e.g. "interval:3". */
export const INTERVAL_ENTITY_PREFIX = "interval:";

/** Encode an interval size as an entity key string. */
export function intervalEntityKeyToString(size: IntervalSize): string {
  return `${INTERVAL_ENTITY_PREFIX}${size}`;
}

/** Validated set for the decoder. */
const VALID_INTERVAL_SIZES: ReadonlySet<string> = new Set(INTERVAL_SIZES.map(String));

/** Decode an entity key to its interval size, or null if invalid/not an interval. */
export function intervalEntityKeyFromString(s: string): IntervalSize | null {
  if (!s.startsWith(INTERVAL_ENTITY_PREFIX)) return null;
  const rest = s.slice(INTERVAL_ENTITY_PREFIX.length);
  if (!VALID_INTERVAL_SIZES.has(rest)) return null;
  return Number(rest) as IntervalSize;
}
