// Tests for the keyboard-location target generator (T10).
//
// The generator is pure: it takes a seeded PRNG for deterministic tests.
// Each test asserts a property of the generated target, not a specific
// output value (except for determinism).

import { describe, it, expect } from "vitest";
import {
  generateKeyLocTarget,
  keyLocEntityKeyToString,
  keyLocEntityKeyFromString,
  KEYLOC_WHITE_LETTERS,
  KEYLOC_BLACK_NAMES,
} from "@/lib/keyboard-location-generator";
import { mulberry32 } from "@/lib/note-reading-generator";
import { isBlack, FIRST_MIDI, LAST_MIDI, noteName } from "@/lib/note-utils";

// --- Entity key encoder/decoder ---------------------------------------------

describe("keyLocEntityKey encoder/decoder", () => {
  it("encodes a level-kind + card-id to 'keyloc:<kind>:<id>'", () => {
    expect(keyLocEntityKeyToString("white-landmarks", "C")).toBe("keyloc:white-landmarks:C");
    expect(keyLocEntityKeyToString("black-landmarks", "Cs")).toBe("keyloc:black-landmarks:Cs");
    expect(keyLocEntityKeyToString("cross-octave", "D")).toBe("keyloc:cross-octave:D");
  });

  it("decodes a valid entity key back to { kind, cardId }", () => {
    expect(keyLocEntityKeyFromString("keyloc:white-landmarks:C")).toEqual({
      kind: "white-landmarks",
      cardId: "C",
    });
    expect(keyLocEntityKeyFromString("keyloc:full-range:G")).toEqual({
      kind: "full-range",
      cardId: "G",
    });
  });

  it("returns null for non-keyloc keys", () => {
    expect(keyLocEntityKeyFromString("keysig:G")).toBeNull();
    expect(keyLocEntityKeyFromString("interval:3")).toBeNull();
    expect(keyLocEntityKeyFromString("60:treble:C")).toBeNull();
  });
});

// --- Catalog constants -------------------------------------------------------

describe("catalog constants", () => {
  it("KEYLOC_WHITE_LETTERS has the 7 white-key letters", () => {
    expect(KEYLOC_WHITE_LETTERS).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
  });

  it("KEYLOC_BLACK_NAMES has the 5 black-key names", () => {
    expect(KEYLOC_BLACK_NAMES).toEqual(["Cs", "Ds", "Fs", "Gs", "As"]);
  });
});

// --- Target generation -------------------------------------------------------

describe("generateKeyLocTarget", () => {
  it("white-landmarks: target is a natural (white) key within octaves 3-5", () => {
    for (const letter of KEYLOC_WHITE_LETTERS) {
      for (let seed = 0; seed < 20; seed++) {
        const ek = keyLocEntityKeyToString("white-landmarks", letter);
        const target = generateKeyLocTarget(ek, mulberry32(seed));
        expect(target.matchMode).toBe("pitch-class");
        expect(isBlack(target.midi)).toBe(false);
        // Octave 3 = MIDI 48-59, octave 4 = 60-71, octave 5 = 72-83
        expect(target.midi).toBeGreaterThanOrEqual(48);
        expect(target.midi).toBeLessThanOrEqual(83);
      }
    }
  });

  it("white-landmarks: the target pitch class matches the letter", () => {
    const ek = keyLocEntityKeyToString("white-landmarks", "C");
    for (let seed = 0; seed < 20; seed++) {
      const target = generateKeyLocTarget(ek, mulberry32(seed));
      expect(target.midi % 12).toBe(0); // C = pitch class 0
    }
    const ekE = keyLocEntityKeyToString("white-landmarks", "E");
    for (let seed = 0; seed < 20; seed++) {
      const target = generateKeyLocTarget(ekE, mulberry32(seed));
      expect(target.midi % 12).toBe(4); // E = pitch class 4
    }
  });

  it("black-landmarks: target is a black key within octaves 3-5", () => {
    for (const name of KEYLOC_BLACK_NAMES) {
      const ek = keyLocEntityKeyToString("black-landmarks", name);
      for (let seed = 0; seed < 20; seed++) {
        const target = generateKeyLocTarget(ek, mulberry32(seed));
        expect(target.matchMode).toBe("pitch-class");
        expect(isBlack(target.midi)).toBe(true);
        expect(target.midi).toBeGreaterThanOrEqual(48);
        expect(target.midi).toBeLessThanOrEqual(83);
      }
    }
  });

  it("cross-octave: target is exact-match and within octaves 3-5", () => {
    for (const letter of KEYLOC_WHITE_LETTERS) {
      const ek = keyLocEntityKeyToString("cross-octave", letter);
      const target = generateKeyLocTarget(ek, mulberry32(42));
      expect(target.matchMode).toBe("exact");
      expect(target.midi).toBeGreaterThanOrEqual(48);
      expect(target.midi).toBeLessThanOrEqual(83);
    }
  });

  it("short-jumps: target is exact-match within a wider range (octaves 2-6)", () => {
    for (const letter of KEYLOC_WHITE_LETTERS) {
      const ek = keyLocEntityKeyToString("short-jumps", letter);
      for (let seed = 0; seed < 20; seed++) {
        const target = generateKeyLocTarget(ek, mulberry32(seed));
        expect(target.matchMode).toBe("exact");
        // Octave 2 = MIDI 36-47, octave 6 = MIDI 84-95
        expect(target.midi).toBeGreaterThanOrEqual(36);
        expect(target.midi).toBeLessThanOrEqual(95);
      }
    }
  });

  it("full-range: target is exact-match within the full keyboard", () => {
    for (const letter of KEYLOC_WHITE_LETTERS) {
      const ek = keyLocEntityKeyToString("full-range", letter);
      for (let seed = 0; seed < 20; seed++) {
        const target = generateKeyLocTarget(ek, mulberry32(seed));
        expect(target.matchMode).toBe("exact");
        expect(target.midi).toBeGreaterThanOrEqual(FIRST_MIDI);
        expect(target.midi).toBeLessThanOrEqual(LAST_MIDI);
      }
    }
  });

  it("produces a displayName that matches the target MIDI", () => {
    const ek = keyLocEntityKeyToString("cross-octave", "C");
    const target = generateKeyLocTarget(ek, mulberry32(1));
    expect(target.displayName).toBe(noteName(target.midi));
  });

  it("is deterministic for the same seed", () => {
    const ek = keyLocEntityKeyToString("white-landmarks", "G");
    const a = generateKeyLocTarget(ek, mulberry32(77));
    const b = generateKeyLocTarget(ek, mulberry32(77));
    expect(a).toEqual(b);
  });

  it("produces different targets for different seeds (probabilistic)", () => {
    const ek = keyLocEntityKeyToString("cross-octave", "D");
    const targets = new Set<number>();
    for (let s = 0; s < 30; s++) {
      targets.add(generateKeyLocTarget(ek, mulberry32(s)).midi);
    }
    expect(targets.size).toBeGreaterThan(1);
  });
});
