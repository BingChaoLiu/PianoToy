// Rhythm-game core: HP, combo, score, rating, rank.
// Shared by random-practice and score-practice modes.

import { create } from "zustand";
import { persist } from "zustand/middleware";

// --- Rank system ---
export type RankTier = "beginner" | "novice" | "intermediate" | "advanced" | "expert" | "master";

export const RANK_TIERS: { tier: RankTier; threshold: number; label: string }[] = [
  { tier: "beginner", threshold: 0, label: "Beginner" },
  { tier: "novice", threshold: 500, label: "Novice" },
  { tier: "intermediate", threshold: 2000, label: "Intermediate" },
  { tier: "advanced", threshold: 5000, label: "Advanced" },
  { tier: "expert", threshold: 12000, label: "Expert" },
  { tier: "master", threshold: 30000, label: "Master" },
];

export function getRankTier(totalPoints: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (totalPoints >= RANK_TIERS[i].threshold) return RANK_TIERS[i].tier;
  }
  return "beginner";
}

// --- Rating ---
export type Rating = "S" | "A" | "B" | "C" | "D";

export function computeRating(scorePercent: number): Rating {
  if (scorePercent >= 95) return "S";
  if (scorePercent >= 80) return "A";
  if (scorePercent >= 65) return "B";
  if (scorePercent >= 50) return "C";
  return "D";
}

// --- Combo multiplier ---
export function comboMultiplier(combo: number): number {
  if (combo >= 100) return 4.0;
  if (combo >= 50) return 3.0;
  if (combo >= 25) return 2.0;
  if (combo >= 10) return 1.5;
  return 1.0;
}

// --- Combo bonus ---
export function comboBonus(combo: number): number {
  const milestones = [10, 25, 50, 100];
  if (milestones.includes(combo)) return combo * 5;
  return 0;
}

// --- HP system ---
export const MAX_HP = 100;
export const MISS_HP_COST = 8;
export const COMBO_HP_RECOVER = 2; // per hit while combo >= 5

export interface RhythmGameState {
  // Per-session state
  hp: number;
  combo: number;
  maxCombo: number;
  score: number;
  progress: number; // 0..1
  isFinished: boolean;
  isFailed: boolean;
  sessionStartTime: number;
  rating: Rating | null;

  // Persisted rank points
  totalPoints: number;
  rankTier: RankTier;

  // Actions
  startSession: () => void;
  onHit: (timingDeltaSec: number) => void;
  onMiss: () => void;
  onWrong: () => void;
  setProgress: (p: number) => void;
  finishSession: () => void;
  resetSession: () => void;
}

export const useRhythmGameStore = create<RhythmGameState>()(
  persist(
    (set, get) => ({
      hp: MAX_HP,
      combo: 0,
      maxCombo: 0,
      score: 0,
      progress: 0,
      isFinished: false,
      isFailed: false,
      sessionStartTime: 0,
      rating: null,
      totalPoints: 0,
      rankTier: "beginner" as RankTier,

      startSession: () => set({
        hp: MAX_HP,
        combo: 0,
        maxCombo: 0,
        score: 0,
        progress: 0,
        isFinished: false,
        isFailed: false,
        sessionStartTime: Date.now(),
        rating: null,
      }),

      onHit: (timingDeltaSec) => {
        const s = get();
        const newCombo = s.combo + 1;
        const maxCombo = Math.max(s.maxCombo, newCombo);
        const mult = comboMultiplier(newCombo);
        const baseScore = 100;
        // Timing bonus: perfect < 50ms = full, good < 150ms = 0.7, ok = 0.4
        const absMs = Math.abs(timingDeltaSec) * 1000;
        const timingFactor = absMs < 50 ? 1.0 : absMs < 150 ? 0.7 : 0.4;
        const points = Math.round(baseScore * mult * timingFactor);
        const bonus = comboBonus(newCombo);
        let hp = s.hp;
        if (newCombo >= 5) hp = Math.min(MAX_HP, hp + COMBO_HP_RECOVER);
        set({
          combo: newCombo,
          maxCombo,
          score: s.score + points + bonus,
          hp,
        });
      },

      onMiss: () => {
        const s = get();
        const hp = Math.max(0, s.hp - MISS_HP_COST);
        set({
          combo: 0,
          hp,
          isFailed: hp <= 0,
        });
      },

      onWrong: () => {
        // Wrong note doesn't break combo but costs some score
        const s = get();
        set({ score: Math.max(0, s.score - 20) });
      },

      setProgress: (p) => set({ progress: p }),

      finishSession: () => {
        const s = get();
        if (s.isFinished) return;
        const maxPossible = 10000; // rough normalization
        const pct = Math.min(100, (s.score / maxPossible) * 100);
        const rating = computeRating(pct);
        const pointsEarned = s.score;
        const newTotal = s.totalPoints + pointsEarned;
        const newTier = getRankTier(newTotal);
        set({
          isFinished: true,
          rating,
          totalPoints: newTotal,
          rankTier: newTier,
        });
      },

      resetSession: () => set({
        hp: MAX_HP,
        combo: 0,
        maxCombo: 0,
        score: 0,
        progress: 0,
        isFinished: false,
        isFailed: false,
        sessionStartTime: 0,
        rating: null,
      }),
    }),
    {
      name: "piano.rhythm-rank",
      version: 1,
      partialize: (s) => ({
        totalPoints: s.totalPoints,
        rankTier: s.rankTier,
      }),
    },
  ),
);
