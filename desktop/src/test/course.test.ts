import { describe, it, expect } from "vitest";
import {
  BRANCHES,
  getBranch,
  getLevelEntityKeys,
  isLevelMastered,
  isLevelUnlocked,
  levelStatus,
  nextPlayableLevels,
  masteredLevelCount,
  branchMasteredLevelCount,
  type CardMap,
  type CourseState,
  type BranchId,
} from "@/lib/course";
import { DEFAULT_SM2_CONFIG, type Card } from "@/lib/sm2";
import { cardKeyFromString } from "@/lib/course";

// --- Fixtures ----------------------------------------------------------------

/** A fresh un-practiced card (ease 2.5, interval 0 — not mastered). */
function fresh(): Card {
  return {
    ease: DEFAULT_SM2_CONFIG.startingEase,
    interval: 0,
    reps: 0,
    due: 0,
    rma: null,
    lastAnswered: null,
  };
}

/** A card that clears the default mastery threshold (ease >= 2.5, interval >= 8). */
function mastered(): Card {
  return { ...fresh(), ease: 2.5, interval: 10, reps: 3 };
}

/**
 * A card map whose card-set is the union of every entity key in the branch,
 * with the cards belonging to the first N levels (in flat catalog order)
 * mastered and the rest fresh.
 *
 * NOTE: levels may share entity keys by design (e.g. reading "combined" reuses
 * line+space pitches). So the card map is a union keyed by string; we master
 * the UNION of entity keys owned by the first N levels, never re-seeding a card
 * as fresh once a later level also references it.
 */
function stateMasteringFirstNLevels(branchId: BranchId, n: number): CourseState {
  const branch = getBranch(branchId);
  const masteredKeys = new Set<string>();
  branch.levels.slice(0, n).forEach((level) => {
    for (const key of getLevelEntityKeys(level.id)) masteredKeys.add(key);
  });
  const cards: CardMap = new Map();
  for (const level of branch.levels) {
    for (const key of getLevelEntityKeys(level.id)) {
      if (cards.has(key)) continue; // union — first write wins
      cards.set(key, masteredKeys.has(key) ? mastered() : fresh());
    }
  }
  return { cards, threshold: { ease: 2.5, intervalDays: 8 } };
}

// --- Catalog structure -------------------------------------------------------

describe("course catalog — branches", () => {
  it("defines four skill branches in a fixed order", () => {
    expect(BRANCHES.map((b) => b.id)).toEqual([
      "reading-recognition",
      "keyboard-location",
      "interval-recognition",
      "key-signature-recognition",
    ]);
  });

  it("reading, key-signature, and interval branches are active; keyboard-location is coming-soon", () => {
    expect(BRANCHES.map((b) => b.status)).toEqual([
      "active",
      "coming-soon",
      "active",
      "active",
    ]);
  });

  it("declares the cross-branch dependency: reading-recognition gates the three new branches", () => {
    expect(getBranch("keyboard-location").gatedBy).toContain("reading-recognition");
    expect(getBranch("interval-recognition").gatedBy).toContain("reading-recognition");
    expect(getBranch("key-signature-recognition").gatedBy).toContain("reading-recognition");
  });

  it("reading's cross-branch gate requires 6 levels mastered (treble track cleared)", () => {
    expect(getBranch("reading-recognition").gateMasteredLevels).toBe(6);
  });
});

describe("course catalog — reading-recognition branch", () => {
  const branch = getBranch("reading-recognition");

  it("has a treble track and a bass track, each following the classical progression", () => {
    const titles = branch.levels.map((l) => l.track);
    expect(titles).toContain("treble");
    expect(titles).toContain("bass");
  });

  it("treble levels follow line -> space -> combined -> ledger-below -> ledger-above -> accidentals", () => {
    const treble = branch.levels.filter((l) => l.track === "treble").map((l) => l.kind);
    expect(treble).toEqual([
      "line-notes",
      "space-notes",
      "combined",
      "ledger-below",
      "ledger-above",
      "accidentals",
    ]);
  });

  it("bass levels follow the same progression", () => {
    const bass = branch.levels.filter((l) => l.track === "bass").map((l) => l.kind);
    expect(bass).toEqual([
      "line-notes",
      "space-notes",
      "combined",
      "ledger-below",
      "ledger-above",
      "accidentals",
    ]);
  });

  it("every reading card is at key=C (reading branch starts diatonic in C major)", () => {
    for (const level of branch.levels) {
      for (const entityKey of getLevelEntityKeys(level.id)) {
        expect(cardKeyFromString(entityKey).key).toBe("C");
      }
    }
  });

  it("treble line-notes level covers exactly the five treble staff line pitches (E4 G4 B4 D5 F5)", () => {
    const lvl = branch.levels.find((l) => l.track === "treble" && l.kind === "line-notes")!;
    const pitches = getLevelEntityKeys(lvl.id).map((k) => cardKeyFromString(k).pitch).sort((a, b) => a - b);
    // MIDI: E4=64 G4=67 B4=71 D5=74 F5=77
    expect(pitches).toEqual([64, 67, 71, 74, 77]);
    expect(getLevelEntityKeys(lvl.id).every((k) => cardKeyFromString(k).clef === "treble")).toBe(true);
  });

  it("treble space-notes level covers the four treble staff space pitches (F4 A4 C5 E5)", () => {
    const lvl = branch.levels.find((l) => l.track === "treble" && l.kind === "space-notes")!;
    const pitches = getLevelEntityKeys(lvl.id).map((k) => cardKeyFromString(k).pitch).sort((a, b) => a - b);
    // MIDI: F4=65 A4=69 C5=72 E5=76
    expect(pitches).toEqual([65, 69, 72, 76]);
  });

  it("bass line-notes level covers the five bass staff line pitches (G2 B2 D3 F3 A3)", () => {
    const lvl = branch.levels.find((l) => l.track === "bass" && l.kind === "line-notes")!;
    const pitches = getLevelEntityKeys(lvl.id).map((k) => cardKeyFromString(k).pitch).sort((a, b) => a - b);
    // MIDI: G2=43 B2=47 D3=50 F3=53 A3=57
    expect(pitches).toEqual([43, 47, 50, 53, 57]);
    expect(getLevelEntityKeys(lvl.id).every((k) => cardKeyFromString(k).clef === "bass")).toBe(true);
  });

  it("each level has a stable id, a 1-based position within its track, and a title key", () => {
    for (const level of branch.levels) {
      expect(level.id).toMatch(/^[a-z0-9-]+$/);
      expect(typeof level.titleKey).toBe("string");
      expect(level.titleKey.length).toBeGreaterThan(0);
    }
    // positions are 1-based and contiguous across the whole branch
    // (treble track = 1-6, bass track = 7-12).
    expect(branch.levels.map((l) => l.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(branch.levels.filter((l) => l.track === "treble").map((l) => l.position))
      .toEqual([1, 2, 3, 4, 5, 6]);
    expect(branch.levels.filter((l) => l.track === "bass").map((l) => l.position))
      .toEqual([7, 8, 9, 10, 11, 12]);
  });
});

// --- Unlock state machine ----------------------------------------------------

describe("isLevelMastered", () => {
  it("a level is NOT mastered when its cards are fresh", () => {
    const branch = getBranch("reading-recognition");
    const first = branch.levels[0];
    const cards: CardMap = new Map();
    for (const key of getLevelEntityKeys(first.id)) {
      cards.set(key, fresh());
    }
    const state: CourseState = { cards, threshold: { ease: 2.5, intervalDays: 8 } };
    expect(isLevelMastered(state, first.id)).toBe(false);
  });

  it("a level IS mastered when every card clears the mastery threshold", () => {
    const state = stateMasteringFirstNLevels("reading-recognition", 1);
    const first = getBranch("reading-recognition").levels[0];
    expect(isLevelMastered(state, first.id)).toBe(true);
  });

  it("mastery requires ALL cards, not a subset", () => {
    const branch = getBranch("reading-recognition");
    const first = branch.levels[0];
    const keys = getLevelEntityKeys(first.id);
    const cards: CardMap = new Map();
    // Master every card except the last one.
    keys.forEach((k, i) => {
      cards.set(k, i < keys.length - 1 ? mastered() : fresh());
    });
    const state: CourseState = { cards, threshold: { ease: 2.5, intervalDays: 8 } };
    expect(isLevelMastered(state, first.id)).toBe(false);
  });

  it("a level with no card entries yet (learner hasn't started it) is not mastered", () => {
    const state: CourseState = { cards: new Map(), threshold: { ease: 2.5, intervalDays: 8 } };
    const first = getBranch("reading-recognition").levels[0];
    expect(isLevelMastered(state, first.id)).toBe(false);
  });
});

describe("isLevelUnlocked", () => {
  const branch = getBranch("reading-recognition");

  it("the first level of the reading branch is unlocked by default (no prior level)", () => {
    const state: CourseState = { cards: new Map(), threshold: { ease: 2.5, intervalDays: 8 } };
    expect(isLevelUnlocked(state, branch.levels[0].id)).toBe(true);
  });

  it("the second level is locked until the first is mastered", () => {
    const locked: CourseState = { cards: new Map(), threshold: { ease: 2.5, intervalDays: 8 } };
    expect(isLevelUnlocked(locked, branch.levels[1].id)).toBe(false);

    const unlocked = stateMasteringFirstNLevels("reading-recognition", 1);
    expect(isLevelUnlocked(unlocked, branch.levels[1].id)).toBe(true);
  });

  it("a level stays locked if an earlier level in the same track is only partially mastered", () => {
    // Master the first level except one card.
    const first = branch.levels[0];
    const keys = getLevelEntityKeys(first.id);
    const cards: CardMap = new Map();
    keys.forEach((k, i) => {
      cards.set(k, i < keys.length - 1 ? mastered() : fresh());
    });
    const state: CourseState = { cards, threshold: { ease: 2.5, intervalDays: 8 } };
    expect(isLevelUnlocked(state, branch.levels[1].id)).toBe(false);
  });

  it("keyboard-location levels stay locked (coming-soon branch)", () => {
    const state: CourseState = { cards: new Map(), threshold: { ease: 2.5, intervalDays: 8 } };
    const b = getBranch("keyboard-location");
    // coming-soon branch: any level (if any) is locked.
    for (const level of b.levels) {
      expect(isLevelUnlocked(state, level.id)).toBe(false);
    }
  });
});

describe("levelStatus (browser display status)", () => {
  const branch = getBranch("reading-recognition");
  const first = branch.levels[0];
  const second = branch.levels[1];
  const THRESHOLD = { ease: 2.5, intervalDays: 8 };

  it("a locked level (prior level not mastered) is 'locked'", () => {
    const state: CourseState = { cards: new Map(), threshold: THRESHOLD };
    expect(levelStatus(state, second.id)).toBe("locked");
  });

  it("an unlocked level with no entered cards is 'ready' (fresh start)", () => {
    const state: CourseState = { cards: new Map(), threshold: THRESHOLD };
    expect(levelStatus(state, first.id)).toBe("ready");
  });

  it("an unlocked level with some entered (but not mastered) cards is 'in-progress'", () => {
    const keys = getLevelEntityKeys(first.id);
    const cards: CardMap = new Map();
    // Enter just the first card as fresh (started but not mastered).
    cards.set(keys[0], fresh());
    const state: CourseState = { cards, threshold: THRESHOLD };
    expect(levelStatus(state, first.id)).toBe("in-progress");
  });

  it("a fully mastered level is 'mastered'", () => {
    const state = stateMasteringFirstNLevels("reading-recognition", 1);
    expect(levelStatus(state, first.id)).toBe("mastered");
  });

  it("mastering level 1 promotes level 2 from 'locked' to 'ready'", () => {
    // stateMasteringFirstNLevels seeds EVERY level's cards (mastered or fresh),
    // which would make level 2 look "started". For a clean 'ready' test we seed
    // ONLY level 1's cards as mastered and leave level 2 entirely un-entered.
    expect(levelStatus({ cards: new Map(), threshold: THRESHOLD }, second.id)).toBe("locked");

    const cards: CardMap = new Map();
    for (const k of getLevelEntityKeys(first.id)) cards.set(k, mastered());
    const after: CourseState = { cards, threshold: THRESHOLD };
    expect(levelStatus(after, second.id)).toBe("ready");
  });

  it("course-browser contract: a fresh tree renders level 1 'ready', everything else 'locked'", () => {
    // This is the smoke test for the browser: from an empty card map (a brand-
    // new learner), the derived statuses the browser renders are exactly
    // [ready, locked, locked, ...] across the whole reading branch.
    const state: CourseState = { cards: new Map(), threshold: THRESHOLD };
    const statuses = branch.levels.map((l) => levelStatus(state, l.id));
    expect(statuses[0]).toBe("ready");
    expect(statuses.slice(1).every((s) => s === "locked")).toBe(true);
  });

  it("course-browser contract: mastering level 1 renders it 'mastered' and level 2 'ready'", () => {
    const cards: CardMap = new Map();
    for (const k of getLevelEntityKeys(first.id)) cards.set(k, mastered());
    const state: CourseState = { cards, threshold: THRESHOLD };
    expect(levelStatus(state, first.id)).toBe("mastered");
    expect(levelStatus(state, second.id)).toBe("ready");
  });
});

describe("nextPlayableLevels", () => {
  it("returns only the first level of the first track when nothing is mastered", () => {
    const state: CourseState = { cards: new Map(), threshold: { ease: 2.5, intervalDays: 8 } };
    const playable = nextPlayableLevels(state);
    // The very first level (treble line-notes) is the only unlocked one.
    expect(playable.map((l) => l.id)).toEqual([
      getBranch("reading-recognition").levels[0].id,
    ]);
  });

  it("advances the frontier to the next level once the first is mastered", () => {
    // With level 0 mastered, the "next to play" frontier is exactly level 1
    // (the mastered level is excluded — see the "does not include mastered" test).
    const state = stateMasteringFirstNLevels("reading-recognition", 1);
    const playable = nextPlayableLevels(state).map((l) => l.id);
    expect(playable).toEqual([getBranch("reading-recognition").levels[1].id]);
  });

  it("does not include mastered levels (those are done, not 'next to play')", () => {
    const state = stateMasteringFirstNLevels("reading-recognition", 1);
    const playable = nextPlayableLevels(state);
    // The mastered level itself should be excluded — only unlocked-and-not-mastered remain.
    const firstId = getBranch("reading-recognition").levels[0].id;
    expect(playable.find((l) => l.id === firstId)).toBeUndefined();
  });
});

describe("masteredLevelCount", () => {
  it("counts how many reading levels are mastered", () => {
    expect(masteredLevelCount(stateMasteringFirstNLevels("reading-recognition", 0))).toBe(0);
    expect(masteredLevelCount(stateMasteringFirstNLevels("reading-recognition", 1))).toBe(1);
    expect(masteredLevelCount(stateMasteringFirstNLevels("reading-recognition", 3))).toBe(3);
  });
});

describe("cross-branch gating — partial-progress gate (T8)", () => {
  it("keyboard-location stays locked even when reading is fully mastered (coming-soon branch)", () => {
    const fully = stateMasteringFirstNLevels("reading-recognition", 99);
    const keyboard = getBranch("keyboard-location");
    for (const level of keyboard.levels) {
      expect(isLevelUnlocked(fully, level.id)).toBe(false);
    }
  });

  it("key-sig levels are locked when fewer than 6 reading levels are mastered", () => {
    // With only 5 reading levels mastered (treble not fully cleared), the gate
    // (gateMasteredLevels=6) is not satisfied -> all key-sig levels locked.
    const fiveMastered = stateMasteringFirstNLevels("reading-recognition", 5);
    expect(branchMasteredLevelCount(fiveMastered, "reading-recognition")).toBe(5);
    const keysig = getBranch("key-signature-recognition");
    for (const level of keysig.levels) {
      expect(isLevelUnlocked(fiveMastered, level.id)).toBe(false);
    }
  });

  it("key-sig level 1 unlocks when exactly 6 reading levels are mastered (treble cleared)", () => {
    const sixMastered = stateMasteringFirstNLevels("reading-recognition", 6);
    expect(branchMasteredLevelCount(sixMastered, "reading-recognition")).toBe(6);
    const keysig = getBranch("key-signature-recognition");
    // Level 1 (0-accidentals) is position 1, no within-branch gate.
    expect(isLevelUnlocked(sixMastered, keysig.levels[0].id)).toBe(true);
    // Level 2+ are still locked (within-branch gate: previous level not mastered).
    for (let i = 1; i < keysig.levels.length; i++) {
      expect(isLevelUnlocked(sixMastered, keysig.levels[i].id)).toBe(false);
    }
  });

  it("interval levels are locked when fewer than 6 reading levels are mastered", () => {
    const fiveMastered = stateMasteringFirstNLevels("reading-recognition", 5);
    const interval = getBranch("interval-recognition");
    for (const level of interval.levels) {
      expect(isLevelUnlocked(fiveMastered, level.id)).toBe(false);
    }
  });

  it("interval level 1 unlocks when exactly 6 reading levels are mastered", () => {
    const sixMastered = stateMasteringFirstNLevels("reading-recognition", 6);
    const interval = getBranch("interval-recognition");
    expect(isLevelUnlocked(sixMastered, interval.levels[0].id)).toBe(true);
    for (let i = 1; i < interval.levels.length; i++) {
      expect(isLevelUnlocked(sixMastered, interval.levels[i].id)).toBe(false);
    }
  });
});

describe("key-signature-recognition branch catalog (T8)", () => {
  const branch = getBranch("key-signature-recognition");

  it("is an active branch", () => {
    expect(branch.status).toBe("active");
  });

  it("has exactly 4 levels progressing by accidental count", () => {
    expect(branch.levels.map((l) => l.kind)).toEqual([
      "0-accidentals",
      "1-accidental",
      "2-accidentals",
      "3-accidentals",
    ]);
    expect(branch.levels.map((l) => l.position)).toEqual([1, 2, 3, 4]);
  });

  it("level 1 has only C (0 accidentals)", () => {
    expect(branch.levels[0].entityKeys).toEqual(["keysig:C"]);
  });

  it("level 2 has G and F (1 accidental each)", () => {
    expect(branch.levels[1].entityKeys).toEqual(["keysig:G", "keysig:F"]);
  });

  it("level 3 has D and Bb (2 accidentals each)", () => {
    expect(branch.levels[2].entityKeys).toEqual(["keysig:D", "keysig:Bb"]);
  });

  it("level 4 has A, E, and Eb (3 accidentals each)", () => {
    expect(branch.levels[3].entityKeys).toEqual(["keysig:A", "keysig:E", "keysig:Eb"]);
  });

  it("all 8 keys are represented across the 4 levels", () => {
    const all = new Set(branch.levels.flatMap((l) => l.entityKeys));
    expect(all.size).toBe(8);
  });
});

describe("interval-recognition branch catalog (T9)", () => {
  const branch = getBranch("interval-recognition");

  it("is an active branch", () => {
    expect(branch.status).toBe("active");
  });

  it("has exactly 4 levels progressing by size range", () => {
    expect(branch.levels.map((l) => l.kind)).toEqual([
      "seconds-thirds",
      "fourths-fifths",
      "sixths-sevenths",
      "all-intervals",
    ]);
    expect(branch.levels.map((l) => l.position)).toEqual([1, 2, 3, 4]);
  });

  it("level 1 has 2nd and 3rd", () => {
    expect(branch.levels[0].entityKeys).toEqual(["interval:2", "interval:3"]);
  });

  it("level 2 has 4th and 5th", () => {
    expect(branch.levels[1].entityKeys).toEqual(["interval:4", "interval:5"]);
  });

  it("level 3 has 6th and 7th", () => {
    expect(branch.levels[2].entityKeys).toEqual(["interval:6", "interval:7"]);
  });

  it("level 4 has all 7 sizes (2nd through 8ve)", () => {
    expect(branch.levels[3].entityKeys).toEqual([
      "interval:2", "interval:3", "interval:4", "interval:5",
      "interval:6", "interval:7", "interval:8",
    ]);
  });

  it("all 7 interval sizes are represented across the levels", () => {
    const all = new Set(branch.levels.flatMap((l) => l.entityKeys));
    expect(all.size).toBe(7);
  });
});
