import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock both backends so facade tests don't touch real IndexedDB / Tauri.
// The facade's backend() picks based on isNative(); we force the web-fallback
// branch (non-native under happy-dom) and capture the bytes it would write.
const writtenBytes: Uint8Array[] = [];
vi.mock("@/lib/progress-storage/web-fallback", () => ({
  readProgressBytes: async () => null,
  saveProgressBytes: async (bytes: Uint8Array) => {
    writtenBytes.push(bytes);
    // Mirror real IndexedDB's async timing minimally.
  },
}));

import {
  PROGRESS_SCHEMA_VERSION,
  serializeProgress,
  deserializeProgress,
  emptyProgress,
  type ProgressFile,
} from "@/lib/progress-storage/serialize";
import {
  saveProgressDebounced,
  flushPendingSave,
  __resetForTest,
  __writeCountForTest,
} from "@/lib/progress-storage";
import { DEFAULT_SM2_CONFIG, type Card } from "@/lib/sm2";
import type { MasteryThreshold } from "@/lib/sm2";
import { cardKeyToString, type CardKey } from "@/lib/course";

// --- Fixtures ----------------------------------------------------------------

const THRESHOLD: MasteryThreshold = { ease: 2.5, intervalDays: 8 };

function masteredCard(): Card {
  return {
    ease: 2.6,
    interval: 12,
    reps: 4,
    due: 1_700_000_000_000,
    rma: 1500,
    lastAnswered: 1_699_990_000_000,
  };
}

function freshCard(): Card {
  return {
    ease: DEFAULT_SM2_CONFIG.startingEase,
    interval: 0,
    reps: 0,
    due: 0,
    rma: null,
    lastAnswered: null,
  };
}

const k: CardKey = { pitch: 64, clef: "treble", key: "C" };

// --- Schema + version --------------------------------------------------------

describe("PROGRESS_SCHEMA_VERSION", () => {
  it("is a positive integer", () => {
    expect(typeof PROGRESS_SCHEMA_VERSION).toBe("number");
    expect(PROGRESS_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe("emptyProgress", () => {
  it("returns a versioned file with an empty card map and the given threshold", () => {
    const p = emptyProgress(THRESHOLD);
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(p.cards).toEqual({});
    expect(p.threshold).toEqual(THRESHOLD);
  });
});

// --- Serialize / deserialize round-trip --------------------------------------

describe("serializeProgress / deserializeProgress", () => {
  it("round-trips a populated progress file preserving every card field", () => {
    const original: ProgressFile = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      threshold: THRESHOLD,
      cards: {
        [cardKeyToString(k)]: masteredCard(),
        [cardKeyToString({ pitch: 65, clef: "treble", key: "C" })]: freshCard(),
      },
    };
    const json = serializeProgress(original);
    const restored = deserializeProgress(json, THRESHOLD);
    expect(restored.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(restored.threshold).toEqual(THRESHOLD);
    expect(restored.cards[cardKeyToString(k)]).toEqual(masteredCard());
    // Every field survives, including null rma / lastAnswered.
    const fresh = restored.cards[cardKeyToString({ pitch: 65, clef: "treble", key: "C" })];
    expect(fresh.rma).toBeNull();
    expect(fresh.lastAnswered).toBeNull();
    expect(fresh.interval).toBe(0);
  });

  it("round-trips an empty card map", () => {
    const p = emptyProgress(THRESHOLD);
    const restored = deserializeProgress(serializeProgress(p), THRESHOLD);
    expect(restored.cards).toEqual({});
  });
});

// --- Corrupt / missing file graceful degradation -----------------------------

describe("deserializeProgress — defensive parsing", () => {
  it("returns fresh progress for unparseable JSON", () => {
    const restored = deserializeProgress("not json {{{", THRESHOLD);
    expect(restored.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(restored.cards).toEqual({});
    expect(restored.threshold).toEqual(THRESHOLD);
  });

  it("returns fresh progress for valid JSON of the wrong shape", () => {
    // An object missing schemaVersion / cards.
    expect(deserializeProgress(JSON.stringify({ foo: 1 }), THRESHOLD).cards).toEqual({});
    // cards present but not an object.
    expect(deserializeProgress(JSON.stringify({ schemaVersion: 1, cards: [] }), THRESHOLD).cards).toEqual({});
    // A primitive.
    expect(deserializeProgress(JSON.stringify(42), THRESHOLD).cards).toEqual({});
    // null.
    expect(deserializeProgress(JSON.stringify(null), THRESHOLD).cards).toEqual({});
  });

  it("drops individual malformed card entries but keeps valid ones", () => {
    // One good card, one garbage card (missing fields). The good one survives.
    const mixed = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      threshold: THRESHOLD,
      cards: {
        [cardKeyToString(k)]: masteredCard(),
        "99:bass:G": { ease: "not a number", interval: 5 }, // malformed
      },
    };
    const restored = deserializeProgress(JSON.stringify(mixed), THRESHOLD);
    expect(restored.cards[cardKeyToString(k)]).toEqual(masteredCard());
    expect(restored.cards["99:bass:G"]).toBeUndefined();
  });

  it("coerces a card with a missing optional field (rma/lastAnswered) to null", () => {
    const partial = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      threshold: THRESHOLD,
      cards: {
        [cardKeyToString(k)]: { ease: 2.5, interval: 1, reps: 1, due: 100 },
      },
    };
    const restored = deserializeProgress(JSON.stringify(partial), THRESHOLD);
    const card = restored.cards[cardKeyToString(k)];
    expect(card).toBeDefined();
    expect(card.rma).toBeNull();
    expect(card.lastAnswered).toBeNull();
  });
});

// --- Facade debounced save (mocked backend) ---------------------------------
// The real backends (native Tauri / IndexedDB web-fallback) are exercised at
// runtime — vitest has no IndexedDB/Tauri. Here we mock the backend to verify
// the novel facade logic: debounced coalescing (rapid saves -> one write) and
// flush-on-demand. The serialize round-trip is covered by the pure-layer tests
// above.

describe("facade — debounced save coalescing", () => {
  beforeEach(() => {
    __resetForTest();
    writtenBytes.length = 0;
  });

  it("a single debounced save produces one backend write after flush", async () => {
    const p: ProgressFile = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      threshold: THRESHOLD,
      cards: { [cardKeyToString(k)]: masteredCard() },
    };
    saveProgressDebounced(p);
    expect(__writeCountForTest()).toBe(0); // not yet — debounce window open
    await flushPendingSave();
    expect(__writeCountForTest()).toBe(1);
    expect(writtenBytes).toHaveLength(1);
  });

  it("rapid successive saves coalesce into ONE write, latest snapshot wins", async () => {
    const mk = (reps: number): ProgressFile => ({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      threshold: THRESHOLD,
      cards: { [cardKeyToString(k)]: { ...freshCard(), reps } },
    });
    saveProgressDebounced(mk(1));
    saveProgressDebounced(mk(2));
    saveProgressDebounced(mk(3));
    await flushPendingSave();
    expect(__writeCountForTest()).toBe(1); // coalesced, not three
    expect(writtenBytes).toHaveLength(1);
    // The persisted snapshot is the latest one (reps: 3).
    const restored = deserializeProgress(new TextDecoder().decode(writtenBytes[0]), THRESHOLD);
    expect(restored.cards[cardKeyToString(k)].reps).toBe(3);
  });

  it("a save after the debounce window has closed starts a new coalescing cycle", async () => {
    saveProgressDebounced(emptyProgress(THRESHOLD));
    await flushPendingSave();
    expect(__writeCountForTest()).toBe(1);
    saveProgressDebounced(emptyProgress(THRESHOLD));
    await flushPendingSave();
    expect(__writeCountForTest()).toBe(2);
  });
});
