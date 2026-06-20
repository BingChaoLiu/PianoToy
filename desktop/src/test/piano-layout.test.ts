import { describe, it, expect } from "vitest";
import { computeLayout } from "@/lib/piano-layout";
import { NUM_KEYS } from "@/lib/note-utils";

describe("computeLayout", () => {
  it("returns 88-key layout", () => {
    const l = computeLayout(1280, 800);
    expect(l.keyX.length).toBe(NUM_KEYS);
    expect(l.whiteKeyIndex.length).toBe(NUM_KEYS);
    expect(l.keyIsWhite.length).toBe(NUM_KEYS);
  });

  it("pianoHeight scales with canvas height (16%, clamped 96..160)", () => {
    const small = computeLayout(800, 400).pianoHeight;
    const normal = computeLayout(1280, 800).pianoHeight;
    const huge = computeLayout(1280, 4000).pianoHeight;
    expect(small).toBeGreaterThanOrEqual(96);
    expect(huge).toBeLessThanOrEqual(160);
    expect(normal).toBeGreaterThan(96);
    expect(normal).toBeLessThan(160);
  });

  it("whiteKeyW = canvasW / 52", () => {
    const l = computeLayout(1040, 600);
    // 1040 / 52 = 20
    expect(l.whiteKeyW).toBeCloseTo(20, 5);
  });

  it("white key X coords are 0.5, 1.5, 2.5 ... multiples of whiteKeyW", () => {
    const l = computeLayout(1040, 600);
    // first white key is FIRST_MIDI (A0=21, white)
    const x0 = l.keyX[0];
    expect(x0).toBeCloseTo(l.whiteKeyW * 0.5, 5);
    // C4 (midi 60) should land somewhere in middle
    const idx = 60 - 21;
    expect(l.keyIsWhite[idx]).toBe(true);
  });

  it("black key X is between adjacent white keys", () => {
    const l = computeLayout(1040, 600);
    // midi 22 = A#0 (black), between A0 (21) and B0 (22 ? no, B0=23 white? no, B0 is white)
    // Actually: 21=A0(w), 22=A#0(b), 23=B0(w), so black key 22 between white 21 and 23
    const xBlack = l.keyX[22 - 21];
    const xLeft = l.keyX[21 - 21];
    const xRight = l.keyX[23 - 21];
    expect(xBlack).toBeGreaterThan(xLeft);
    expect(xBlack).toBeLessThan(xRight);
    expect(xBlack).toBeCloseTo((xLeft + xRight) / 2, 5);
  });
});
