// Reading practice session controller (T5).
//
// Pure state machine over a T4 daily queue + a T1 card map. This is the
// testable seam: all timing is passed in (`now`, `reactionMs`), there is no
// DOM/React/persistence here. The store (useNoteReadingStore) owns the impure
// bits — loading progress (T2), driving rAF, persisting after each answer — and
// delegates the decisions to these functions.
//
// Session shape (decided in T5):
//   - The queue is built ONCE at session start from buildDailyQueue (T4): due
//     cards (urgent first) then a capped batch of new cards from the frontier.
//   - Each turn shows queue[0]. The learner taps a letter (C/D/E/F/G/A/B).
//   - correct -> SM-2 ladder step, streak++, pop queue.
//   - wrong   -> SM-2 reset, streak=0, pop queue (NO same-card retry — the
//     anti-masking mechanic: one wrong tap ends the card's turn).
//   - slow    -> SM-2 fluency record (ease dent + rma update) but the card
//     STAYS at the front: it repeats for fluency practice. Slow is not a memory
//     failure, so streak is left unchanged.
//   - Adaptive soft timer: limit = card.rma * 1.5 once an RMA exists, else the
//     fixed FIRST_CARD_TIME_LIMIT_MS. Timeout routes to the "slow" outcome.

import { buildDailyQueue, type QueueItem } from "@/lib/daily-queue";
import {
  cardKeyFromString,
  cardKeyToString,
  getLevelCardKeys,
  type CardKey,
  type CardMap,
  type CourseState,
} from "@/lib/course";
import { createCard, schedule, isMastered, type Card, type MasteryThreshold, type Outcome } from "@/lib/sm2";
import { midiLetter } from "@/lib/note-reading-generator";

// --- Defaults (caller may override) -----------------------------------------

/** New cards introduced per session. */
export const DEFAULT_NEW_CARDS_PER_DAY = 5;

/**
 * Mastery threshold persisted in progress.json. A card graduates once its ease
 * clears 2.5 AND its interval clears the 6-day step — i.e. it has moved past
 * the SM-2 short steps into real spaced repetition.
 */
export const DEFAULT_THRESHOLD: MasteryThreshold = { ease: 2.5, intervalDays: 6 };

/** Time limit for a card that has no RMA yet (first encounter). */
export const FIRST_CARD_TIME_LIMIT_MS = 4000;

/** The RMA multiplier: a card's soft deadline is its own rolling reaction time × this. */
const RMA_LIMIT_MULTIPLIER = 1.5;

/** Canonical 7 natural letter names, in diatonic order (C=0 .. B=6). */
export const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;

// --- Pitch <-> letter --------------------------------------------------------

/** Diatonic letter index (0=C .. 6=B) for a MIDI pitch, ignoring accidentals. */
export function letterForPitch(pitch: number): number {
  return midiLetter(pitch);
}

/** The letter name a learner should tap for a given MIDI pitch. */
export function nameForPitch(pitch: number): string {
  return LETTER_NAMES[letterForPitch(pitch)];
}

// --- Session model -----------------------------------------------------------

export interface PracticeSession {
  /** Remaining queue items; queue[0] is the card currently on screen. */
  queue: QueueItem[];
  /** Working copy of the SM-2 card map (session-owned, never the caller's). */
  cards: CardMap;
  correctCount: number;
  wrongCount: number;
  slowCount: number;
  streak: number;
  bestStreak: number;
  status: "active" | "complete";
}

export interface CreateSessionOptions {
  newCardsPerDay: number;
}

/**
 * Build a fresh session from persisted course state: the T4 daily queue drives
 * `queue`, and a defensive COPY of the card map becomes the session's working
 * state (so answering never mutates the caller's map).
 */
export function createSession(
  state: CourseState,
  now: number,
  opts: CreateSessionOptions,
): PracticeSession {
  const queue = buildDailyQueue(state, now, { newCardsPerDay: opts.newCardsPerDay });
  return makeSession(state, queue);
}

/**
 * Build a level-scoped drill session (T6): the queue is restricted to a single
 * level's cards — its due cards first (urgent), then its new (un-entered)
 * cards, with no new-card cap (a focused drill works the whole set). Used when
 * the learner picks a specific level from the course browser.
 */
export function createLevelSession(
  state: CourseState,
  now: number,
  levelId: string,
): PracticeSession {
  const queue = buildLevelQueue(state, now, levelId);
  return makeSession(state, queue);
}

/** The string cardKey of the card currently on screen, or null if complete. */
export function currentCardKey(session: PracticeSession): string | null {
  return session.queue.length > 0 ? session.queue[0].cardKey : null;
}

/**
 * The SM-2 card for the current prompt. New cards (no entry yet) return a fresh
 * card so the caller can read its `rma` for the adaptive timer without special
 * casing. Does NOT mutate the session's map.
 */
export function currentCard(session: PracticeSession): Card | null {
  const ck = currentCardKey(session);
  if (!ck) return null;
  return session.cards.get(ck) ?? createCard();
}

// --- Adaptive soft timer -----------------------------------------------------

/**
 * Soft time limit (ms) for the current card. Uses the card's own rolling
 * reaction time × 1.5 once an RMA exists; otherwise the fixed first-card limit.
 */
export function timeLimitMs(session: PracticeSession): number {
  const card = currentCard(session);
  if (!card || card.rma == null) return FIRST_CARD_TIME_LIMIT_MS;
  return Math.round(card.rma * RMA_LIMIT_MULTIPLIER);
}

/**
 * Countdown-bar geometry for a given elapsed time vs limit.
 *   frac = 1 - elapsed/limit, clamped to [0,1] (1 = full bar, 0 = empty).
 *   red  = 1 - frac, in [0,1] — rises as the bar empties for the reddening cue.
 */
export function timerFrac(elapsedMs: number, limitMs: number): { frac: number; red: number } {
  const raw = limitMs > 0 ? 1 - elapsedMs / limitMs : 0;
  const frac = Math.max(0, Math.min(1, raw));
  return { frac, red: 1 - frac };
}

// --- Judging (the core reducer) ----------------------------------------------

/**
 * Apply an answer outcome to the session. Returns a NEW session; the input is
 * never mutated. Routes to SM-2 `schedule` and updates stats + queue per the
 * T5 mechanic table (see module header).
 *
 * `reactionMs` is forwarded to SM-2 for correct/slow (RMA update); it is
 * ignored for wrong (a wrong answer isn't a recall-speed data point).
 */
export function judgeAnswer(
  session: PracticeSession,
  outcome: Outcome,
  now: number,
  reactionMs?: number,
): PracticeSession {
  const ck = currentCardKey(session);
  if (!ck) return session; // nothing to judge when complete

  const prevCard = session.cards.get(ck) ?? createCard();
  const nextCard = schedule(prevCard, { outcome, now, reactionMs });

  // Copy the map and write the updated card.
  const cards = new Map(session.cards);
  cards.set(ck, nextCard);

  if (outcome === "slow") {
    // SM-2 records the fluency miss, but the card STAYS at the front: it
    // repeats for fluency practice. Streak is left unchanged.
    return {
      ...session,
      cards,
      slowCount: session.slowCount + 1,
    };
  }

  // correct / wrong both consume the card (pop queue).
  const queue = session.queue.slice(1);
  const streak = outcome === "correct" ? session.streak + 1 : 0;
  return {
    ...session,
    cards,
    queue,
    correctCount: session.correctCount + (outcome === "correct" ? 1 : 0),
    wrongCount: session.wrongCount + (outcome === "wrong" ? 1 : 0),
    streak,
    bestStreak: Math.max(session.bestStreak, streak),
    status: queue.length === 0 ? "complete" : "active",
  };
}

// --- Mastery / progression cue ----------------------------------------------

/**
 * True iff `levelId` flipped from unmastered (in prev) to mastered (in curr).
 * The store calls this after each answer to fire the progression cue. The level's
 * card-set is resolved from the T3 catalog (pure data), so callers pass only the
 * two card maps + the shared threshold.
 */
export function levelJustMastered(
  prev: CardMap,
  curr: CardMap,
  levelId: string,
  threshold: MasteryThreshold,
): boolean {
  const levelCards = getLevelCardKeys(levelId);
  const was = isLevelCardSetMastered(prev, levelCards, threshold);
  const isNow = isLevelCardSetMastered(curr, levelCards, threshold);
  return !was && isNow;
}

/** Re-export for the store's convenience so it doesn't need course directly. */
export function cardKeyPitchOf(cardKey: string): number {
  return cardKeyFromString(cardKey).pitch;
}

// --- internal ----------------------------------------------------------------

function isLevelCardSetMastered(
  cards: CardMap,
  levelCards: ReadonlyArray<CardKey>,
  threshold: MasteryThreshold,
): boolean {
  if (levelCards.length === 0) return false;
  for (const k of levelCards) {
    const card = cards.get(cardKeyToString(k));
    if (!card || !isMastered(card, threshold)) return false;
  }
  return true;
}

/**
 * Build a queue scoped to a single level: due cards first (sorted by due asc),
 * then the level's new (un-entered) cards. No new-card cap — a focused drill
 * works the whole set. Mirrors buildDailyQueue's structure but for one level.
 */
function buildLevelQueue(state: CourseState, now: number, levelId: string): QueueItem[] {
  const levelCards = getLevelCardKeys(levelId);
  const due: Extract<QueueItem, { kind: "due" }>[] = [];
  const fresh: Extract<QueueItem, { kind: "new" }>[] = [];
  for (const k of levelCards) {
    const id = cardKeyToString(k);
    const card = state.cards.get(id);
    if (card) {
      if (card.due <= now) due.push({ kind: "due", cardKey: id, due: card.due, levelId });
    } else {
      fresh.push({ kind: "new", cardKey: id, levelId });
    }
  }
  due.sort((a, b) => a.due - b.due);
  return [...due, ...fresh];
}

/** Construct a PracticeSession from a course state + a pre-built queue. */
function makeSession(state: CourseState, queue: QueueItem[]): PracticeSession {
  return {
    queue,
    cards: new Map(state.cards),
    correctCount: 0,
    wrongCount: 0,
    slowCount: 0,
    streak: 0,
    bestStreak: 0,
    status: queue.length === 0 ? "complete" : "active",
  };
}
