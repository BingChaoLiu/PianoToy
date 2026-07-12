// Regression repro #2: "完成今日练习后,选择某个课程选项会弹窗「今日练习已完成」"
//
// The user finishes today's practice, then taps a LEVEL row in the course
// browser. startLevelSession -> createLevelSession -> buildLevelQueue. If that
// level's cards are all entered-but-not-due (because today's session already
// scheduled them into the future), buildLevelQueue returns [] and the stage
// shows phase "complete" -> the "今日练习已完成" popup.
//
// This is the level-scoped twin of the daily-mix deadlock fixed in
// reentry-repro.test.ts. The daily queue got a backstop; the level queue did
// not. This test drives createLevelSession directly and asserts the symptom.

import { describe, it, expect } from "vitest";
import { createLevelSession } from "@/lib/practice-controller";
import { schedule, createCard, type MasteryThreshold } from "@/lib/sm2";
import { cardKeyToString, getBranch, getLevelCardKeys, type CardMap, type CourseState } from "@/lib/course";

const THRESHOLD: MasteryThreshold = { ease: 2.5, intervalDays: 6 };

function freshState(): CourseState {
  return { cards: new Map(), threshold: THRESHOLD };
}

describe("REGRESSION: tapping a level after practising it today should not dead-end", () => {
  const frontierLevel = getBranch("reading-recognition").levels[0]; // treble line-notes

  it("re-selecting a level whose cards are all entered-but-future-due yields an active session", () => {
    const day0 = 1_700_000_000_000;

    // Session 1: play the level (enter every card, schedule them to tomorrow).
    const state0 = freshState();
    const session0 = createLevelSession(state0, day0, frontierLevel.id);
    expect(session0.status).toBe("active");

    const cardsAfter: CardMap = new Map();
    for (const k of getLevelCardKeys(frontierLevel.id)) {
      const id = cardKeyToString(k);
      const card = state0.cards.get(id) ?? createCard();
      cardsAfter.set(id, schedule(card, { outcome: "correct", now: day0, reactionMs: 1000 }));
    }
    const state1: CourseState = { cards: cardsAfter, threshold: THRESHOLD };

    // Session 2: tap the same level again, same day. BEFORE the fix this was
    // status "complete" (empty queue) -> the "今日练习已完成" popup.
    const session1 = createLevelSession(state1, day0 + 60_000, frontierLevel.id);
    expect(session1.status, "level re-select must stay active, not complete").toBe("active");
    expect(session1.queue.length).toBeGreaterThan(0);
  });

  it("a level whose cards are all mastered (and not due) stays 'complete' — backstop must not override mastery", () => {
    const now = 1_700_000_000_000;
    const DAY = 86_400_000;
    // Master every card in the level, all due in the FUTURE (not due today).
    const cards: CardMap = new Map();
    for (const k of getLevelCardKeys(frontierLevel.id)) {
      cards.set(cardKeyToString(k), { ...createCard(), ease: 2.6, interval: 10, reps: 3, due: now + DAY });
    }
    const state: CourseState = { cards, threshold: THRESHOLD };

    const session = createLevelSession(state, now, frontierLevel.id);
    // No due (future), no new (all entered), and backstop skips mastered ->
    // genuinely nothing to learn -> complete is correct.
    expect(session.status).toBe("complete");
  });
});
