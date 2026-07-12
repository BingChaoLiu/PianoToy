import { describe, it, expect } from "vitest";
import {
  buildDailyQueue,
  isSessionComplete,
  type DailyQueueOptions,
  type QueueItem,
} from "@/lib/daily-queue";
import {
  getBranch,
  getLevelCardKeys,
  isLevelUnlocked,
  type CourseState,
  type CardMap,
  type CardKey,
  type BranchId,
} from "@/lib/course";
import { DEFAULT_SM2_CONFIG, type Card } from "@/lib/sm2";

// --- Fixtures ----------------------------------------------------------------

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const THRESHOLD = { ease: 2.5, intervalDays: 8 };

/** A card last answered `daysAgo` days ago, due `dueOffset` ms from NOW. */
function answeredCard(dueOffsetFromNowMs: number, opts: Partial<Card> = {}): Card {
  return {
    ease: DEFAULT_SM2_CONFIG.startingEase,
    interval: 1,
    reps: 1,
    due: NOW + dueOffsetFromNowMs,
    rma: null,
    lastAnswered: NOW - DAY,
    ...opts,
  };
}

/** A card that clears the mastery threshold (so its level unlocks the next). */
function masteredCard(dueOffsetFromNowMs: number): Card {
  return answeredCard(dueOffsetFromNowMs, { ease: 2.5, interval: 10, reps: 3 });
}

function freshState(cards: CardMap = new Map()): CourseState {
  return { cards, threshold: THRESHOLD };
}

/** CardKey -> deterministic string (mirrors course.cardKeyToString). */
function key(k: CardKey): string {
  return `${k.pitch}:${k.clef}:${k.key}`;
}

/** Seed a card entry for every card in the first `levelCount` levels of a branch. */
function seedLevels(branchId: BranchId, levelCount: number, card: Card, into: CardMap): void {
  const branch = getBranch(branchId);
  branch.levels.slice(0, levelCount).forEach((level) => {
    for (const k of getLevelCardKeys(level.id)) into.set(key(k), card);
  });
}

/** The frontier (lowest not-yet-started unlocked level) of the reading branch. */
function frontierLevelId(): string {
  // Reading branch with an empty card map: level 0 (treble line-notes) is the
  // lowest unlocked level and has no entries yet -> it's the frontier.
  return getBranch("reading-recognition").levels[0].id;
}

const DEFAULT_OPTS: DailyQueueOptions = { newCardsPerDay: 5 };

// --- buildDailyQueue ---------------------------------------------------------

describe("buildDailyQueue — empty card map", () => {
  it("returns only new cards (no due cards exist)", () => {
    const q = buildDailyQueue(freshState(), NOW, DEFAULT_OPTS);
    // All frontier-level cards are new; capped at newCardsPerDay.
    expect(q.filter((i) => i.kind === "due")).toHaveLength(0);
    const newItems = q.filter((i) => i.kind === "new");
    expect(newItems.length).toBeGreaterThan(0);
    expect(newItems.length).toBeLessThanOrEqual(DEFAULT_OPTS.newCardsPerDay);
  });

  it("caps new cards at newCardsPerDay", () => {
    const q = buildDailyQueue(freshState(), NOW, { newCardsPerDay: 3 });
    expect(q.filter((i) => i.kind === "new")).toHaveLength(3);
  });

  it("new cards come from the frontier (lowest unlocked, not-started) level only", () => {
    const q = buildDailyQueue(freshState(), NOW, DEFAULT_OPTS);
    const newIds = new Set(q.filter((i) => i.kind === "new").map((i) => i.cardKey));
    const frontierCards = getLevelCardKeys(frontierLevelId()).map(key);
    // Every new card in the queue belongs to the frontier level.
    for (const id of newIds) expect(frontierCards).toContain(id);
  });
});

describe("buildDailyQueue — all cards far from due", () => {
  it("returns only new cards (nothing is due yet)", () => {
    const cards: CardMap = new Map();
    // Master level 0 (so level 1 unlocks and is the frontier) but make its
    // cards due far in the future -> nothing due, only new cards from level 1.
    seedLevels("reading-recognition", 1, masteredCard(+30 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    expect(q.filter((i) => i.kind === "due")).toHaveLength(0);
    expect(q.filter((i) => i.kind === "new").length).toBeGreaterThan(0);
  });
});

describe("buildDailyQueue — mix of due + new", () => {
  it("places all due cards before new cards", () => {
    const cards: CardMap = new Map();
    // Level 0 mastered AND overdue (so it's due). Level 1 is the frontier.
    seedLevels("reading-recognition", 1, masteredCard(-1 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    const firstNewIdx = q.findIndex((i) => i.kind === "new");
    const lastDueIdx = q.map((i) => i.kind).lastIndexOf("due");
    expect(firstNewIdx).toBeGreaterThan(-1);
    expect(lastDueIdx).toBeLessThan(firstNewIdx);
  });

  it("orders due cards by due time ascending (most overdue first)", () => {
    const cards: CardMap = new Map();
    // Master level 0 with a mix of due times (overdue, since mastered cards
    // can still be due for review).
    const lvl0Keys = getLevelCardKeys(getBranch("reading-recognition").levels[0].id);
    const offsets = [-3 * DAY, -1 * DAY, -2 * DAY, 0, 0];
    lvl0Keys.forEach((k, i) => {
      cards.set(key(k), masteredCard(offsets[i % offsets.length]));
    });
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    const dueItems = q.filter((i) => i.kind === "due") as Extract<QueueItem, { kind: "due" }>[];
    expect(dueItems.length).toBeGreaterThan(0);
    for (let i = 1; i < dueItems.length; i++) {
      expect(dueItems[i].due).toBeGreaterThanOrEqual(dueItems[i - 1].due);
    }
  });

  it("respects the new-card cap when due cards are also present", () => {
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, masteredCard(-1 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, { newCardsPerDay: 2 });
    expect(q.filter((i) => i.kind === "new")).toHaveLength(2);
  });
});

describe("buildDailyQueue — frontier exhaustion", () => {
  it("adds no new cards when the frontier level has no un-entered cards left", () => {
    const cards: CardMap = new Map();
    // Seed ALL levels with entries -> no card is "new" anywhere.
    seedLevels("reading-recognition", 99, answeredCard(-1 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    expect(q.filter((i) => i.kind === "new")).toHaveLength(0);
    // Only due cards remain (everything was seeded overdue).
    expect(q.filter((i) => i.kind === "due").length).toBeGreaterThan(0);
  });
});

describe("buildDailyQueue — scope of due cards", () => {
  it("only includes due cards from unlocked levels (locked-level cards are excluded)", () => {
    const cards: CardMap = new Map();
    // Seed a locked level's cards as overdue — they must NOT appear.
    const lockedLevel = getBranch("reading-recognition").levels[5]; // position 6, locked when fresh
    const state = freshState();
    for (const k of getLevelCardKeys(lockedLevel.id)) {
      cards.set(key(k), answeredCard(-1 * DAY));
    }
    state.cards = cards;
    expect(isLevelUnlocked(state, lockedLevel.id)).toBe(false);
    const q = buildDailyQueue(state, NOW, DEFAULT_OPTS);
    const lockedKeySet = new Set(getLevelCardKeys(lockedLevel.id).map(key));
    for (const item of q) {
      expect(lockedKeySet.has(item.cardKey)).toBe(false);
    }
  });
});

describe("buildDailyQueue — determinism", () => {
  it("is deterministic for a given (state, now): same input -> same order", () => {
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, answeredCard(-1 * DAY), cards);
    const state = { cards, threshold: THRESHOLD };
    const q1 = buildDailyQueue(state, NOW, DEFAULT_OPTS).map((i) => `${i.kind}:${i.cardKey}`);
    const q2 = buildDailyQueue(state, NOW, DEFAULT_OPTS).map((i) => `${i.kind}:${i.cardKey}`);
    expect(q1).toEqual(q2);
  });
});

describe("buildDailyQueue — QueueItem shape", () => {
  it("each item carries its cardKey and, for due items, the due timestamp", () => {
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, answeredCard(-1 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    for (const item of q) {
      expect(typeof item.cardKey).toBe("string");
      expect(item.cardKey.length).toBeGreaterThan(0);
      if (item.kind === "due") {
        expect(typeof item.due).toBe("number");
      }
    }
  });
});

// --- isSessionComplete -------------------------------------------------------

describe("isSessionComplete", () => {
  it("an empty queue is complete", () => {
    expect(isSessionComplete([])).toBe(true);
  });

  it("a non-empty queue is not complete", () => {
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, answeredCard(-1 * DAY), cards);
    const q = buildDailyQueue({ cards, threshold: THRESHOLD }, NOW, DEFAULT_OPTS);
    expect(q.length).toBeGreaterThan(0);
    expect(isSessionComplete(q)).toBe(false);
  });
});

// --- extra-card backstop (re-entry fix) --------------------------------------
// When the strict SM-2 queue (due + new) is empty, the builder falls back to
// entered-but-not-mastered cards so a learner can always keep practising.

describe("backstop — extra cards when the strict queue is empty", () => {
  it("offers entered-but-not-mastered cards when no due/new cards exist", () => {
    // Seed level 0's cards as entered, due in the FUTURE, not mastered.
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, answeredCard(DAY), cards); // due tomorrow
    const state: CourseState = { cards, threshold: THRESHOLD };

    // No due (all future), no new (level 0 fully entered, level 1 locked).
    const q = buildDailyQueue(state, NOW, DEFAULT_OPTS);
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((item) => item.kind === "extra")).toBe(true);
  });

  it("does NOT include mastered cards in the backstop", () => {
    // Seed level 0's cards as fully mastered (and due tomorrow).
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 1, masteredCard(DAY), cards);
    const state: CourseState = { cards, threshold: THRESHOLD };

    const q = buildDailyQueue(state, NOW, DEFAULT_OPTS);
    // Level 0 mastered (and due future) -> level 1 unlocks and is unentered,
    // so its NEW cards surface (not "extra" — mastered cards aren't backstop-able).
    expect(q.every((item) => item.kind === "new")).toBe(true);
    expect(q.length).toBeGreaterThan(0);
  });

  it("dedupes shared cards across levels (combined reuses line+space)", () => {
    const cards: CardMap = new Map();
    seedLevels("reading-recognition", 3, answeredCard(DAY), cards);
    const state: CourseState = { cards, threshold: THRESHOLD };

    const q = buildDailyQueue(state, NOW, DEFAULT_OPTS);
    const ids = q.map((i) => i.cardKey);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });
});
