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
// The two sets are disjoint by construction: a "due" card has a map entry
// (it was practiced before and got a `due` timestamp); a "new" card has none.

import {
  allLevels,
  cardKeyToString,
  isLevelUnlocked,
  type CourseState,
  type Level,
} from "@/lib/course";

export interface DailyQueueOptions {
  /** Max new cards introduced per session. Tunable (default applied by caller). */
  newCardsPerDay: number;
}

/** A single item in today's queue. `cardKey` is the string form of a CardKey. */
export type QueueItem =
  | { kind: "due"; cardKey: string; due: number; levelId: string }
  | { kind: "new"; cardKey: string; levelId: string };

/**
 * Build today's practice queue: due cards (urgent first) then a capped batch of
 * new cards from the frontier level.
 */
export function buildDailyQueue(
  state: CourseState,
  now: number,
  opts: DailyQueueOptions,
): QueueItem[] {
  const dueItems = collectDueCards(state, now);
  const newItems = collectNewCards(state, opts.newCardsPerDay);
  return [...dueItems, ...newItems];
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
