// Course tree + unlock state machine for the note-reading trainer.
//
// Pure data + pure functions only: no Date.now, no DOM, no React. Everything
// here is unit-testable. The card-identity model and the unlock derivation are
// the contract T2 (persistence), T4 (daily queue), and T5 (UI) build on.
//
// Design (decided in T3, generalized in T8):
//   - Engine identity is a STRING (`entityKey`). Each branch owns its catalog
//     type + an `entityKeyToString` encoder; the SM-2 engine, daily queue, and
//     session controller work purely on strings and never decode them. The
//     reading branch's catalog type is `CardKey` (pitch/clef/key); the
//     key-signature branch's is `NoteKey`. Branch-specific code decodes strings
//     back to its catalog type when it needs semantic fields (e.g. the reading
//     stage decodes pitch for rendering).
//   - Levels hold `entityKeys: string[]` — the pre-computed string keys. This
//     frees the engine from knowing how to stringify a card: it just iterates
//     the string array.
//   - Unlock/mastered state is PURELY DERIVED from the card map. There are no
//     explicit "unlocked"/"mastered" flags to keep in sync: a level is mastered
//     iff every entity key in its set clears the mastery threshold (T1); a level
//     is playable iff every cross-branch gate is satisfied AND its branch is
//     active.
//   - Levels form a linear chain within a branch (position 1, 2, ...); the gate
//     is "the previous level in catalog order is mastered". Cross-branch
//     dependencies are declared per branch (gatedBy) and use a PARTIAL-PROGRESS
//     gate: a gating branch needs `gateMasteredLevels` levels mastered (not
//     necessarily all). For reading this is 6 (treble track cleared).

import type { NoteKey } from "@/lib/note-reading-generator";
import type { Card, MasteryThreshold } from "@/lib/sm2";
import { isMastered } from "@/lib/sm2";

// --- Reading branch card identity -------------------------------------------
// The reading branch identifies a recall card by (pitch, clef, key). These are
// the encoder/decoder for that catalog type — the engine never calls them.

export type Clef = "treble" | "bass";

/** The reading branch's catalog identity for a single recall card. */
export interface CardKey {
  /** MIDI note number, e.g. 60 = middle C. */
  pitch: number;
  clef: Clef;
  /** Key signature the note is presented under. */
  key: NoteKey;
}

/** Deterministic string form of a CardKey — the Map/JSON key. */
export function cardKeyToString(k: CardKey): string {
  return `${k.pitch}:${k.clef}:${k.key}`;
}

/** Inverse of cardKeyToString. */
export function cardKeyFromString(s: string): CardKey {
  const [pitch, clef, key] = s.split(":");
  return { pitch: Number(pitch), clef: clef as Clef, key: key as NoteKey };
}

// --- Key-signature branch entity identity -----------------------------------

/** Prefix for key-signature entity keys, e.g. "keysig:G". */
export const KEYSIG_ENTITY_PREFIX = "keysig:";

/** Deterministic string form of a NoteKey for the key-sig branch. */
export function keySigEntityKeyToString(k: NoteKey): string {
  return `${KEYSIG_ENTITY_PREFIX}${k}`;
}

/** Inverse of keySigEntityKeyToString — returns the NoteKey or null if invalid. */
export function keySigEntityKeyFromString(s: string): NoteKey | null {
  if (!s.startsWith(KEYSIG_ENTITY_PREFIX)) return null;
  const rest = s.slice(KEYSIG_ENTITY_PREFIX.length);
  if (!VALID_KEYSIG_KEYS.has(rest)) return null;
  return rest as NoteKey;
}

// --- Course catalog ----------------------------------------------------------

export type BranchId =
  | "reading-recognition"
  | "keyboard-location"
  | "interval-recognition"
  | "key-signature-recognition";

export type BranchStatus = "active" | "coming-soon";

/** Kind of level within a track. Drives which cards belong to it. */
export type ReadingLevelKind =
  | "line-notes"
  | "space-notes"
  | "combined"
  | "ledger-below"
  | "ledger-above"
  | "accidentals";

/** Kind of level for the key-signature branch (by accidental count). */
export type KeySigLevelKind = "0-accidentals" | "1-accidental" | "2-accidentals" | "3-accidentals";

/** Kind of level for the interval-recognition branch (by size range). */
export type IntervalLevelKind =
  | "seconds-thirds"
  | "fourths-fifths"
  | "sixths-sevenths"
  | "all-intervals";

export interface Level {
  /** Stable unique id, e.g. "reading-treble-line-notes". */
  id: string;
  /** i18n key for the level's title. */
  titleKey: string;
  /** Which branch this level belongs to. */
  branch: BranchId;
  /** Which track within the branch (treble/bass for reading). */
  track: string;
  /**
   * 1-based position WITHIN THE BRANCH (global across tracks). The reading
   * branch is a single linear chain: treble line-notes (1) -> ... -> treble
   * accidentals (6) -> bass line-notes (7) -> ... -> bass accidentals (12).
   * The gate is simply "the previous level in catalog order is mastered",
   * which encodes the standard treble-first-then-bass pedagogy.
   */
  position: number;
  /** What kind of cards this level covers (branch-specific union). */
  kind: ReadingLevelKind | KeySigLevelKind | IntervalLevelKind | string;
  /** The pre-computed string entity keys this level trains (the Map keys). */
  entityKeys: string[];
}

export interface Branch {
  id: BranchId;
  /** i18n key for the branch name. */
  titleKey: string;
  status: BranchStatus;
  /**
   * Branches that must have `gateMasteredLevels` levels mastered before ANY
   * level here is playable.
   */
  gatedBy: BranchId[];
  /**
   * How many levels of THIS branch must be mastered to satisfy a cross-branch
   * gate that depends on it. For reading this is 6 (treble track cleared) so
   * the new branches become reachable without finishing the entire 12-level
   * reading course.
   */
  gateMasteredLevels: number;
  levels: Level[];
}

// --- Treble/bass pitch tables (MIDI) -----------------------------------------
// Treble staff: lines E4 G4 B4 D5 F5 = 64 67 71 74 77; spaces F4 A4 C5 E5 = 65 69 72 76.
const TREBLE_LINE = [64, 67, 71, 74, 77];
const TREBLE_SPACE = [65, 69, 72, 76];
// Bass staff: lines G2 B2 D3 F3 A3 = 43 47 50 53 57; spaces A2 C3 E3 G3 = 45 48 52 55.
const BASS_LINE = [43, 47, 50, 53, 57];
const BASS_SPACE = [45, 48, 52, 55];

/** Treble ledger lines below the staff: middle C down to A3. */
const TREBLE_LEDGER_BELOW = [60, 62]; // C4 (middle C), D4
/** Treble ledger lines above the staff: A5 up to C6. */
const TREBLE_LEDGER_ABOVE = [81, 83]; // A5, C6
/** Treble accidentals around the staff: one sharp + one flat pair (F#, Bb). */
const TREBLE_ACCIDENTALS = [66, 70]; // F#4, Bb4
/** Bass ledger lines below: B1 up to C2. */
const BASS_LEDGER_BELOW = [35, 38]; // B1, D2
/** Bass ledger lines above: C4 up to E4 (middle-C region above bass staff). */
const BASS_LEDGER_ABOVE = [60, 64]; // C4, E4
/** Bass accidentals: F#3, Bb2. */
const BASS_ACCIDENTALS = [54, 46]; // F#3, Bb2

function readingLevel(
  branch: BranchId,
  track: "treble" | "bass",
  position: number,
  kind: ReadingLevelKind,
  pitches: number[],
): Level {
  const cards: CardKey[] = pitches.map((pitch) => ({
    pitch,
    clef: track,
    key: "C",
  }));
  return {
    id: `reading-${track}-${kind}`,
    titleKey: `course.reading.${track}.${kind}`,
    branch,
    track,
    position,
    kind,
    entityKeys: cards.map(cardKeyToString),
  };
}

function buildReadingLevels(): Level[] {
  const levels: Level[] = [];
  // Global branch position: treble track is 1-6, bass track is 7-12. Treble
  // is taught first (standard pedagogy); bass unlocks once treble is cleared.
  let pos = 0;
  for (const track of ["treble", "bass"] as const) {
    const line = track === "treble" ? TREBLE_LINE : BASS_LINE;
    const space = track === "treble" ? TREBLE_SPACE : BASS_SPACE;
    const ledgerBelow = track === "treble" ? TREBLE_LEDGER_BELOW : BASS_LEDGER_BELOW;
    const ledgerAbove = track === "treble" ? TREBLE_LEDGER_ABOVE : BASS_LEDGER_ABOVE;
    const accidentals = track === "treble" ? TREBLE_ACCIDENTALS : BASS_ACCIDENTALS;
    levels.push(
      readingLevel("reading-recognition", track, ++pos, "line-notes", line),
      readingLevel("reading-recognition", track, ++pos, "space-notes", space),
      readingLevel("reading-recognition", track, ++pos, "combined", [...line, ...space]),
      readingLevel("reading-recognition", track, ++pos, "ledger-below", ledgerBelow),
      readingLevel("reading-recognition", track, ++pos, "ledger-above", ledgerAbove),
      readingLevel("reading-recognition", track, ++pos, "accidentals", accidentals),
    );
  }
  return levels;
}

// --- Key-signature branch catalog -------------------------------------------
// 8 keys (C G D A E F Bb Eb), 4 levels by accidental count:
//   1. 0 accidentals — C alone
//   2. 1 accidental  — G (F#), F (Bb)
//   3. 2 accidentals — D (F# C#), Bb (Bb Eb)
//   4. 3 accidentals — A, E, Eb

/** All 8 key-signature keys in the catalog. */
export const KEYSIG_KEYS: NoteKey[] = ["C", "G", "D", "A", "E", "F", "Bb", "Eb"];

/** Validated set for keySigEntityKeyFromString (defined after KEYSIG_KEYS). */
const VALID_KEYSIG_KEYS: ReadonlySet<string> = new Set(KEYSIG_KEYS);

function keySigLevel(position: number, kind: KeySigLevelKind, keys: NoteKey[]): Level {
  return {
    id: `keysig-${kind}`,
    titleKey: `course.key_signature.${kind}`,
    branch: "key-signature-recognition",
    track: "keysig",
    position,
    kind,
    entityKeys: keys.map(keySigEntityKeyToString),
  };
}

function buildKeySigLevels(): Level[] {
  return [
    keySigLevel(1, "0-accidentals", ["C"]),
    keySigLevel(2, "1-accidental", ["G", "F"]),
    keySigLevel(3, "2-accidentals", ["D", "Bb"]),
    keySigLevel(4, "3-accidentals", ["A", "E", "Eb"]),
  ];
}

// --- Interval-recognition branch catalog ------------------------------------
// 7 interval sizes (2nd–8ve), 4 levels by ascending size range:
//   1. seconds-thirds   — 2nd, 3rd (small consonant)
//   2. fourths-fifths   — 4th, 5th (perfect intervals)
//   3. sixths-sevenths  — 6th, 7th (wider intervals)
//   4. all-intervals     — 2nd..8ve (comprehensive review)
// Cards are keyed by interval SIZE (the abstract category), not by a fixed
// pitch pair — each prompt generates a fresh random instance of that size.

import {
  intervalEntityKeyToString,
  type IntervalSize,
} from "@/lib/interval-generator";

function intervalLevel(position: number, kind: IntervalLevelKind, sizes: IntervalSize[]): Level {
  return {
    id: `interval-${kind}`,
    titleKey: `course.interval.${kind}`,
    branch: "interval-recognition",
    track: "interval",
    position,
    kind,
    entityKeys: sizes.map(intervalEntityKeyToString),
  };
}

function buildIntervalLevels(): Level[] {
  return [
    intervalLevel(1, "seconds-thirds", [2, 3]),
    intervalLevel(2, "fourths-fifths", [4, 5]),
    intervalLevel(3, "sixths-sevenths", [6, 7]),
    intervalLevel(4, "all-intervals", [2, 3, 4, 5, 6, 7, 8]),
  ];
}

export const BRANCHES: Branch[] = [
  {
    id: "reading-recognition",
    titleKey: "course.branch.reading",
    status: "active",
    gatedBy: [],
    /** Reading needs 6 levels (treble track) mastered to satisfy a cross-branch gate. */
    gateMasteredLevels: 6,
    levels: buildReadingLevels(),
  },
  {
    id: "keyboard-location",
    titleKey: "course.branch.keyboard",
    status: "coming-soon",
    gatedBy: ["reading-recognition"],
    gateMasteredLevels: 0,
    levels: [],
  },
  {
    id: "interval-recognition",
    titleKey: "course.branch.interval",
    status: "active",
    gatedBy: ["reading-recognition"],
    gateMasteredLevels: 0,
    levels: buildIntervalLevels(),
  },
  {
    id: "key-signature-recognition",
    titleKey: "course.branch.key-signature",
    status: "active",
    gatedBy: ["reading-recognition"],
    gateMasteredLevels: 0,
    levels: buildKeySigLevels(),
  },
];

// --- Catalog accessors -------------------------------------------------------

export function getBranch(id: BranchId): Branch {
  const b = BRANCHES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown branch: ${id}`);
  return b;
}

export function getLevel(id: string): Level {
  for (const b of BRANCHES) {
    const l = b.levels.find((x) => x.id === id);
    if (l) return l;
  }
  throw new Error(`unknown level: ${id}`);
}

/** Entity keys (string form) for a level — the Map/JSON keys the engine uses. */
export function getLevelEntityKeys(levelId: string): string[] {
  return getLevel(levelId).entityKeys;
}

/** Every level in the tree (active + coming-soon), flat. */
export function allLevels(): Level[] {
  return BRANCHES.flatMap((b) => b.levels);
}

// --- Course state + derived unlock/mastered queries -------------------------

/**
 * A card map keyed by the string form of CardKey. The card's T1 scheduling
 * state is the single source of truth; unlock/mastered are derived from it.
 */
export type CardMap = Map<string, Card>;

export interface CourseState {
  cards: CardMap;
  /** Mastery threshold applied uniformly across levels. */
  threshold: MasteryThreshold;
}

/** True iff every entity key in the level clears the mastery threshold. */
export function isLevelMastered(state: CourseState, levelId: string): boolean {
  const level = getLevel(levelId);
  if (level.entityKeys.length === 0) return false;
  for (const entityKey of level.entityKeys) {
    const card = state.cards.get(entityKey);
    if (!card || !isMastered(card, state.threshold)) return false;
  }
  return true;
}

/** How many levels in a single branch are mastered. */
export function branchMasteredLevelCount(state: CourseState, branchId: BranchId): number {
  const branch = getBranch(branchId);
  let n = 0;
  for (const level of branch.levels) {
    if (isLevelMastered(state, level.id)) n++;
  }
  return n;
}

/**
 * A cross-branch gate is satisfied when the gating branch has at least
 * `gateMasteredLevels` levels mastered. For reading this is 6 (treble track
 * cleared) — the three new branches unlock together once the learner clears
 * treble, without finishing the entire 12-level reading course.
 */
function isBranchGateSatisfied(state: CourseState, gateBranchId: BranchId): boolean {
  const gateBranch = getBranch(gateBranchId);
  const count = branchMasteredLevelCount(state, gateBranchId);
  return count >= gateBranch.gateMasteredLevels;
}

/**
 * A level is playable iff:
 *   1. its branch is active (not coming-soon),
 *   2. every cross-branch dependency's gate is satisfied (partial progress:
 *      the gating branch needs `gateMasteredLevels` levels mastered, not all),
 *   3. the previous level in the branch (catalog order) is mastered — or it's
 *      position 1.
 */
export function isLevelUnlocked(state: CourseState, levelId: string): boolean {
  const level = getLevel(levelId);
  const branch = getBranch(level.branch);

  if (branch.status !== "active") return false;

  // Cross-branch gates: each gating branch must have enough levels mastered.
  for (const gateId of branch.gatedBy) {
    if (!isBranchGateSatisfied(state, gateId)) return false;
  }

  // Within-branch gate: the previous level in catalog order must be mastered,
  // unless this is the first level of the branch (position 1).
  if (level.position > 1) {
    const prev = branch.levels.find((l) => l.position === level.position - 1);
    if (!prev || !isLevelMastered(state, prev.id)) return false;
  }
  return true;
}

/**
 * Levels the learner should consider playing next: unlocked AND not yet
 * mastered. Mastered levels are done; locked levels aren't reachable.
 */
export function nextPlayableLevels(state: CourseState): Level[] {
  const out: Level[] = [];
  for (const level of allLevels()) {
    if (isLevelUnlocked(state, level.id) && !isLevelMastered(state, level.id)) {
      out.push(level);
    }
  }
  return out;
}

/** How many levels are mastered across the whole tree. */
export function masteredLevelCount(state: CourseState): number {
  let n = 0;
  for (const level of allLevels()) {
    if (isLevelMastered(state, level.id)) n++;
  }
  return n;
}

/**
 * A level's display status for the course browser (T6). Derived purely from
 * the unlock machine + card map:
 *   - "mastered"    : every card clears the mastery threshold (done).
 *   - "in-progress" : unlocked and at least one card entered, but not mastered.
 *   - "ready"       : unlocked with no cards entered yet (fresh start).
 *   - "locked"      : a gating level/branch isn't cleared yet.
 */
export type LevelStatus = "locked" | "ready" | "in-progress" | "mastered";

export function levelStatus(state: CourseState, levelId: string): LevelStatus {
  if (isLevelMastered(state, levelId)) return "mastered";
  if (!isLevelUnlocked(state, levelId)) return "locked";
  // Unlocked but not mastered: "in-progress" if the learner has entered any of
  // this level's entity keys, otherwise "ready" (not started).
  const level = getLevel(levelId);
  const started = level.entityKeys.some((k) => state.cards.has(k));
  return started ? "in-progress" : "ready";
}
