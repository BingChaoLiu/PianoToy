// Tests for the interval prompt generator (T9).
//
// The generator is pure: it takes a seeded PRNG so tests are deterministic.
// Each test asserts a property of the generated interval instance, not a
// specific output value (except for determinism, which pins the output for a
// given seed).

import { describe, it, expect } from "vitest";
import {
  generateIntervalInstance,
  intervalSizeToString,
  intervalEntityKeyToString,
  intervalEntityKeyFromString,
  INTERVAL_SIZES,
} from "@/lib/interval-generator";
import { mulberry32 } from "@/lib/note-reading-generator";
import { midiLetter } from "@/lib/note-reading-generator";

// --- Ordinal formatting -----------------------------------------------------

describe("intervalSizeToString", () => {
  it("formats each size as an ordinal abbreviation", () => {
    expect(intervalSizeToString(2)).toBe("2nd");
    expect(intervalSizeToString(3)).toBe("3rd");
    expect(intervalSizeToString(4)).toBe("4th");
    expect(intervalSizeToString(5)).toBe("5th");
    expect(intervalSizeToString(6)).toBe("6th");
    expect(intervalSizeToString(7)).toBe("7th");
    expect(intervalSizeToString(8)).toBe("8ve");
  });
});

// --- Entity key encoder/decoder ---------------------------------------------

describe("intervalEntityKey encoder/decoder", () => {
  it("encodes a size to 'interval:<n>'", () => {
    expect(intervalEntityKeyToString(3)).toBe("interval:3");
    expect(intervalEntityKeyToString(8)).toBe("interval:8");
  });

  it("decodes a valid entity key back to the size", () => {
    expect(intervalEntityKeyFromString("interval:3")).toBe(3);
    expect(intervalEntityKeyFromString("interval:8")).toBe(8);
  });

  it("returns null for non-interval keys", () => {
    expect(intervalEntityKeyFromString("keysig:G")).toBeNull();
    expect(intervalEntityKeyFromString("60:treble:C")).toBeNull();
  });

  it("returns null for malformed interval keys", () => {
    expect(intervalEntityKeyFromString("interval:1")).toBeNull(); // 1 = unison, not in catalog
    expect(intervalEntityKeyFromString("interval:9")).toBeNull(); // beyond octave
    expect(intervalEntityKeyFromString("interval:x")).toBeNull();
  });
});

// --- Catalog sizes -----------------------------------------------------------

describe("INTERVAL_SIZES", () => {
  it("lists exactly the 7 interval sizes 2 through 8", () => {
    expect(INTERVAL_SIZES).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

// --- Instance generation -----------------------------------------------------

describe("generateIntervalInstance", () => {
  it("produces an instance with the correct diatonic interval size", () => {
    for (const size of INTERVAL_SIZES) {
      const prng = mulberry32(size * 100);
      const inst = generateIntervalInstance(size, prng);
      // Diatonic distance = difference in staff steps (midiLetter + octave*7).
      const stepLow = Math.floor(inst.lowPitch / 12) * 7 + midiLetter(inst.lowPitch);
      const stepHigh = Math.floor(inst.highPitch / 12) * 7 + midiLetter(inst.highPitch);
      expect(stepHigh - stepLow).toBe(size);
    }
  });

  it("always has highPitch > lowPitch (ascending)", () => {
    for (const size of INTERVAL_SIZES) {
      const inst = generateIntervalInstance(size, mulberry32(size));
      expect(inst.highPitch).toBeGreaterThan(inst.lowPitch);
    }
  });

  it("keeps both pitches within the treble staff range (C4..F5)", () => {
    // C4=60, F5=77 — leave headroom so even an 8ve fits.
    for (const size of INTERVAL_SIZES) {
      // Try multiple seeds to catch range edge cases.
      for (let seed = 0; seed < 20; seed++) {
        const inst = generateIntervalInstance(size, mulberry32(seed + size * 1000));
        expect(inst.lowPitch).toBeGreaterThanOrEqual(60);
        expect(inst.highPitch).toBeLessThanOrEqual(77);
      }
    }
  });

  it("generates only natural pitches (C major, no accidentals)", () => {
    // C-major naturals: C=0, D=2, E=4, F=5, G=7, A=9, B=11
    const naturalPCs = [0, 2, 4, 5, 7, 9, 11];
    for (const size of INTERVAL_SIZES) {
      const inst = generateIntervalInstance(size, mulberry32(size + 42));
      expect(naturalPCs).toContain(inst.lowPitch % 12);
      expect(naturalPCs).toContain(inst.highPitch % 12);
    }
  });

  it("sets the size and harmonic flag on the instance", () => {
    const inst = generateIntervalInstance(5, mulberry32(99));
    expect(inst.size).toBe(5);
    expect(typeof inst.harmonic).toBe("boolean");
  });

  it("is deterministic for the same seed", () => {
    const seed = 12345;
    const a = generateIntervalInstance(3, mulberry32(seed));
    const b = generateIntervalInstance(3, mulberry32(seed));
    expect(a).toEqual(b);
  });

  it("produces different instances for different seeds (probabilistic)", () => {
    // With enough tries, two different seeds should produce different pitch
    // pairs for the same interval size.
    const size = 4;
    let found = false;
    for (let s = 0; s < 50 && !found; s++) {
      const a = generateIntervalInstance(size, mulberry32(s));
      const b = generateIntervalInstance(size, mulberry32(s + 100));
      if (a.lowPitch !== b.lowPitch || a.harmonic !== b.harmonic) found = true;
    }
    expect(found).toBe(true);
  });
});
