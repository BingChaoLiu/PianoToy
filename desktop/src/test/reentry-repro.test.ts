// Regression test: "读谱识别练习一次之后再次点开不能继续练习"
//
// Root cause: SM-2 reschedules answered cards into the FUTURE (tomorrow+), and
// newCardsPerDay=5 was exactly enough to enter the whole 5-card frontier level
// on the first session. On re-entry there were no due cards (all future), no new
// cards (frontier fully entered, next level locked), so the queue was empty and
// the Daily mix button was disabled — "can't continue practising".
//
// Fix: buildDailyQueue now falls back to entered-but-not-mastered cards when the
// strict SM-2 queue is empty. This test exercises the full flow
// (buildDailyQueue -> schedule -> re-build) at the pure seam.

import { describe, it, expect } from "vitest";
import { buildDailyQueue } from "@/lib/daily-queue";
import { schedule, createCard, type MasteryThreshold } from "@/lib/sm2";
import { type CardMap, type CourseState } from "@/lib/course";

const THRESHOLD: MasteryThreshold = { ease: 2.5, intervalDays: 6 };

function freshState(): CourseState {
  return { cards: new Map(), threshold: THRESHOLD };
}

describe("REGRESSION: re-entry after practising once still offers cards", () => {
  it("same-day re-entry after answering the day-0 queue yields a non-empty queue", () => {
    const day0 = 1_700_000_000_000;

    // Session 1: play the fresh day-0 queue (5 new cards from the frontier).
    const state0 = freshState();
    const queue0 = buildDailyQueue(state0, day0, { newCardsPerDay: 5 });
    expect(queue0.length).toBe(5);

    const cardsAfter: CardMap = new Map();
    for (const item of queue0) {
      const card = state0.cards.get(item.cardKey) ?? createCard();
      cardsAfter.set(item.cardKey, schedule(card, { outcome: "correct", now: day0, reactionMs: 1000 }));
    }
    const state1: CourseState = { cards: cardsAfter, threshold: THRESHOLD };

    // Session 2: re-enter shortly after (same day). BEFORE the fix this returned [].
    const queue1 = buildDailyQueue(state1, day0 + 60_000, { newCardsPerDay: 5 });
    expect(queue1.length, "re-entry queue must be non-empty").toBeGreaterThan(0);
    // The backstop cards are tagged "extra".
    expect(queue1.every((q) => q.kind === "extra")).toBe(true);
  });

  it("the strict queue still takes priority when there are due or new cards", () => {
    // A brand-new learner: the strict new-card queue must win, not the backstop.
    const state = freshState();
    const queue = buildDailyQueue(state, 1_700_000_000_000, { newCardsPerDay: 5 });
    expect(queue.every((q) => q.kind === "new")).toBe(true);
    expect(queue.length).toBe(5);
  });
});
