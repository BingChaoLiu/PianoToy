// Tests for the reading practice session controller (T5).
//
// The controller is pure: it owns the session state machine over a T4 daily
// queue + a T1 card map. All timing is passed in (`now`, `reactionMs`) so tests
// are deterministic. These tests do NOT touch the DOM, persistence, or React —
// those are the store/component's job, verified by smoke.

import { describe, it, expect } from "vitest";
import {
  createSession,
  createLevelSession,
  judgeAnswer,
  currentCardKey,
  timeLimitMs,
  timerFrac,
  nameForPitch,
  letterForPitch,
  levelJustMastered,
  challengeActionFor,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_THRESHOLD,
  FIRST_CARD_TIME_LIMIT_MS,
  LETTER_NAMES,
  type PracticeSession,
} from "@/lib/practice-controller";
import type { CourseState, CardMap, CardKey } from "@/lib/course";
import { cardKeyToString, getLevelCardKeys, getBranch } from "@/lib/course";
import { type Card } from "@/lib/sm2";

// --- Fixtures ----------------------------------------------------------------

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

/** Fresh (un-practiced) SM-2 card. */
function freshCard(): Card {
  return { ease: 2.5, interval: 0, reps: 0, due: 0, rma: null, lastAnswered: null };
}

/** A card last answered `daysAgo` days ago, due `dueOffset` ms from NOW. */
function answeredCard(dueOffsetFromNowMs: number, opts: Partial<Card> = {}): Card {
  return {
    ease: 2.5,
    interval: 1,
    reps: 1,
    due: NOW + dueOffsetFromNowMs,
    rma: null,
    lastAnswered: NOW - DAY,
    ...opts,
  };
}

/** A card that clears the mastery threshold. */
function masteredCard(): Card {
  return answeredCard(0, { ease: 2.6, interval: 10, reps: 3 });
}

function key(k: CardKey): string {
  return cardKeyToString(k);
}

function freshState(cards: CardMap = new Map()): CourseState {
  return { cards, threshold: DEFAULT_THRESHOLD };
}

/** The frontier level id for an empty reading branch: treble line-notes. */
function frontierLevelId(): string {
  return getBranch("reading-recognition").levels[0].id;
}

// --- letterForPitch / nameForPitch ------------------------------------------

describe("letterForPitch / nameForPitch", () => {
  it("maps natural pitches to the right letter name", () => {
    // Treble line notes: E4 G4 B4 D5 F5
    expect(nameForPitch(64)).toBe("E"); // E4
    expect(nameForPitch(67)).toBe("G"); // G4
    expect(nameForPitch(71)).toBe("B"); // B4
    expect(nameForPitch(74)).toBe("D"); // D5
    expect(nameForPitch(77)).toBe("F"); // F5
    // Middle C
    expect(nameForPitch(60)).toBe("C");
    // Space note A4
    expect(nameForPitch(69)).toBe("A");
  });

  it("letterForPitch returns the diatonic index", () => {
    expect(letterForPitch(60)).toBe(0); // C
    expect(letterForPitch(62)).toBe(1); // D
    expect(letterForPitch(71)).toBe(6); // B
  });

  it("LETTER_NAMES is the canonical 7-letter set", () => {
    expect(LETTER_NAMES).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
  });
});

// --- createSession -----------------------------------------------------------

describe("createSession", () => {
  it("builds an active session from a fresh state's frontier new cards", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY });
    expect(session.status).toBe("active");
    // Frontier = treble line-notes (5 cards); capped at newCardsPerDay=5.
    expect(session.queue.length).toBe(5);
    expect(session.correctCount).toBe(0);
    expect(session.wrongCount).toBe(0);
    expect(session.slowCount).toBe(0);
    expect(session.streak).toBe(0);
    expect(session.bestStreak).toBe(0);
  });

  it("copies the card map so the session never mutates the input state", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 1 });
    // Mutating the session's card map must not affect the source state.
    session.cards.set("99:treble:C", freshCard());
    expect(state.cards.has("99:treble:C")).toBe(false);
  });

  it("completes immediately when the queue is empty (cap 0)", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 0 });
    expect(session.status).toBe("complete");
    expect(session.queue.length).toBe(0);
  });

  it("respects a smaller newCardsPerDay cap", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 2 });
    expect(session.queue.length).toBe(2);
  });
});

// --- currentCardKey ----------------------------------------------------------

describe("createLevelSession (level-scoped drill)", () => {
  const frontierLevelId = getBranch("reading-recognition").levels[0].id; // treble line-notes (5 cards)

  it("builds an active session from a fresh level's full card set (all new)", () => {
    const state = freshState();
    const session = createLevelSession(state, NOW, frontierLevelId);
    expect(session.status).toBe("active");
    // The frontier level (treble line-notes) has exactly 5 cards; all are new.
    expect(session.queue.length).toBe(5);
    expect(session.queue.every((q) => q.kind === "new")).toBe(true);
  });

  it("scopes the queue to ONLY that level's cards (no other levels bleed in)", () => {
    const state = freshState();
    const session = createLevelSession(state, NOW, frontierLevelId);
    const levelKeys = new Set(getLevelCardKeys(frontierLevelId).map((k) => cardKeyToString(k)));
    for (const item of session.queue) {
      expect(levelKeys.has(item.cardKey)).toBe(true);
    }
  });

  it("puts due cards first, then new cards, when the level is partially practiced", () => {
    // Enter one card as overdue; leave the rest new.
    const cards: CardMap = new Map();
    const levelKeys = getLevelCardKeys(frontierLevelId);
    cards.set(cardKeyToString(levelKeys[0]), { ...freshCard(), reps: 1, interval: 1, due: NOW - 1000 });
    const state: CourseState = { cards, threshold: DEFAULT_THRESHOLD };

    const session = createLevelSession(state, NOW, frontierLevelId);
    // First item is the due card; the rest are new.
    expect(session.queue[0].kind).toBe("due");
    expect(session.queue[0].cardKey).toBe(cardKeyToString(levelKeys[0]));
    expect(session.queue.slice(1).every((q) => q.kind === "new")).toBe(true);
    expect(session.queue.length).toBe(levelKeys.length); // the due one + the rest new
  });

  it("backstops with entered-but-not-mastered cards when the strict level queue is empty", () => {
    // Every card entered with a future due time, not yet mastered -> the strict
    // queue (due + new) is empty, but the learner can still drill the unmastered
    // cards rather than hitting a dead-end "complete" popup.
    const cards: CardMap = new Map();
    for (const k of getLevelCardKeys(frontierLevelId)) {
      cards.set(cardKeyToString(k), { ...freshCard(), reps: 1, interval: 1, due: NOW + DAY });
    }
    const state: CourseState = { cards, threshold: DEFAULT_THRESHOLD };
    const session = createLevelSession(state, NOW, frontierLevelId);
    expect(session.status).toBe("active");
    expect(session.queue.length).toBe(getLevelCardKeys(frontierLevelId).length);
    expect(session.queue.every((q) => q.kind === "extra")).toBe(true);
  });

  it("completes only when the level is fully mastered (nothing left to learn)", () => {
    const cards: CardMap = new Map();
    for (const k of getLevelCardKeys(frontierLevelId)) {
      cards.set(cardKeyToString(k), { ...freshCard(), ease: 2.6, interval: 10, reps: 3, due: NOW + DAY });
    }
    const state: CourseState = { cards, threshold: DEFAULT_THRESHOLD };
    const session = createLevelSession(state, NOW, frontierLevelId);
    expect(session.status).toBe("complete");
    expect(session.queue.length).toBe(0);
  });

  it("shares the judgeAnswer mechanic — answering correct pops the queue", () => {
    const state = freshState();
    let session = createLevelSession(state, NOW, frontierLevelId);
    const before = session.queue.length;
    session = judgeAnswer(session, "correct", NOW, 900);
    expect(session.queue.length).toBe(before - 1);
    expect(session.correctCount).toBe(1);
  });
});

describe("currentCardKey", () => {
  it("returns the front queue item's key while active", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 3 });
    expect(currentCardKey(session)).toBe(session.queue[0].cardKey);
  });

  it("returns null when the session is complete", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 0 });
    expect(currentCardKey(session)).toBeNull();
  });
});

// --- timeLimitMs (adaptive soft timer) --------------------------------------

describe("timeLimitMs", () => {
  it("uses the fixed first-card limit when the card has no RMA yet", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 1 });
    // Frontier cards are fresh (rma=null) -> default limit.
    expect(timeLimitMs(session)).toBe(FIRST_CARD_TIME_LIMIT_MS);
  });

  it("uses RMA * 1.5 once the card has an RMA", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 1 });
    // Inject a card with rma=2000 into the working map under the current key.
    const ck = currentCardKey(session)!;
    const seeded: PracticeSession = {
      ...session,
      cards: new Map(session.cards).set(ck, { ...freshCard(), rma: 2000 }),
    };
    expect(timeLimitMs(seeded)).toBe(3000); // 2000 * 1.5
  });
});

// --- timerFrac (reddening countdown) ----------------------------------------

describe("timerFrac", () => {
  it("is full at elapsed 0 and empties as time passes", () => {
    expect(timerFrac(0, 4000).frac).toBe(1);
    expect(timerFrac(2000, 4000).frac).toBe(0.5);
    expect(timerFrac(4000, 4000).frac).toBe(0);
  });

  it("clamps frac to [0,1]", () => {
    expect(timerFrac(6000, 4000).frac).toBe(0);
    expect(timerFrac(-100, 4000).frac).toBe(1);
  });

  it("red rises from 0 to 1 as the bar empties", () => {
    expect(timerFrac(0, 4000).red).toBeCloseTo(0, 5);
    expect(timerFrac(4000, 4000).red).toBeCloseTo(1, 5);
    expect(timerFrac(2000, 4000).red).toBeCloseTo(0.5, 5);
  });
});

// --- judgeAnswer: correct ----------------------------------------------------

describe("judgeAnswer — correct", () => {
  it("updates the SM-2 card, bumps streak, and pops the queue", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 3 });
    const ck = currentCardKey(session)!;
    const before = session.queue.length;

    const after = judgeAnswer(session, "correct", NOW, 1200);

    // Card now has scheduling state (reps advanced).
    expect(after.cards.get(ck)!.reps).toBe(1);
    expect(after.cards.get(ck)!.rma).toBe(1200);
    // Queue advanced by one.
    expect(after.queue.length).toBe(before - 1);
    // Stats.
    expect(after.correctCount).toBe(1);
    expect(after.streak).toBe(1);
    expect(after.bestStreak).toBe(1);
    expect(after.wrongCount).toBe(0);
  });

  it("does not mutate the input session", () => {
    const state = freshState();
    const session = createSession(state, NOW, { newCardsPerDay: 1 });
    const queueSnapshot = session.queue.length;
    judgeAnswer(session, "correct", NOW, 1000);
    expect(session.queue.length).toBe(queueSnapshot);
    expect(session.correctCount).toBe(0);
  });
});

// --- judgeAnswer: wrong ------------------------------------------------------

describe("judgeAnswer — wrong", () => {
  it("resets the SM-2 ladder, resets streak, and pops the queue (no retry)", () => {
    const state = freshState();
    // Give the learner a streak first.
    let session = createSession(state, NOW, { newCardsPerDay: 3 });
    session = judgeAnswer(session, "correct", NOW, 1000); // streak=1
    expect(session.streak).toBe(1);

    const ck = currentCardKey(session)!;
    const before = session.queue.length;
    session = judgeAnswer(session, "wrong", NOW + 500);

    // SM-2 reset: reps 0, interval back to first step, ease dented.
    const card = session.cards.get(ck)!;
    expect(card.reps).toBe(0);
    expect(card.interval).toBe(1);
    expect(card.ease).toBeLessThan(2.5);
    // Queue advanced despite the wrong answer (no same-card retry).
    expect(session.queue.length).toBe(before - 1);
    // Stats.
    expect(session.wrongCount).toBe(1);
    expect(session.streak).toBe(0);
  });

  it("does not touch RMA on a wrong answer", () => {
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 1 });
    const ck = currentCardKey(session)!;
    session = judgeAnswer(session, "wrong", NOW);
    expect(session.cards.get(ck)!.rma).toBeNull();
  });
});

// --- judgeAnswer: slow (timeout) --------------------------------------------

describe("judgeAnswer — slow", () => {
  it("records on SM-2 (ease dent + rma update) but KEEPS the card at the front", () => {
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 2 });
    const ck = currentCardKey(session)!;
    const before = session.queue.length;

    session = judgeAnswer(session, "slow", NOW, 5000);

    // SM-2 recorded: ease dented, rma updated. Interval/reps preserved (T1 slow).
    const card = session.cards.get(ck)!;
    expect(card.ease).toBeLessThan(2.5);
    expect(card.rma).toBe(5000);
    expect(card.interval).toBe(0); // preserved: fresh card stays at 0
    expect(card.reps).toBe(0); // preserved
    // Card NOT popped — same card repeats for fluency practice.
    expect(session.queue.length).toBe(before);
    expect(currentCardKey(session)).toBe(ck);
    // Slow tallied.
    expect(session.slowCount).toBe(1);
  });

  it("leaves streak unchanged (slow is not a memory failure)", () => {
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 3 });
    session = judgeAnswer(session, "correct", NOW, 900); // streak=1
    session = judgeAnswer(session, "slow", NOW, 5000); // repeat same card
    expect(session.streak).toBe(1);
  });

  it("with no reaction sample (timeout) leaves RMA unchanged — no inflation", () => {
    // The store calls judgeAnswer(slow) WITHOUT a reactionMs on a timeout, so
    // the full time-limit isn't recorded as a reaction and the next deadline
    // (RMA × 1.5) can't run away upward.
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 1 });
    const ck = currentCardKey(session)!;
    // Give the card an established RMA first.
    session = judgeAnswer(session, "slow", NOW, 2000);
    expect(session.cards.get(ck)!.rma).toBe(2000);
    // A timeout (no reactionMs) must not bloat the RMA.
    session = judgeAnswer(session, "slow", NOW);
    expect(session.cards.get(ck)!.rma).toBe(2000);
  });
});

// --- session completion ------------------------------------------------------

describe("session completion", () => {
  it("flips to complete when the last card is answered correctly", () => {
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 1 });
    expect(session.status).toBe("active");
    session = judgeAnswer(session, "correct", NOW, 800);
    expect(session.status).toBe("complete");
    expect(currentCardKey(session)).toBeNull();
  });

  it("does NOT complete on slow (card repeats)", () => {
    const state = freshState();
    let session = createSession(state, NOW, { newCardsPerDay: 1 });
    session = judgeAnswer(session, "slow", NOW, 5000);
    expect(session.status).toBe("active");
  });
});

// --- levelJustMastered (progression cue) ------------------------------------

describe("levelJustMastered", () => {
  it("is true when a level flips from unmastered to mastered after an answer", () => {
    const frontier = frontierLevelId();
    const cardKeys = getLevelCardKeys(frontier);

    // Before: all cards one correct short of mastery (interval below threshold).
    const prev: CardMap = new Map();
    for (const k of cardKeys) prev.set(key(k), { ...freshCard(), reps: 1, interval: 1, ease: 2.5 });

    // After: the first card (the one just answered) clears mastery; the rest
    // were already mastered in `prev`... wait — we need ALL cards mastered.
    // So seed prev with all-but-one mastered, then answer the last one.
    const prevAllButOne: CardMap = new Map();
    cardKeys.forEach((k, i) => {
      prevAllButOne.set(key(k), i === 0 ? { ...freshCard(), reps: 1, interval: 1, ease: 2.5 } : masteredCard());
    });
    const curr: CardMap = new Map(prevAllButOne);
    curr.set(key(cardKeys[0]), masteredCard());

    expect(levelJustMastered(prevAllButOne, curr, frontier, DEFAULT_THRESHOLD)).toBe(true);
  });

  it("is false when the level was already mastered before", () => {
    const frontier = frontierLevelId();
    const cardKeys = getLevelCardKeys(frontier);
    const mastered: CardMap = new Map();
    for (const k of cardKeys) mastered.set(key(k), masteredCard());
    // No change between prev and curr.
    expect(levelJustMastered(mastered, mastered, frontier, DEFAULT_THRESHOLD)).toBe(false);
  });

  it("is false when the level is still not fully mastered after", () => {
    const frontier = frontierLevelId();
    const cardKeys = getLevelCardKeys(frontier);
    const prev: CardMap = new Map();
    const curr: CardMap = new Map();
    cardKeys.forEach((k) => {
      prev.set(key(k), freshCard());
      curr.set(key(k), { ...freshCard(), reps: 1, interval: 1 }); // still short
    });
    expect(levelJustMastered(prev, curr, frontier, DEFAULT_THRESHOLD)).toBe(false);
  });
});

// --- challengeActionFor (challenge-mode routing) ----------------------------

describe("challengeActionFor", () => {
  it("routes a correct answer to a game 'hit'", () => {
    expect(challengeActionFor("correct")).toBe("hit");
  });

  it("routes a wrong answer to a game 'miss' (costs HP, breaks combo)", () => {
    expect(challengeActionFor("wrong")).toBe("miss");
  });

  it("routes a slow/timeout to a game 'miss' (costs HP per the spec)", () => {
    expect(challengeActionFor("slow")).toBe("miss");
  });

  it("is exhaustive over the three outcomes", () => {
    // Guard: every Outcome resolves to a defined action (no undefined routing).
    for (const o of ["correct", "wrong", "slow"] as const) {
      const a = challengeActionFor(o);
      expect(a === "hit" || a === "miss").toBe(true);
    }
  });
});
