import { describe, it, expect } from "vitest";
import {
  mulberry32,
  nextNoteForReading,
  keysForDifficulty,
  KEY_SIGNATURE,
  midiLetter,
  accidentalForNote,
  SCALE_PITCH_CLASS,
} from "@/lib/note-reading-generator";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("keysForDifficulty", () => {
  it("easy only allows C major", () => {
    expect(keysForDifficulty("easy")).toEqual(["C"]);
  });

  it("hard unlocks all keys", () => {
    const keys = keysForDifficulty("hard");
    expect(keys).toContain("C");
    expect(keys).toContain("G");
    expect(keys).toContain("Bb");
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it("medium is a superset of easy", () => {
    const easy = keysForDifficulty("easy");
    const medium = keysForDifficulty("medium");
    for (const k of easy) expect(medium).toContain(k);
  });
});

describe("nextNoteForReading", () => {
  it("only emits treble-range notes for easy difficulty", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const n = nextNoteForReading("C", "easy", r);
      // Easy = treble only, within 60..79.
      expect(n).toBeGreaterThanOrEqual(60);
      expect(n).toBeLessThanOrEqual(79);
    }
  });

  it("emits only in-scale pitches", () => {
    const r = mulberry32(3);
    const scale = SCALE_PITCH_CLASS["G"];
    for (let i = 0; i < 100; i++) {
      const n = nextNoteForReading("G", "hard", r);
      expect(scale).toContain(n % 12);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const outA = Array.from({ length: 10 }, () => nextNoteForReading("C", "medium", a));
    const outB = Array.from({ length: 10 }, () => nextNoteForReading("C", "medium", b));
    expect(outA).toEqual(outB);
  });
});

describe("key signature + accidentals", () => {
  it("C major has no accidentals", () => {
    expect(KEY_SIGNATURE["C"]).toHaveLength(0);
  });

  it("G major sharps F", () => {
    const ks = KEY_SIGNATURE["G"];
    expect(ks).toContainEqual({ letter: 3, kind: "sharp" });
  });

  it("F major flats B", () => {
    const ks = KEY_SIGNATURE["F"];
    expect(ks).toContainEqual({ letter: 6, kind: "flat" });
  });

  it("midiLetter maps pitch classes to diatonic letters", () => {
    expect(midiLetter(60)).toBe(0); // C
    expect(midiLetter(62)).toBe(1); // D
    expect(midiLetter(71)).toBe(6); // B
  });

  it("accidentalForNote returns none for in-scale notes", () => {
    expect(accidentalForNote(60, "C")).toBe("none"); // C
    expect(accidentalForNote(66, "G")).toBe("none"); // F# is in G scale
  });
});
