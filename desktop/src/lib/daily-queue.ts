// Daily review queue builder for the note-reading trainer.
//
// Decides what the learner practices *today*. Pure functions: `now` is always
// passed in for deterministic tests. No DOM, no React.
//
// Daily session shape (decided in T4):
//   1. Due cards — every card in any UNLOCKED level whose `due` <= now,
//      ordered by due-time ascending (most overdue first). These are the
//      spaced-repetition review backlog.
//   2. New cards — up to `newCardsPerDay` cards from the FRONTIER level: the
//      lowest unlocked level that still has cards with no map entry yet
//      ("new" = never practiced, consistent with T3's lazy-seed model).
//
// Backstop (added to fix the "can't practice again today" deadlock): if the
// strict SM-2 queue (due + new) is empty, fall back to the learner's ENTERED
// BUT NOT-YET-MASTERED cards across unlocked levels (frontier first). This
// respects the spaced-repetition cadence (the strict queue still governs when a
// card is "officially" due) while letting the learner keep practising whenever
// they want — unmastered cards genuinely benefit from extra reps.
//
// The three sets are disjoint by construction: "due" has a future-ish entry now
// due; "new" has no entry; "extra" has an entry that's not due and not mastered.

import {
  allLevels,
  cardKeyToString,
  isLevelUnlocked,
  isLevelMastered,
  type CourseState,
  type Level,
} from "@/lib/course";
import { isMastered } from "@/lib/sm2";

export interface DailyQueueOptions {
  /** Max new cards introduced per session. Tunable (default applied by caller). */
  newCardsPerDay: number;
}

/** A single item in today's queue. `cardKey` is the string form of a CardKey. */
export type QueueItem =
  | { kind: "due"; cardKey: string; due: number; levelId: string }
  | { kind: "new"; cardKey: string; levelId: string }
  | { kind: "extra"; cardKey: string; levelId: string };

/**
 * Build today's practice queue: due cards (urgent first), then a capped batch of
 * new cards from the frontier level. If both are empty, fall back to the
 * entered-but-not-mastered cards so the learner can always keep practising.
 */
export function buildDailyQueue(
  state: CourseState,
  now: number,
  opts: DailyQueueOptions,
): QueueItem[] {
  const dueItems = collectDueCards(state, now);
  const newItems = collectNewCards(state, opts.newCardsPerDay);
  const strict = [...dueItems, ...newItems];
  if (strict.length > 0) return strict;
  return collectExtraCards(state);
}

/** True iff there is nothing left to practice today. */
export function isSessionComplete(queue: QueueItem[]): boolean {
  return queue.length === 0;
}

// --- internals ---------------------------------------------------------------

/** All due cards across unlocked levels, ordered by due time ascending. */
function collectDueCards(state: CourseState, now: number): QueueItem[] {
  const seen = new Set<string>();
  const items: Extract<QueueItem, { kind: "due" }>[] = [];
  for (const level of allLevels()) {
    if (!isLevelUnlocked(state, level.id)) continue;
    for (const cardKey of level.cards) {
      const id = cardKeyToString(cardKey);
      if (seen.has(id)) continue; // cards are shared across levels; take once
      seen.add(id);
      const card = state.cards.get(id);
      if (!card) continue; // never practiced -> not due, it's potentially "new"
      if (card.due <= now) {
        items.push({ kind: "due", cardKey: id, due: card.due, levelId: level.id });
      }
    }
  }
  items.sort((a, b) => a.due - b.due);
  return items;
}

/**
 * Up to `cap` new cards from the frontier level: the lowest unlocked level that
 * still has at least one card with no map entry.
 *
 * We scan levels in catalog order (allLevels already returns them in order),
 * take the first unlocked one that has any un-entered card, and emit its
 * un-entered cards (capped). A level that is fully entered is "started" and
 * not the frontier, even if its cards aren't mastered.
 */
function collectNewCards(state: CourseState, cap: number): QueueItem[] {
  if (cap <= 0) return [];
  const frontier = findFrontierLevel(state);
  if (!frontier) return [];
  const out: QueueItem[] = [];
  for (const cardKey of frontier.cards) {
    if (out.length >= cap) break;
    const id = cardKeyToString(cardKey);
    if (!state.cards.has(id)) {
      out.push({ kind: "new", cardKey: id, levelId: frontier.id });
    }
  }
  return out;
}

/** Lowest unlocked level with at least one un-entered card, or null if none. */
function findFrontierLevel(state: CourseState): Level | null {
  for (const level of allLevels()) {
    if (!isLevelUnlocked(state, level.id)) continue;
    const hasNew = level.cards.some((k) => !state.cards.has(cardKeyToString(k)));
    if (hasNew) return level;
  }
  return null;
}

/**
 * Shared backstop predicate: given a list of candidate cards (each with the
 * level it's being offered from), return those that are ENTERED but NOT YET
 * MASTERED, tagged as "extra" items. Deduplicates by cardKey (shared cards —
 * e.g. "combined" reuses line/space pitches — are taken once, first occurrence
 * wins, preserving its levelId).
 *
 * Both queue builders call this when their strict SM-2 queue is empty, so the
 * "what counts as backstop-able" rule lives in exactly one place. Skipping
 * un-entered cards (those belong to "new") and mastered cards (nothing left to
 * learn) is this helper's contract, not each caller's.
 */
export function backstopExtraCards(
  state: CourseState,
  candidates: ReadonlyArray<{ cardKey: string; levelId: string }>,
): QueueItem[] {
  const seen = new Set<string>();
  const out: QueueItem[] = [];
  for (const c of candidates) {
    if (seen.has(c.cardKey)) continue; // shared card — take once
    seen.add(c.cardKey);
    const card = state.cards.get(c.cardKey);
    if (!card) continue; // un-entered -> belongs to "new", not "extra"
    if (isMastered(card, state.threshold)) continue; // already mastered
    out.push({ kind: "extra", cardKey: c.cardKey, levelId: c.levelId });
  }
  return out;
}

/**
 * Daily backstop candidates: entered-but-not-mastered cards across unlocked,
 * non-mastered levels, in catalog order (so the frontier/lowest level's cards
 * surface first). Mastered levels are skipped wholesale as an optimisation
 * (their cards are all mastered anyway).
 */
function collectExtraCards(state: CourseState): QueueItem[] {
  const candidates: { cardKey: string; levelId: string }[] = [];
  for (const level of allLevels()) {
    if (!isLevelUnlocked(state, level.id)) continue;
    if (isLevelMastered(state, level.id)) continue; // mastered level = done
    for (const k of level.cards) {
      candidates.push({ cardKey: cardKeyToString(k), levelId: level.id });
    }
  }
  return backstopExtraCards(state, candidates);
}
