import { describe, it, expect, beforeEach } from "vitest";
import { useScorePracticeStore } from "@/store/useScorePracticeStore";

describe("useScorePracticeStore", () => {
  beforeEach(() => {
    useScorePracticeStore.getState().setMode("challenge");
  });

  it("defaults to challenge mode", () => {
    expect(useScorePracticeStore.getState().mode).toBe("challenge");
  });

  it("can switch to practice mode", () => {
    useScorePracticeStore.getState().setMode("practice");
    expect(useScorePracticeStore.getState().mode).toBe("practice");
  });

  it("can switch back to challenge mode", () => {
    useScorePracticeStore.getState().setMode("practice");
    useScorePracticeStore.getState().setMode("challenge");
    expect(useScorePracticeStore.getState().mode).toBe("challenge");
  });
});
import { describe as desc2, it as it2, expect as exp2 } from "vitest";
import { useRhythmGameStore, MAX_HP, comboMultiplier, computeRating } from "@/store/useRhythmGameStore";

desc2("rhythm game scoring", () => {
  it2("onHit increases combo and score", () => {
    useRhythmGameStore.getState().resetSession();
    useRhythmGameStore.getState().startSession();
    const before = useRhythmGameStore.getState();
    useRhythmGameStore.getState().onHit(0);
    const after = useRhythmGameStore.getState();
    exp2(after.combo).toBe(before.combo + 1);
    exp2(after.score).toBeGreaterThan(before.score);
  });

  it2("onMiss resets combo and reduces HP", () => {
    useRhythmGameStore.getState().resetSession();
    useRhythmGameStore.getState().startSession();
    // Build some combo first
    useRhythmGameStore.getState().onHit(0);
    useRhythmGameStore.getState().onHit(0);
    exp2(useRhythmGameStore.getState().combo).toBe(2);
    // Miss
    useRhythmGameStore.getState().onMiss();
    exp2(useRhythmGameStore.getState().combo).toBe(0);
    exp2(useRhythmGameStore.getState().hp).toBeLessThan(MAX_HP);
  });

  it2("combo multiplier scales correctly", () => {
    exp2(comboMultiplier(0)).toBe(1.0);
    exp2(comboMultiplier(9)).toBe(1.0);
    exp2(comboMultiplier(10)).toBe(1.5);
    exp2(comboMultiplier(24)).toBe(1.5);
    exp2(comboMultiplier(25)).toBe(2.0);
    exp2(comboMultiplier(49)).toBe(2.0);
    exp2(comboMultiplier(50)).toBe(3.0);
    exp2(comboMultiplier(99)).toBe(3.0);
    exp2(comboMultiplier(100)).toBe(4.0);
  });

  it2("rating computation", () => {
    exp2(computeRating(100)).toBe("S");
    exp2(computeRating(95)).toBe("S");
    exp2(computeRating(94)).toBe("A");
    exp2(computeRating(80)).toBe("A");
    exp2(computeRating(65)).toBe("B");
    exp2(computeRating(50)).toBe("C");
    exp2(computeRating(49)).toBe("D");
    exp2(computeRating(0)).toBe("D");
  });
});
