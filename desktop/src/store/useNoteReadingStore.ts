// Note Reading mode (T5): reading-recognition practice driven by the SM-2
// spaced-repetition engine.
//
// This store is the impure boundary over the pure practice-controller:
//   - startSession() loads persisted progress (T2), builds a CourseState, and
//     creates a PracticeSession from the T4 daily queue.
//   - answer(value) judges the answer through the controller, then
//     persists the updated card map via saveProgressDebounced (T2).
//   - exitSession() flushes any pending save so the snapshot is durable.
//
// All decisions (queue consumption, judging, adaptive-timer routing, mastery)
// live in practice-controller.ts and are unit-tested there.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createSession,
  createLevelSession,
  judgeAnswer,
  currentCardKey,
  levelJustMastered,
  correctAnswerForEntityKey,
  pitchFromEntityKey,
  challengeActionFor,
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
import { useRhythmGameStore } from "@/store/useRhythmGameStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { type ScorePracticeMode } from "@/store/useScorePracticeStore";

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
  /** Entity key of the card being judged (the flash renders THIS card, not the next). */
  judgeEntityKey: string | null;
  /** Practice vs challenge mode (T7). Reuses the existing ScorePracticeMode enum. */
  practiceMode: ScorePracticeMode;
  /** What scope the current session runs: "daily-mix" or a level id. */
  sessionScope: "daily-mix" | string | null;
  /** True once a challenge run has ended (HP empty or queue cleared). */
  runEnded: boolean;

  startSession: () => Promise<void>;
  /** Start a level-scoped drill session (T6): queue restricted to one level. */
  startLevelSession: (levelId: string) => Promise<void>;
  /** Set practice/challenge mode (T7). */
  setPracticeMode: (m: ScorePracticeMode) => void;
  /** Switch mode and re-launch the current scope in the new mode (T7). */
  switchPracticeMode: (m: ScorePracticeMode) => Promise<void>;
  /** Submit an answer value (a letter name for reading, a key name for key-sig). */
  answer: (value: string) => void;
  /**
   * Submit a pre-judged outcome directly (keyboard-location branch T10). The
   * stage does its own target-vs-click comparison and passes the outcome here,
   * bypassing the string-based comparison in `answer`.
   */
  submitOutcome: (outcome: Outcome) => void;
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
export function courseStateFromProgress(p: ProgressFile): CourseState {
  const cards: CardMap = new Map();
  for (const [id, card] of Object.entries(p.cards)) cards.set(id, card as Card);
  return { cards, threshold: p.threshold };
}

function progressFromSession(session: PracticeSession, base: ProgressFile): ProgressFile {
  const cards: Record<string, Card> = {};
  for (const [id, card] of session.cards) cards[id] = card;
  return { ...base, cards };
}

/**
 * Install a freshly-built session into the store: set phase + appearAt from the
 * session's status and stamp the start time. Shared by startSession (daily mix)
 * and startLevelSession (level drill). In challenge mode it also (re)starts the
 * rhythm-game layer so the HUD has fresh HP/combo/score.
 */
function activateSession(
  set: (partial: Partial<NoteReadingState>) => void,
  get: () => NoteReadingState,
  scope: "daily-mix" | string,
  progress: ProgressFile,
  session: PracticeSession,
): void {
  const challenge = get().practiceMode === "challenge";
  if (challenge) {
    useRhythmGameStore.getState().resetSession();
    useRhythmGameStore.getState().startSession();
    usePracticeStore.getState().setEnabled(true);
  } else {
    // Practice mode: no game layer. Ensure any stale challenge state is cleared.
    usePracticeStore.getState().setEnabled(false);
    useRhythmGameStore.getState().resetSession();
  }
  set({
    progress,
    session,
    sessionScope: scope,
    phase: session.status === "complete" ? "complete" : "active",
    currentCardAppearAt: session.status === "active" ? performance.now() : null,
    startTime: performance.now(),
    lastProgressionCue: null,
    judge: "none",
    judgeEntityKey: null,
    runEnded: false,
  });
}

export const useNoteReadingStore = create<NoteReadingState>()(
  persist(
    (set, get) => ({
      phase: "loading",
      session: null,
      progress: null,
      currentCardAppearAt: null,
      startTime: null,
      lastProgressionCue: null,
      judge: "none",
      judgeEntityKey: null,
      practiceMode: "practice",
      sessionScope: null,
      runEnded: false,

      startSession: async () => {
        const progress = await loadProgress(DEFAULT_THRESHOLD);
        const state = courseStateFromProgress(progress);
        const session = createSession(state, Date.now(), { newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY });
        activateSession(set, get, "daily-mix", progress, session);
      },

      startLevelSession: async (levelId) => {
        const progress = await loadProgress(DEFAULT_THRESHOLD);
        const state = courseStateFromProgress(progress);
        const session = createLevelSession(state, Date.now(), levelId);
        activateSession(set, get, levelId, progress, session);
      },

      setPracticeMode: (m) => set({ practiceMode: m }),

      switchPracticeMode: async (m) => {
        set({ practiceMode: m });
        // Re-launch the current scope in the new mode so the game layer matches.
        const scope = get().sessionScope;
        if (!scope) return;
        if (scope === "daily-mix") {
          await get().startSession();
        } else {
          await get().startLevelSession(scope);
        }
      },

      answer: (value) => {
        const s = get();
        if (!s.session || s.phase !== "active") return;
        if (s.practiceMode === "challenge" && s.runEnded) return; // run over
        const ck = currentCardKey(s.session);
        if (!ck) return;

        const correct = correctAnswerForEntityKey(ck);
        const outcome: Outcome = value === correct ? "correct" : "wrong";
        const reactionMs = measuredReaction(s);
        applyOutcome(s, outcome, set, reactionMs, ck);
      },

      submitOutcome: (outcome) => {
        const s = get();
        if (!s.session || s.phase !== "active") return;
        if (s.practiceMode === "challenge" && s.runEnded) return; // run over
        const ck = currentCardKey(s.session);
        if (!ck) return;
        const reactionMs = measuredReaction(s);
        applyOutcome(s, outcome, set, reactionMs, ck);
      },

      answerTimeout: () => {
        const s = get();
        if (!s.session || s.phase !== "active") return;
        if (s.practiceMode === "challenge" && s.runEnded) return; // run over
        const ck = currentCardKey(s.session);
        // Timeout = no real reaction sample, so do NOT feed reactionMs to SM-2
        // (forwarding the full limit would inflate RMA and grow the next deadline).
        applyOutcome(s, "slow", set, undefined, ck);
      },

      clearJudge: () => set({ judge: "none", judgeEntityKey: null }),

      exitSession: async () => {
        // Guarantee the last card-map snapshot is durable before the mode tears down.
        try {
          await flushPendingSave();
        } catch {
          // non-fatal: progress is best-effort; the session isn't blocked on disk.
        }
        // Tear down the game layer so it doesn't bleed into other modes.
        usePracticeStore.getState().setEnabled(false);
        useRhythmGameStore.getState().resetSession();
        set({
          phase: "loading",
          session: null,
          progress: null,
          currentCardAppearAt: null,
          startTime: null,
          lastProgressionCue: null,
          judge: "none",
          judgeEntityKey: null,
          sessionScope: null,
          runEnded: false,
        });
      },

      dismissProgressionCue: () => set({ lastProgressionCue: null }),
    }),
    {
      name: "piano.note-reading",
      version: 2,
      partialize: (s) => ({ practiceMode: s.practiceMode }),
    },
  ),
);

// --- internal: shared outcome application -----------------------------------

type SetFn = (partial: Partial<NoteReadingState>) => void;

/**
 * Apply a judged outcome: route through the controller, persist, and surface
 * side effects (judge flash on the JUDGED card, mastery cue, session-complete
 * phase). Centralized so answer and answerTimeout share post-judge handling.
 *
 * `reactionMs` is the learner's measured reaction (fed to SM-2 for correct/slow
 * RMA updates); pass undefined when there's no real sample (e.g. a timeout).
 * `judgeEntityKey` is the entity key the flash should tint — the card just
 * answered, which may already be off the queue front by the time the store
 * re-renders.
 */
function applyOutcome(
  s: NoteReadingState,
  outcome: Outcome,
  set: SetFn,
  reactionMs: number | undefined,
  judgeEntityKey: string | null,
): void {
  if (!s.session) return;
  const ck = currentCardKey(s.session);
  if (!ck) return;

  const now = Date.now();
  const prevCards = s.session.cards;
  // SM-2 ALWAYS updates — the learning value is never suspended for the game.
  const next = judgeAnswer(s.session, outcome, now, reactionMs);

  // Persist the updated card map (debounced — coalesces rapid answers).
  if (s.progress) {
    const file = progressFromSession(next, s.progress);
    saveProgressDebounced(file);
  }

  // --- Challenge game layer (T7) -------------------------------------------
  // Lives in its own store so SM-2's "wrong is rescheduled" and HP's "wrong
  // costs you" never conflict. Only active in challenge mode.
  let runEnded = s.runEnded;
  let failed = false;
  if (s.practiceMode === "challenge") {
    const rg = useRhythmGameStore.getState();
    const action = challengeActionFor(outcome);
    if (action === "hit") {
      rg.onHit(0); // reading has no song-time alignment; reward all corrects at full timing
    } else {
      rg.onMiss(); // wrong + timeout cost HP and break combo (per spec)
    }
    // Update the HUD progress bar from the remaining queue.
    const total = s.session.queue.length;
    const remaining = next.queue.length;
    rg.setProgress(total > 0 ? 1 - remaining / total : 1);

    failed = rg.isFailed; // HP hit 0
    const cleared = next.status === "complete"; // queue emptied (success)
    if ((failed || cleared) && !rg.isFinished) {
      rg.finishSession();
      runEnded = true;
    }
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

  // On a failed challenge run, freeze the visible queue (stop advancing) but
  // still persist the post-answer SM-2 state so learning is recorded. The
  // session snapshot shown is the pre-advance one; progress reflects `next`.
  const frozen = failed;
  const persistedProgress = s.progress ? progressFromSession(next, s.progress) : s.progress;
  set({
    session: frozen ? s.session : next,
    progress: persistedProgress,
    judge: outcome,
    judgeEntityKey,
    currentCardAppearAt: next.status === "active" && !frozen ? performance.now() : null,
    phase: frozen ? "active" : next.status === "complete" ? "complete" : "active",
    lastProgressionCue: cue ?? s.lastProgressionCue,
    runEnded,
  });
}

/** Elapsed ms since the current card appeared — the learner's reaction time. */
function measuredReaction(s: NoteReadingState): number {
  const appearAt = s.currentCardAppearAt ?? performance.now();
  return Math.max(0, performance.now() - appearAt);
}

// --- convenience selectors (used by the components) --------------------------

/** The entity key of the current card, or null if the session is complete. */
export function selectCurrentEntityKey(s: NoteReadingState): string | null {
  if (!s.session) return null;
  return currentCardKey(s.session);
}

/** The pitch of the current reading card, or null (reading branch only). */
export function selectCurrentPitch(s: NoteReadingState): number | null {
  const ck = selectCurrentEntityKey(s);
  if (!ck) return null;
  return pitchFromEntityKey(ck);
}

/** The entity key of the card being judged (during a flash), or null. */
export function selectJudgeEntityKey(s: NoteReadingState): string | null {
  return s.judge !== "none" ? s.judgeEntityKey : null;
}
