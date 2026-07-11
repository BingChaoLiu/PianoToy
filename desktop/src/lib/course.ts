// Course tree + unlock state machine for the note-reading trainer.
//
// Pure data + pure functions only: no Date.now, no DOM, no React. Everything
// here is unit-testable. The card-identity model (CardKey) and the unlock
// derivation are the contract T2 (persistence), T4 (daily queue), and T5 (UI)
// build on.
//
// Design (decided in T3):
//   - CardKey = { pitch (MIDI), clef, key } — structured, mirrors existing
//     vocabulary (reading-staff-renderer uses MIDI; note-reading-generator
//     uses NoteKey).
//   - Unlock/mastered state is PURELY DERIVED from the card map. There are no
//     explicit "unlocked"/"mastered" flags to keep in sync: a level is mastered
//     iff every card in its set clears the mastery threshold (T1); a level is
//     playable iff every level gating it is mastered AND its branch is active.
//   - Levels form a linear chain within a track; cross-branch dependencies are
//     declared per branch (gatedBy).

import type { NoteKey } from "@/lib/note-reading-generator";
import type { Card, MasteryThreshold } from "@/lib/sm2";
import { isMastered } from "@/lib/sm2";

// --- Card identity -----------------------------------------------------------

export type Clef = "treble" | "bass";

/** The identity a single recall card tracks. Opaque `id` for the T1 engine. */
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

export interface Level {
  /** Stable unique id, e.g. "reading-treble-line-notes". */
  id: string;
  /** i18n key for the level's title. */
  titleKey: string;
  /** Which branch this level belongs to. */
  branch: BranchId;
  /** Which track within the branch (treble/bass for reading). */
  track: "treble" | "bass";
  /**
   * 1-based position WITHIN THE BRANCH (global across tracks). The reading
   * branch is a single linear chain: treble line-notes (1) -> ... -> treble
   * accidentals (6) -> bass line-notes (7) -> ... -> bass accidentals (12).
   * The gate is simply "the previous level in catalog order is mastered",
   * which encodes the standard treble-first-then-bass pedagogy.
   */
  position: number;
  /** What kind of cards this level covers (reading branch only for now). */
  kind: ReadingLevelKind;
  /** The explicit card-set this level trains. */
  cards: CardKey[];
}

export interface Branch {
  id: BranchId;
  /** i18n key for the branch name. */
  titleKey: string;
  status: BranchStatus;
  /** Branches that must be fully mastered before ANY level here is playable. */
  gatedBy: BranchId[];
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
    cards,
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

export const BRANCHES: Branch[] = [
  {
    id: "reading-recognition",
    titleKey: "course.branch.reading",
    status: "active",
    gatedBy: [],
    levels: buildReadingLevels(),
  },
  {
    id: "keyboard-location",
    titleKey: "course.branch.keyboard",
    status: "coming-soon",
    gatedBy: ["reading-recognition"],
    levels: [],
  },
  {
    id: "interval-recognition",
    titleKey: "course.branch.interval",
    status: "coming-soon",
    gatedBy: ["reading-recognition"],
    levels: [],
  },
  {
    id: "key-signature-recognition",
    titleKey: "course.branch.key-signature",
    status: "coming-soon",
    gatedBy: ["reading-recognition"],
    levels: [],
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

/** Card keys for a level (throws if unknown — callers should pass known ids). */
export function getLevelCardKeys(levelId: string): CardKey[] {
  return getLevel(levelId).cards;
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

/** True iff every card in the level clears the mastery threshold. */
export function isLevelMastered(state: CourseState, levelId: string): boolean {
  const level = getLevel(levelId);
  if (level.cards.length === 0) return false;
  for (const key of level.cards) {
    const card = state.cards.get(cardKeyToString(key));
    if (!card || !isMastered(card, state.threshold)) return false;
  }
  return true;
}

/** True iff every level in the branch is mastered. */
function isBranchMastered(state: CourseState, branch: Branch): boolean {
  if (branch.levels.length === 0) return false;
  return branch.levels.every((l) => isLevelMastered(state, l.id));
}

/**
 * A level is playable iff:
 *   1. its branch is active (not coming-soon),
 *   2. every cross-branch dependency is fully mastered,
 *   3. the previous level in the branch (catalog order) is mastered — or it's
 *      position 1. For the reading branch this is the single linear chain
 *      treble(1-6) -> bass(7-12); position 1 has no gate.
 */
export function isLevelUnlocked(state: CourseState, levelId: string): boolean {
  const level = getLevel(levelId);
  const branch = getBranch(level.branch);

  if (branch.status !== "active") return false;

  // Cross-branch gates: every gating branch must be fully mastered.
  for (const gateId of branch.gatedBy) {
    if (!isBranchMastered(state, getBranch(gateId))) return false;
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
