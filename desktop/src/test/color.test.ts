import { describe, it, expect } from "vitest";
import {
  TRACK_PALETTE, trackColor,
  colorForSongNote,
  pianoKeyActiveColor, pianoKeySongColor, glowForMidi,
} from "@/lib/color";

describe("trackColor", () => {
  it("returns palette entry for non-negative indices", () => {
    expect(trackColor(0).fill).toBe(TRACK_PALETTE[0].fill);
    expect(trackColor(5).fill).toBe(TRACK_PALETTE[5].fill);
  });

  it("wraps negative indices", () => {
    expect(trackColor(-1).fill).toBe(TRACK_PALETTE[TRACK_PALETTE.length - 1].fill);
    expect(trackColor(-7).fill).toBe(TRACK_PALETTE[TRACK_PALETTE.length - 1].fill);
  });

  it("treats undefined as 0", () => {
    expect(trackColor(undefined).fill).toBe(TRACK_PALETTE[0].fill);
  });
});

describe("pianoKeyActiveColor", () => {
  it("split: left hand teal, right hand gold", () => {
    expect(pianoKeyActiveColor(50, "split")).toBe("#4dd4c0"); // < middle C
    expect(pianoKeyActiveColor(70, "split")).toBe("#f5b942"); // > middle C
  });

  it("none: always gold", () => {
    expect(pianoKeyActiveColor(50, "none")).toBe("#f5b942");
    expect(pianoKeyActiveColor(70, "none")).toBe("#f5b942");
  });
});

describe("pianoKeySongColor", () => {
  it("track mode uses track palette", () => {
    expect(pianoKeySongColor({ midi: 60, track: 0 }, "track")).toBe(TRACK_PALETTE[0].fill);
    expect(pianoKeySongColor({ midi: 60, track: 2 }, "track")).toBe(TRACK_PALETTE[2].fill);
  });

  it("split mode falls back to active color", () => {
    expect(pianoKeySongColor({ midi: 50 }, "split")).toBe("#4dd4c0");
    expect(pianoKeySongColor({ midi: 70 }, "split")).toBe("#f5b942");
  });
});

describe("glowForMidi", () => {
  it("returns glow string for low and high registers", () => {
    const low = glowForMidi(40);
    const high = glowForMidi(80);
    expect(low).toMatch(/rgba/);
    expect(high).toMatch(/rgba/);
    expect(low).not.toBe(high);
  });
});


describe("colorForSongNote in track mode", () => {
  it("non-isNow uses track palette", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96, track: 2 };
    const c = colorForSongNote(
      note,
      { isNow: false },
      "track",
    );
    expect(c).toBe(TRACK_PALETTE[2].fill);
  });

  it("isNow always white regardless of track", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96, track: 3 };
    const c = colorForSongNote(
      note,
      { isNow: true },
      "track",
    );
    expect(c).toBe("#ffffff");
  });

  it("wraps track index modulo palette length", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96, track: TRACK_PALETTE.length };
    const c = colorForSongNote(
      note,
      { isNow: false },
      "track",
    );
    expect(c).toBe(TRACK_PALETTE[0].fill);
  });
});

describe("colorForSongNote practice states", () => {
  it("matched note is green", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96 };
    const c = colorForSongNote(
      note,
      { practice: true, matched: true, isNow: false },
      "split",
    );
    expect(c).toBe("#4ade80");
  });

  it("missed note is faded gray", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96 };
    const c = colorForSongNote(
      note,
      { practice: true, missed: true, isNow: false },
      "split",
    );
    expect(c).toBe("rgba(120, 124, 140, 0.35)");
  });

  it("upcoming note in practice is faded blue", () => {
    const note = { midi: 60, start: 0, duration: 1, velocity: 96 };
    const c = colorForSongNote(
      note,
      { practice: true, isNow: false },
      "split",
    );
    expect(c).toBe("rgba(180, 200, 255, 0.55)");
  });
});
