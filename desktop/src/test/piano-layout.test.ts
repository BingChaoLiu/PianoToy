import { describe, it, expect } from "vitest";
import { computeLayout, midiFromPoint } from "@/lib/piano-layout";
import { NUM_KEYS, FIRST_MIDI, isBlack } from "@/lib/note-utils";

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

// --- midiFromPoint (hit testing) --------------------------------------------

describe("midiFromPoint", () => {
  // Use a known layout: 1040 wide, 600 tall.
  const W = 1040;
  const H = 600;
  const l = computeLayout(W, H);
  const pianoTop = l.height - l.pianoHeight;

  it("returns null for points above the piano region", () => {
    expect(midiFromPoint(l, 100, 0)).toBeNull();
    expect(midiFromPoint(l, 500, pianoTop - 1)).toBeNull();
  });

  it("returns null for points below the piano region", () => {
    expect(midiFromPoint(l, 500, H + 1)).toBeNull();
  });

  it("returns a white-key MIDI when clicking a white key's center", () => {
    // Middle C (MIDI 60) is a white key. Click its center X at the bottom
    // of the piano (below the black-key region).
    const mcX = l.keyX[60 - FIRST_MIDI];
    const y = pianoTop + l.pianoHeight * 0.9; // near the bottom
    const midi = midiFromPoint(l, mcX, y);
    expect(midi).toBe(60);
    expect(isBlack(midi!)).toBe(false);
  });

  it("returns a black-key MIDI when clicking a black key's center", () => {
    // C#4 (MIDI 61) is a black key. Click its center X near the top of the
    // piano (within the black-key height region).
    const csX = l.keyX[61 - FIRST_MIDI];
    const y = pianoTop + l.pianoHeight * 0.3; // within black-key region
    const midi = midiFromPoint(l, csX, y);
    expect(midi).toBe(61);
    expect(isBlack(midi!)).toBe(true);
  });

  it("prefers the black key when the point overlaps both a black and white key", () => {
    // A black key sits between two white keys. A click at the black key's
    // center should return the black key, not the underlying white key.
    const blackMidi = 61; // C#4
    const cx = l.keyX[blackMidi - FIRST_MIDI];
    const y = pianoTop + l.pianoHeight * 0.2; // top of piano
    const midi = midiFromPoint(l, cx, y);
    expect(midi).toBe(blackMidi);
  });

  it("returns the underlying white key when clicking below the black-key region", () => {
    // The same X as a black key, but below the black-key height — should
    // resolve to the white key beneath.
    const blackMidi = 61; // C#4
    const cx = l.keyX[blackMidi - FIRST_MIDI];
    const y = pianoTop + l.pianoHeight * 0.9; // bottom of piano
    const midi = midiFromPoint(l, cx, y);
    // Should be a white key near C4, NOT the black key.
    expect(isBlack(midi!)).toBe(false);
  });
});
