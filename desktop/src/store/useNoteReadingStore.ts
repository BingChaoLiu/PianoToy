// Note Reading mode (T5): reading-recognition practice driven by the SM-2
// spaced-repetition engine.
//
// This store is the impure boundary over the pure practice-controller:
//   - startSession() loads persisted progress (T2), builds a CourseState, and
//     creates a PracticeSession from the T4 daily queue.
//   - answerLetter(letter) judges the answer through the controller, then
//     persists the updated card map via saveProgressDebounced (T2).
//   - exitSession() flushes any pending save so the snapshot is durable.
//
// All decisions (queue consumption, judging, adaptive-timer routing, mastery)
// live in practice-controller.ts and are unit-tested there.

import { create } from "zustand";
import {
  createSession,
  judgeAnswer,
  currentCardKey,
  levelJustMastered,
  nameForPitch,
  cardKeyPitchOf,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_THRESHOLD,
  type PracticeSession,
} from "@/lib/practice-controller";
import { getLevel, type CardMap, type CourseState } from "@/lib/course";
import { type Card, type Outcome } from "@/lib/sm2";
import {
  loadProgress,
  saveProgressDebounced,
  flushPendingSave,
  type ProgressFile,
} from "@/lib/progress-storage";

export type ReadingPhase = "loading" | "active" | "complete";

export interface ProgressionCue {
  levelId: string;
  /** i18n key for the level title (course.reading.<track>.<kind>). */
  titleKey: string;
}

interface NoteReadingState {
  phase: ReadingPhase;
  session: PracticeSession | null;
  /** The persisted file mirror; updated after each answer for debounced save. */
  progress: ProgressFile | null;
  /** Timestamp (ms) when the current card appeared on screen. */
  currentCardAppearAt: number | null;
  /** Timestamp (ms) when the session started (for the summary elapsed time). */
  startTime: number | null;
  /** A level that just flipped to mastered this session, for the cue overlay. */
  lastProgressionCue: ProgressionCue | null;
  /** Transient judge flash for the staff note, cleared after a short hold. */
  judge: "none" | "correct" | "wrong" | "slow";
  /** Pitch of the card being judged (the flash renders THIS note, not the next). */
  judgePitch: number | null;

  startSession: () => Promise<void>;
  answerLetter: (letter: string) => void;
  /** Apply a timeout outcome (the adaptive timer expired). */
  answerTimeout: () => void;
  /** Clear the judge flash (called by the component after the hold window). */
  clearJudge: () => void;
  /** Flush pending save + reset session-local state for a clean re-entry. */
  exitSession: () => Promise<void>;
  /** Dismiss the progression cue overlay. */
  dismissProgressionCue: () => void;
}

/**
 * Build the CourseState the controller expects from a loaded ProgressFile: the
 * plain-object card record becomes a Map keyed by the string CardKey.
 */
function courseStateFromProgress(p: ProgressFile): CourseState {
  const cards: CardMap = new Map();
  for (const [id, card] of Object.entries(p.cards)) cards.set(id, card as Card);
  return { cards, threshold: p.threshold };
}

function progressFromSession(session: PracticeSession, base: ProgressFile): ProgressFile {
  const cards: Record<string, Card> = {};
  for (const [id, card] of session.cards) cards[id] = card;
  return { ...base, cards };
}

export const useNoteReadingStore = create<NoteReadingState>((set, get) => ({
  phase: "loading",
  session: null,
  progress: null,
  currentCardAppearAt: null,
  startTime: null,
  lastProgressionCue: null,
  judge: "none",
  judgePitch: null,

  startSession: async () => {
    const progress = await loadProgress(DEFAULT_THRESHOLD);
    const state = courseStateFromProgress(progress);
    const now = Date.now();
    const session = createSession(state, now, { newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY });
    set({
      progress,
      session,
      phase: session.status === "complete" ? "complete" : "active",
      currentCardAppearAt: session.status === "active" ? performance.now() : null,
      startTime: performance.now(),
      lastProgressionCue: null,
      judge: "none",
      judgePitch: null,
    });
  },

  answerLetter: (letter) => {
    const s = get();
    if (!s.session || s.phase !== "active") return;
    const ck = currentCardKey(s.session);
    if (!ck) return;

    const pitch = cardKeyPitchOf(ck);
    const correct = nameForPitch(pitch);
    const outcome: Outcome = letter === correct ? "correct" : "wrong";
    const reactionMs = measuredReaction(s);
    applyOutcome(s, outcome, set, reactionMs, pitch);
  },

  answerTimeout: () => {
    const s = get();
    if (!s.session || s.phase !== "active") return;
    const ck = currentCardKey(s.session);
    // Timeout = no real reaction sample, so do NOT feed reactionMs to SM-2
    // (forwarding the full limit would inflate RMA and grow the next deadline).
    applyOutcome(s, "slow", set, undefined, ck ? cardKeyPitchOf(ck) : null);
  },

  clearJudge: () => set({ judge: "none", judgePitch: null }),

  exitSession: async () => {
    // Guarantee the last card-map snapshot is durable before the mode tears down.
    try {
      await flushPendingSave();
    } catch {
      // non-fatal: progress is best-effort; the session isn't blocked on disk.
    }
    set({
      phase: "loading",
      session: null,
      progress: null,
      currentCardAppearAt: null,
      startTime: null,
      lastProgressionCue: null,
      judge: "none",
      judgePitch: null,
    });
  },

  dismissProgressionCue: () => set({ lastProgressionCue: null }),
}));

// --- internal: shared outcome application -----------------------------------

type SetFn = (partial: Partial<NoteReadingState>) => void;

/**
 * Apply a judged outcome: route through the controller, persist, and surface
 * side effects (judge flash on the JUDGED card, mastery cue, session-complete
 * phase). Centralized so answerLetter and answerTimeout share post-judge
 * handling.
 *
 * `reactionMs` is the learner's measured reaction (fed to SM-2 for correct/slow
 * RMA updates); pass undefined when there's no real sample (e.g. a timeout).
 * `judgePitch` is the pitch the flash should tint — the card just answered,
 * which may already be off the queue front by the time the store re-renders.
 */
function applyOutcome(
  s: NoteReadingState,
  outcome: Outcome,
  set: SetFn,
  reactionMs: number | undefined,
  judgePitch: number | null,
): void {
  if (!s.session) return;
  const ck = currentCardKey(s.session);
  if (!ck) return;

  const now = Date.now();
  const prevCards = s.session.cards;
  const next = judgeAnswer(s.session, outcome, now, reactionMs);

  // Persist the updated card map (debounced — coalesces rapid answers).
  if (s.progress) {
    const file = progressFromSession(next, s.progress);
    saveProgressDebounced(file);
  }

  // Detect a level flipping to mastered for the progression cue. The level id
  // rides on the queue item that was just answered.
  const levelId = s.session.queue[0]?.levelId;
  let cue: ProgressionCue | null = null;
  if (levelId && outcome !== "slow") {
    // On slow the card repeats, so mastery can't have just changed.
    if (levelJustMastered(prevCards, next.cards, levelId, s.progress?.threshold ?? DEFAULT_THRESHOLD)) {
      cue = { levelId, titleKey: getLevel(levelId).titleKey };
    }
  }

  set({
    session: next,
    progress: s.progress ? progressFromSession(next, s.progress) : s.progress,
    judge: outcome,
    judgePitch,
    currentCardAppearAt: next.status === "active" ? performance.now() : null,
    phase: next.status === "complete" ? "complete" : "active",
    lastProgressionCue: cue ?? s.lastProgressionCue,
  });
}

/** Elapsed ms since the current card appeared — the learner's reaction time. */
function measuredReaction(s: NoteReadingState): number {
  const appearAt = s.currentCardAppearAt ?? performance.now();
  return Math.max(0, performance.now() - appearAt);
}

// --- convenience selector (used by the component) ---------------------------

export function selectCurrentPitch(s: NoteReadingState): number | null {
  if (!s.session) return null;
  const ck = currentCardKey(s.session);
  return ck ? cardKeyPitchOf(ck) : null;
}
