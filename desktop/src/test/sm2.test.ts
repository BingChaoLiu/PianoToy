import { describe, it, expect } from "vitest";
import {
  createCard,
  schedule,
  isMastered,
  DEFAULT_SM2_CONFIG,
  type Card,
  type Sm2Config,
} from "@/lib/sm2";

// SM-2 worked examples use these conventions (standard SuperMemo-2):
//   ease starts at 2.5, interval starts at 0, reps starts at 0
//   1st correct -> interval = 1d
//   2nd correct -> interval = 6d
//   nth correct (n>=3) -> interval = round(prevInterval * ease)
//   ease adjusts by quality: q=5 -> +0.1, q=4 -> +0.0 ... q=0 -> -0.5 (floored at 1.3)
// We fix `now` so due-dates are deterministic.

const NOW = 1_700_000_000_000; // arbitrary fixed timestamp (ms)
const DAY = 86_400_000;

// Helper: a card at the start of its life.
function freshCard(): Card {
  return createCard();
}

describe("createCard", () => {
  it("creates a card with SM-2 starting state", () => {
    const c = createCard();
    expect(c.ease).toBe(2.5);
    expect(c.interval).toBe(0);
    expect(c.reps).toBe(0);
    expect(c.due).toBe(0);
    expect(c.rma).toBeNull(); // no reaction times yet
    expect(c.lastAnswered).toBeNull();
  });

  it("honours a custom config's starting ease", () => {
    const cfg: Sm2Config = { ...DEFAULT_SM2_CONFIG, startingEase: 2.0 };
    expect(createCard(cfg).ease).toBe(2.0);
  });
});

describe("schedule — correct outcome", () => {
  it("first correct sets interval to 1 day and schedules due +1d", () => {
    const c = schedule(freshCard(), { outcome: "correct", now: NOW });
    expect(c.interval).toBe(1);
    expect(c.reps).toBe(1);
    expect(c.due).toBe(NOW + 1 * DAY);
    expect(c.lastAnswered).toBe(NOW);
  });

  it("second correct advances to the 6-day interval step", () => {
    let c = schedule(freshCard(), { outcome: "correct", now: NOW });
    c = schedule(c, { outcome: "correct", now: NOW + DAY });
    expect(c.interval).toBe(6);
    expect(c.reps).toBe(2);
    expect(c.due).toBe(NOW + DAY + 6 * DAY);
  });

  it("third+ correct multiplies the previous interval by ease", () => {
    // reps 1 (1d) -> reps 2 (6d) -> reps 3 (round(6 * ease))
    let c = schedule(freshCard(), { outcome: "correct", now: NOW });
    c = schedule(c, { outcome: "correct", now: NOW + DAY });
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY });
    // ease ~ 2.5 -> 6 * 2.5 = 15
    expect(c.interval).toBe(15);
    expect(c.reps).toBe(3);
  });

  it("a correct answer records the reaction time into RMA", () => {
    const c = schedule(freshCard(), {
      outcome: "correct",
      now: NOW,
      reactionMs: 1200,
    });
    expect(c.rma).toBe(1200);
  });
});

describe("schedule — wrong outcome", () => {
  it("resets reps and interval to the shortest step", () => {
    // build a mature card first (reps 3)
    let c = schedule(freshCard(), { outcome: "correct", now: NOW });
    c = schedule(c, { outcome: "correct", now: NOW + DAY });
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY });
    expect(c.reps).toBe(3);

    const after = schedule(c, { outcome: "wrong", now: NOW + 8 * DAY });
    expect(after.reps).toBe(0);
    expect(after.interval).toBe(1);
    expect(after.due).toBe(NOW + 8 * DAY + 1 * DAY);
  });

  it("decreases ease but never below the floor", () => {
    // ease drops 0.5 per wrong (q=0); force it to the floor.
    let c = freshCard(); // ease 2.5
    c = schedule(c, { outcome: "wrong", now: NOW }); // 2.0
    expect(c.ease).toBe(2.0);
    c = schedule(c, { outcome: "wrong", now: NOW }); // 1.5
    expect(c.ease).toBe(1.5);
    c = schedule(c, { outcome: "wrong", now: NOW }); // 1.3 (floored, not 1.0)
    expect(c.ease).toBe(1.3);
    c = schedule(c, { outcome: "wrong", now: NOW }); // stays 1.3
    expect(c.ease).toBe(1.3);
  });

  it("does not record reaction time into RMA on a wrong answer", () => {
    const c = schedule(freshCard(), { outcome: "wrong", now: NOW, reactionMs: 900 });
    expect(c.rma).toBeNull();
  });
});

describe("schedule — slow outcome", () => {
  it("does NOT reset the interval (unlike wrong)", () => {
    let c = schedule(freshCard(), { outcome: "correct", now: NOW }); // reps 1, 1d
    c = schedule(c, { outcome: "correct", now: NOW + DAY }); // reps 2, 6d
    const before = { reps: c.reps, interval: c.interval };

    const after = schedule(c, { outcome: "slow", now: NOW + 2 * DAY });
    // interval and reps are preserved (slow is not a reset)
    expect(after.reps).toBe(before.reps);
    expect(after.interval).toBe(before.interval);
  });

  it("decreases ease by less than a wrong answer", () => {
    const correctEase = schedule(freshCard(), { outcome: "correct", now: NOW }).ease;
    const wrongEase = schedule(freshCard(), { outcome: "wrong", now: NOW }).ease;
    const slowEase = schedule(freshCard(), { outcome: "slow", now: NOW }).ease;
    // slow should dent ease but less than wrong: correct >= slow >= wrong
    expect(slowEase).toBeLessThan(correctEase);
    expect(slowEase).toBeGreaterThan(wrongEase);
  });

  it("keeps the same card due for near-term review (never later than full interval)", () => {
    // A 1-day card: the shortest possible bump is also 1 day, so slow on a
    // 1-day card reschedules exactly at the full interval (not later).
    const oneDay = schedule(freshCard(), { outcome: "correct", now: NOW }); // due +1d
    const oneDaySlow = schedule(oneDay, { outcome: "slow", now: NOW + 5 * DAY });
    expect(oneDaySlow.due).toBeLessThanOrEqual(NOW + 5 * DAY + oneDaySlow.interval * DAY);

    // A mature card: the slow bump is strictly sooner than the full interval.
    let mature = schedule(freshCard(), { outcome: "correct", now: NOW }); // 1d
    mature = schedule(mature, { outcome: "correct", now: NOW + DAY }); // 6d
    mature = schedule(mature, { outcome: "correct", now: NOW + 7 * DAY }); // 15d
    const matureSlow = schedule(mature, { outcome: "slow", now: NOW + 20 * DAY });
    expect(matureSlow.due).toBeLessThan(NOW + 20 * DAY + matureSlow.interval * DAY);
  });
});

describe("schedule — ease floor constant", () => {
  it("a custom config ease floor is respected", () => {
    const cfg: Sm2Config = { ...DEFAULT_SM2_CONFIG, minEase: 1.5 };
    let c = createCard(cfg);
    c = schedule(c, { outcome: "wrong", now: NOW, config: cfg }); // 2.0
    expect(c.ease).toBe(2.0);
    c = schedule(c, { outcome: "wrong", now: NOW, config: cfg }); // 1.5
    expect(c.ease).toBe(1.5);
    c = schedule(c, { outcome: "wrong", now: NOW, config: cfg }); // floored at 1.5
    expect(c.ease).toBe(1.5);
  });
});

describe("schedule — wrong-then-correct recovery", () => {
  it("a wrong answer sends the card back to the 1-day step", () => {
    // mature the card
    let c = schedule(freshCard(), { outcome: "correct", now: NOW });
    c = schedule(c, { outcome: "correct", now: NOW + DAY });
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY });
    expect(c.interval).toBe(15);

    // wrong -> reset
    c = schedule(c, { outcome: "wrong", now: NOW + 8 * DAY });
    expect(c.interval).toBe(1);
    expect(c.reps).toBe(0);

    // correct after wrong -> back on the 1-day first step (reps=1)
    c = schedule(c, { outcome: "correct", now: NOW + 9 * DAY });
    expect(c.interval).toBe(1);
    expect(c.reps).toBe(1);
  });
});

describe("isMastered", () => {
  const threshold = { ease: 2.5, intervalDays: 10 };

  it("a fresh card is not mastered", () => {
    expect(isMastered(freshCard(), threshold)).toBe(false);
  });

  it("a card with enough ease AND interval is mastered", () => {
    let c = freshCard();
    c = schedule(c, { outcome: "correct", now: NOW }); // 1d
    c = schedule(c, { outcome: "correct", now: NOW + DAY }); // 6d
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY }); // 15d, ease ~2.5
    expect(c.interval).toBe(15);
    expect(c.ease).toBeGreaterThanOrEqual(2.5);
    expect(isMastered(c, threshold)).toBe(true);
  });

  it("a card meeting the interval but not the ease is not mastered", () => {
    // hammer ease down to the floor, then climb interval with a low-ease card
    let c = freshCard();
    c = schedule(c, { outcome: "wrong", now: NOW }); // ease 2.0
    c = schedule(c, { outcome: "wrong", now: NOW }); // ease 1.5
    c = schedule(c, { outcome: "wrong", now: NOW }); // ease 1.3
    // now correct-climb; ease stays low (~1.3-1.4). Interval can still grow.
    c = schedule(c, { outcome: "correct", now: NOW }); // 1d
    c = schedule(c, { outcome: "correct", now: NOW + DAY }); // 6d
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY }); // round(6*1.3)=8d
    c = schedule(c, { outcome: "correct", now: NOW + 15 * DAY }); // round(8*1.3)=10d
    expect(c.interval).toBeGreaterThanOrEqual(10); // interval met
    expect(c.ease).toBeLessThan(threshold.ease); // ease not met
    expect(isMastered(c, threshold)).toBe(false);
  });
});

describe("RMA — rolling mean reaction time", () => {
  it("updates as an exponential moving average across answers", () => {
    let c = schedule(freshCard(), { outcome: "correct", now: NOW, reactionMs: 1000 });
    expect(c.rma).toBe(1000);
    c = schedule(c, { outcome: "correct", now: NOW + DAY, reactionMs: 2000 });
    // EMA with alpha=0.4: 1000 + 0.4*(2000-1000) = 1400
    expect(c.rma).toBeCloseTo(1400, 5);
    c = schedule(c, { outcome: "correct", now: NOW + 7 * DAY, reactionMs: 500 });
    // 1400 + 0.4*(500-1400) = 1040
    expect(c.rma).toBeCloseTo(1040, 5);
  });
});
