// SM-2 spaced-repetition engine + card model.
//
// Pure functions only: every function takes `now` (and any timing) as a
// parameter so tests are deterministic. No Date.now / performance.now inside.
//
// The card represents a single `(pitch, clef, key signature)` recall unit in
// the note-reading trainer. This module knows nothing about pitches/clefs —
// those are the caller's identity for the card; here a card is just the
// scheduling state attached to some opaque identity.
//
// Conventions (standard SuperMemo-2):
//   - ease starts at 2.5, interval at 0 days, reps at 0
//   - 1st correct  -> interval = 1d, ease unchanged (correct is ease-neutral)
//   - 2nd correct  -> interval = 6d, ease unchanged
//   - nth correct  -> interval = round(prevInterval * ease), ease unchanged
//   - wrong        -> reset reps to 0, interval to 1d, ease drops
//   - slow         -> ease drops (less than wrong) but interval/reps preserved
//   - ease never drops below minEase (default 1.3)

export interface Sm2Config {
  /** Initial ease factor for a new card. */
  startingEase: number;
  /** Hard floor for ease; it never decreases below this. */
  minEase: number;
  /**
   * SM-2 ease deltas per quality grade.
   * correct         -> +0.0  (ease-neutral; a clean correct holds ease)
   * slow            -> -0.14 (a dent, smaller than wrong)
   * wrong           -> -0.5
   */
  easeDeltaSlow: number;
  easeDeltaWrong: number;
  /** SM-2 interval step after the first correct answer (days). */
  firstIntervalDays: number;
  /** SM-2 interval step after the second correct answer (days). */
  secondIntervalDays: number;
  /** EMA alpha for the rolling-mean reaction-time. 0..1. */
  rmaAlpha: number;
}

export const DEFAULT_SM2_CONFIG: Sm2Config = {
  startingEase: 2.5,
  minEase: 1.3,
  easeDeltaSlow: -0.14,
  easeDeltaWrong: -0.5,
  firstIntervalDays: 1,
  secondIntervalDays: 6,
  rmaAlpha: 0.4,
};

const DAY_MS = 86_400_000;

/**
 * A card's scheduling state. `id` is opaque to this module — the caller uses
 * it to identify which `(pitch, clef, key)` this card is for.
 */
export interface Card {
  /** Opaque caller identity (e.g. `(pitch, clef, key)` tuple). Not used here. */
  id?: string;
  /** Ease factor (SM-2). Higher = longer intervals. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Number of consecutive correct answers (resets to 0 on wrong). */
  reps: number;
  /** Timestamp (ms) when the card is next due. */
  due: number;
  /** Rolling mean of reaction time (ms). null until the first answer. */
  rma: number | null;
  /** Timestamp (ms) of the last answer, or null if never answered. */
  lastAnswered: number | null;
}

export type Outcome = "correct" | "wrong" | "slow";

export interface ScheduleInput {
  outcome: Outcome;
  /** Current time in ms. Passed in for determinism. */
  now: number;
  /** Reaction time for this answer in ms (only meaningful on correct). */
  reactionMs?: number;
  /** Config override; defaults to DEFAULT_SM2_CONFIG. */
  config?: Sm2Config;
}

/** A brand-new card in its initial SM-2 state. */
export function createCard(config: Sm2Config = DEFAULT_SM2_CONFIG): Card {
  return {
    ease: config.startingEase,
    interval: 0,
    reps: 0,
    due: 0,
    rma: null,
    lastAnswered: null,
  };
}

function clampEase(ease: number, cfg: Sm2Config): number {
  return Math.max(cfg.minEase, ease);
}

/** Apply the SM-2 ease adjustment for a quality grade. */
function adjustEase(ease: number, outcome: Outcome, cfg: Sm2Config): number {
  switch (outcome) {
    case "correct":
      return ease; // ease-neutral
    case "slow":
      return clampEase(ease + cfg.easeDeltaSlow, cfg);
    case "wrong":
      return clampEase(ease + cfg.easeDeltaWrong, cfg);
  }
}

/**
 * Next interval in days after a correct answer, per the SM-2 schedule.
 * `newReps` is the post-increment rep count (1 after the first correct).
 */
function nextIntervalDays(newReps: number, prevInterval: number, ease: number, cfg: Sm2Config): number {
  if (newReps === 1) return cfg.firstIntervalDays;
  if (newReps === 2) return cfg.secondIntervalDays;
  return Math.round(prevInterval * ease);
}

/**
 * Update the rolling mean reaction time (EMA).
 * Called on correct and slow answers — both reflect the learner's recall
 * speed. Wrong answers skip this: a wrong answer isn't a recall-speed data
 * point (the learner didn't recall it).
 */
function updateRma(prev: number | null, reactionMs: number | undefined, alpha: number): number | null {
  if (reactionMs == null) return prev;
  if (prev == null) return reactionMs;
  return prev + alpha * (reactionMs - prev);
}

/**
 * Schedule a card given an answer outcome. Returns a NEW card — the input is
 * never mutated. Pure.
 */
export function schedule(card: Card, input: ScheduleInput): Card {
  const cfg = input.config ?? DEFAULT_SM2_CONFIG;
  const { outcome, now } = input;

  if (outcome === "wrong") {
    // Reset the learning ladder; ease drops. No RMA update (a wrong answer
    // doesn't reflect the learner's steady-state recall speed).
    const ease = adjustEase(card.ease, outcome, cfg);
    return {
      ...card,
      ease,
      reps: 0,
      interval: cfg.firstIntervalDays,
      due: now + cfg.firstIntervalDays * DAY_MS,
      lastAnswered: now,
    };
  }

  if (outcome === "slow") {
    // Ease dents (less than wrong). Interval and reps are PRESERVED — slow is
    // not a memory failure, just a fluency miss. The card is rescheduled for a
    // short near-term bump so it resurfaces sooner than its full interval.
    const ease = adjustEase(card.ease, outcome, cfg);
    const shortBumpDays = Math.max(1, Math.round(card.interval * 0.5)) || cfg.firstIntervalDays;
    return {
      ...card,
      ease,
      due: now + shortBumpDays * DAY_MS,
      rma: updateRma(card.rma, input.reactionMs, cfg.rmaAlpha),
      lastAnswered: now,
    };
  }

  // correct
  const ease = adjustEase(card.ease, outcome, cfg);
  const reps = card.reps + 1;
  const interval = nextIntervalDays(reps, card.interval, ease, cfg);
  return {
    ...card,
    ease,
    reps,
    interval,
    due: now + interval * DAY_MS,
    rma: updateRma(card.rma, input.reactionMs, cfg.rmaAlpha),
    lastAnswered: now,
  };
}

export interface MasteryThreshold {
  /** Minimum ease for mastery. */
  ease: number;
  /** Minimum interval in days for mastery. */
  intervalDays: number;
}

/**
 * A card is mastered when BOTH its ease and interval clear the threshold.
 * This is the unlock gate for course levels (T3): every card in a level's
 * set must be mastered for the level to be considered mastered.
 */
export function isMastered(card: Card, threshold: MasteryThreshold): boolean {
  return card.ease >= threshold.ease && card.interval >= threshold.intervalDays;
}
