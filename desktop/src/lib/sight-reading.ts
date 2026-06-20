// Sight-reading exercise generator.
// Enhanced with time signatures, interval training, rhythm patterns, and dual-hand mode.
// Deterministic via mulberry32(seed).

import type { Note, Song } from "@/types/midi";

// --- Scale definitions ---
const SCALE_SEMITONES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const CHORD_TONES: Record<string, number[]> = {
  I:  [0, 2, 4],
  IV: [3, 5, 0],
  V:  [4, 6, 1],
  vi: [5, 0, 2],
  iii:[2, 4, 6],
};

const KEY_INDEX: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  Bb: 10, Eb: 3,
};

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type KeyLetter = "C" | "G" | "D" | "A" | "E" | "F" | "Bb" | "Eb";
export type TimeSignature = "2/4" | "3/4" | "4/4" | "6/8";

// Difficulty profiles define what each level includes
const DIFFICULTY_PROFILES = {
  beginner: {
    maxLeap: 2,
    allowedRhythms: ["quarter", "half", "whole"] as string[],
    eighthChance: 0,
    dottedChance: 0,
    tripletChance: 0,
    syncopatedChance: 0,
    allowedOctaveSpan: 1,
    dualHand: false,
    timeSignatures: ["4/4"] as TimeSignature[],
    keys: ["C"] as KeyLetter[],
  },
  intermediate: {
    maxLeap: 4,
    allowedRhythms: ["quarter", "half", "eighth"] as string[],
    eighthChance: 0.25,
    dottedChance: 0.1,
    tripletChance: 0,
    syncopatedChance: 0.05,
    allowedOctaveSpan: 1,
    dualHand: false,
    timeSignatures: ["4/4", "3/4", "2/4"] as TimeSignature[],
    keys: ["C", "G", "F"] as KeyLetter[],
  },
  advanced: {
    maxLeap: 7,
    allowedRhythms: ["quarter", "half", "eighth", "sixteenth", "dotted", "syncopated", "triplet"] as string[],
    eighthChance: 0.35,
    dottedChance: 0.15,
    tripletChance: 0.08,
    syncopatedChance: 0.12,
    allowedOctaveSpan: 2,
    dualHand: true,
    timeSignatures: ["4/4", "3/4", "2/4", "6/8"] as TimeSignature[],
    keys: ["C", "G", "D", "A", "E", "F", "Bb", "Eb"] as KeyLetter[],
  },
};

export interface SightReadingOptions {
  key?: KeyLetter;
  octave?: number;
  bars?: number;
  beatsPerBar?: number;
  beatSec?: number;
  difficulty?: Difficulty;
  seed?: number;
  timeSignature?: TimeSignature;
  dualHand?: boolean;
}

/** mulberry32 PRNG */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: () => number, items: { v: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

export function diatonic(tonicMidi: number, degreeIdx: number, octaveShift: number): number {
  const semis = SCALE_SEMITONES.major;
  const base = tonicMidi + semis[degreeIdx % 7];
  return base + 12 * (octaveShift + Math.floor(degreeIdx / 7));
}

function timeSigBeats(ts: TimeSignature): number {
  switch (ts) {
    case "2/4": return 2;
    case "3/4": return 3;
    case "4/4": return 4;
    case "6/8": return 6;
  }
}

type RhythmEvent = { offset: number; duration: number };

function generateBeatRhythm(
  rng: () => number,
  beatDuration: number,
  profile: typeof DIFFICULTY_PROFILES.beginner,
  isStrongBeat: boolean,
  isLastBeat: boolean,
): RhythmEvent[] {
  if (isLastBeat) {
    return [{ offset: 0, duration: beatDuration * 0.95 }];
  }

  const r = rng();

  // Triplet
  if (profile.tripletChance > 0 && r < profile.tripletChance) {
    const third = beatDuration / 3;
    return [
      { offset: 0, duration: third * 0.9 },
      { offset: third, duration: third * 0.9 },
      { offset: third * 2, duration: third * 0.9 },
    ];
  }

  // Syncopation
  if (profile.syncopatedChance > 0 && !isStrongBeat && r < profile.syncopatedChance + profile.tripletChance) {
    return [{ offset: beatDuration * 0.25, duration: beatDuration * 0.7 }];
  }

  // Dotted rhythm
  if (profile.dottedChance > 0 && r < profile.dottedChance + profile.syncopatedChance + profile.tripletChance) {
    const long = beatDuration * 0.75;
    const short = beatDuration * 0.25;
    return [
      { offset: 0, duration: long * 0.9 },
      { offset: long, duration: short * 0.9 },
    ];
  }

  // Eighth-note subdivision
  if (profile.eighthChance > 0 && r < profile.eighthChance + profile.dottedChance + profile.syncopatedChance + profile.tripletChance) {
    const half = beatDuration / 2;
    return [
      { offset: 0, duration: half * 0.9 },
      { offset: half, duration: half * 0.9 },
    ];
  }

  return [{ offset: 0, duration: beatDuration * 0.95 }];
}

function generateLeftHand(
  rng: () => number,
  tonicMidi: number,
  barStart: number,
  beatDuration: number,
  beatsPerBar: number,
  chord: string,
): Note[] {
  const tones = CHORD_TONES[chord] ?? CHORD_TONES.I;
  const notes: Note[] = [];
  const bassOctave = -1;
  const rootDeg = tones[0];
  const bassMidi = diatonic(tonicMidi, rootDeg, bassOctave);

  notes.push({
    midi: bassMidi,
    start: barStart,
    duration: beatDuration * 1.8,
    velocity: 72,
    track: 1,
  });

  const secondBeat = beatsPerBar >= 4 ? 2 : 1;
  const secondDeg = tones[1 + Math.floor(rng() * (tones.length - 1))];
  const secondMidi = diatonic(tonicMidi, secondDeg, bassOctave);
  notes.push({
    midi: secondMidi,
    start: barStart + secondBeat * beatDuration,
    duration: beatDuration * 1.5,
    velocity: 68,
    track: 1,
  });

  return notes;
}

export interface SightReadingResult {
  song: Song;
  seed: number;
}

export function buildSightReadingExercise(opts: SightReadingOptions = {}): SightReadingResult {
  const difficulty = opts.difficulty ?? "beginner";
  const profile = DIFFICULTY_PROFILES[difficulty];
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);

  const key = opts.key ?? profile.keys[Math.floor(rng() * profile.keys.length)];
  const offset = KEY_INDEX[key];
  if (offset === undefined) throw new Error("unknown key: " + key);

  const ts = opts.timeSignature ?? profile.timeSignatures[Math.floor(rng() * profile.timeSignatures.length)];
  const beatsPerBar = opts.beatsPerBar ?? timeSigBeats(ts);

  const octave = opts.octave != null ? opts.octave : 4;
  const bars = opts.bars ?? 4;
  const beatSec = opts.beatSec ?? 0.5;
  const beatDuration = beatSec;

  const tonicMidi = 12 * (octave + 1) + offset;
  const useDualHand = opts.dualHand ?? (profile.dualHand && rng() > 0.4);

  const progressions = [
    ["I", "IV", "V", "I"],
    ["I", "V", "IV", "I"],
    ["I", "vi", "IV", "V"],
    ["I", "iii", "IV", "V"],
    ["I", "IV", "I", "V"],
    ["I", "V", "vi", "IV"],
  ];
  const prog = progressions[Math.floor(rng() * progressions.length)];

  const notes: Note[] = [];
  const totalBeats = bars * beatsPerBar;

  const startMidi = diatonic(tonicMidi, 0, 0);
  notes.push({ midi: startMidi, start: 0, duration: beatDuration * 0.95, velocity: 88, track: 0 });

  let lastDeg = 0;
  let lastOct = 0;

  for (let beat = 1; beat < totalBeats; beat++) {
    const barIdx = Math.floor(beat / beatsPerBar);
    const beatInBar = beat % beatsPerBar;
    const isStrongBeat = beatInBar === 0;
    const isLastBeat = beat === totalBeats - 1;
    const chord = prog[barIdx % prog.length];

    const rhythmEvents = generateBeatRhythm(rng, beatDuration, profile, isStrongBeat, isLastBeat);

    for (const evt of rhythmEvents) {
      let chosenDeg: number;
      let oct: number;

      if (isLastBeat) {
        chosenDeg = 0;
        oct = 0;
      } else {
        const candidates: { v: number; w: number }[] = [];

        if (isStrongBeat) {
          const tones = CHORD_TONES[chord] ?? CHORD_TONES.I;
          for (const t of tones) {
            candidates.push({ v: t, w: 4 });
          }
          for (let d = 0; d < 7; d++) {
            if (!tones.includes(d)) candidates.push({ v: d, w: 0.5 });
          }
        } else {
          const neighbors = [(lastDeg + 1) % 7, (lastDeg + 6) % 7, lastDeg];
          for (const n of neighbors) {
            candidates.push({ v: n, w: 3 });
          }
          for (let d = 0; d < 7; d++) {
            if (!neighbors.includes(d)) candidates.push({ v: d, w: 0.3 });
          }
        }

        for (const c of candidates) {
          const dist = Math.abs(c.v - lastDeg);
          if (dist > profile.maxLeap) c.w *= 0.01;
          else if (dist >= 5) c.w *= 0.05;
          else if (dist >= 4) c.w *= 0.15;
          else if (dist === 3) c.w *= 0.4;
          else if (dist === 2) c.w *= 0.8;
        }

        chosenDeg = pickWeighted(rng, candidates);
        oct = lastOct;
        let absDeg = chosenDeg + oct * 7;
        const lastAbs = lastDeg + lastOct * 7;
        while (absDeg - lastAbs > 4 && oct > -1) { oct--; absDeg = chosenDeg + oct * 7; }
        while (lastAbs - absDeg > 4 && oct < profile.allowedOctaveSpan) { oct++; absDeg = chosenDeg + oct * 7; }
      }

      const midi = diatonic(tonicMidi, chosenDeg, oct);
      const start = beat * beatDuration + evt.offset;

      notes.push({
        midi,
        start,
        duration: evt.duration,
        velocity: 84 + Math.floor(rng() * 8),
        track: 0,
      });

      lastDeg = chosenDeg;
      lastOct = oct;
    }
  }

  if (useDualHand) {
    for (let bar = 0; bar < bars; bar++) {
      const chord = prog[bar % prog.length];
      const barStart = bar * beatsPerBar * beatDuration;
      const lhNotes = generateLeftHand(rng, tonicMidi, barStart, beatDuration, beatsPerBar, chord);
      notes.push(...lhNotes);
    }
  }

  notes.sort((a, b) => a.start - b.start);
  const duration = notes.length
    ? notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)
    : 0;

  const tsLabel = ts.replace("/", "");
  const handLabel = useDualHand ? " 2H" : "";
  const name = `Sight Reading - ${key} major - ${difficulty} - ${bars} bars ${tsLabel}${handLabel}`;

  return {
    song: {
      name,
      notes,
      duration,
      tracks: useDualHand
        ? [{ index: 0, channel: 0 }, { index: 1, channel: 1 }]
        : [{ index: 0, channel: 0 }],
    },
    seed,
  };
}
