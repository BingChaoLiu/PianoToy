// Note Reading mode: single-note sight-reading recognition trainer.
// Session state is not persisted; only user preferences persist.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mulberry32, nextNoteForReading } from "@/lib/note-reading-generator";
import type { NoteKey, ReadingDifficulty } from "@/lib/note-reading-generator";

export type ReadingPhase = "prompt" | "active" | "finished";
export type JudgeResult = "none" | "correct" | "wrong";

interface NoteReadingState {
  noteKey: NoteKey;
  difficulty: ReadingDifficulty;
  phase: ReadingPhase;
  currentNote: number | null;
  correctCount: number;
  wrongCount: number;
  streak: number;
  bestStreak: number;
  totalAttempted: number;
  startTime: number | null;
  seed: number;
  prng: () => number;
  judge: JudgeResult;
  judgeAt: number;

  setKey: (k: NoteKey) => void;
  setDifficulty: (d: ReadingDifficulty) => void;
  startSession: () => void;
  begin: () => void;
  advance: () => void;
  markCorrect: () => void;
  markWrong: (midi: number) => void;
  resetSession: () => void;
}

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export const useNoteReadingStore = create<NoteReadingState>()(
  persist(
    (set, get) => ({
      noteKey: "C",
      difficulty: "easy",

      phase: "prompt",
      currentNote: null,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      bestStreak: 0,
      totalAttempted: 0,
      startTime: null,
      seed: freshSeed(),
      prng: mulberry32(freshSeed()),
      judge: "none",
      judgeAt: 0,

      setKey: (noteKey) => {
        set({ noteKey });
        const s = get();
        if (s.phase === "active" || s.phase === "prompt") {
          const note = nextNoteForReading(s.noteKey, s.difficulty, s.prng);
          set({ currentNote: note });
        }
      },

      setDifficulty: (difficulty) => {
        set({ difficulty });
        const s = get();
        if (s.phase === "active" || s.phase === "prompt") {
          const note = nextNoteForReading(s.noteKey, s.difficulty, s.prng);
          set({ currentNote: note });
        }
      },

      startSession: () => {
        const seed = freshSeed();
        const prng = mulberry32(seed);
        const note = nextNoteForReading(get().noteKey, get().difficulty, prng);
        set({
          phase: "prompt",
          seed,
          prng,
          currentNote: note,
          correctCount: 0,
          wrongCount: 0,
          streak: 0,
          bestStreak: 0,
          totalAttempted: 0,
          startTime: null,
          judge: "none",
          judgeAt: 0,
        });
      },

      begin: () => {
        if (get().phase !== "prompt") return;
        set({ phase: "active", startTime: performance.now() });
      },

      advance: () => {
        const s = get();
        const note = nextNoteForReading(s.noteKey, s.difficulty, s.prng);
        set({ currentNote: note, judge: "none", judgeAt: 0 });
      },

      markCorrect: () => {
        const s = get();
        const streak = s.streak + 1;
        set({
          correctCount: s.correctCount + 1,
          totalAttempted: s.totalAttempted + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          judge: "correct",
          judgeAt: performance.now(),
        });
        get().advance();
      },

      markWrong: (_midi) => {
        const s = get();
        set({
          wrongCount: s.wrongCount + 1,
          totalAttempted: s.totalAttempted + 1,
          streak: 0,
          judge: "wrong",
          judgeAt: performance.now(),
        });
        // Wrong answers keep the same note on screen for retry.
      },

      resetSession: () => {
        const seed = freshSeed();
        const prng = mulberry32(seed);
        set({
          phase: "prompt",
          seed,
          prng,
          currentNote: null,
          correctCount: 0,
          wrongCount: 0,
          streak: 0,
          bestStreak: 0,
          totalAttempted: 0,
          startTime: null,
          judge: "none",
          judgeAt: 0,
        });
      },
    }),
    {
      name: "piano.note-reading",
      version: 1,
      partialize: (s) => ({ noteKey: s.noteKey, difficulty: s.difficulty }),
    },
  ),
);
