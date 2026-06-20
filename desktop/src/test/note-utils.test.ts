import { describe, it, expect } from "vitest";
import {
  FIRST_MIDI, LAST_MIDI, NUM_KEYS, MIDDLE_C,
  noteName, isBlack, midiToFreq, clamp, formatTime, shade,
} from "@/lib/note-utils";

describe("note-utils constants", () => {
  it("covers 88 keys A0..C8", () => {
    expect(FIRST_MIDI).toBe(21);   // A0
    expect(LAST_MIDI).toBe(108);   // C8
    expect(NUM_KEYS).toBe(88);
    expect(MIDDLE_C).toBe(60);
  });
});

describe("noteName", () => {
  it("returns standard name with octave", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(69)).toBe("A4");
    expect(noteName(48)).toBe("C3");
    expect(noteName(72)).toBe("C5");
    expect(noteName(21)).toBe("A0");
    expect(noteName(108)).toBe("C8");
  });

  it("handles sharps", () => {
    expect(noteName(61)).toBe("C#4");
    expect(noteName(73)).toBe("C#5");
  });
});

describe("isBlack", () => {
  it("identifies C#/D#/F#/G#/A#", () => {
    // C major scale
    expect(isBlack(60)).toBe(false); // C
    expect(isBlack(61)).toBe(true);  // C#
    expect(isBlack(62)).toBe(false); // D
    expect(isBlack(63)).toBe(true);  // D#
    expect(isBlack(64)).toBe(false); // E
    expect(isBlack(65)).toBe(false); // F
    expect(isBlack(66)).toBe(true);  // F#
    expect(isBlack(67)).toBe(false); // G
    expect(isBlack(68)).toBe(true);  // G#
    expect(isBlack(69)).toBe(false); // A
    expect(isBlack(70)).toBe(true);  // A#
    expect(isBlack(71)).toBe(false); // B
  });

  it("across octaves", () => {
    expect(isBlack(21)).toBe(false);
    expect(isBlack(108)).toBe(false);
  });
});

describe("midiToFreq", () => {
  it("A4 = 440 Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 1);
  });
  it("C5 = ~523.25 Hz", () => {
    expect(midiToFreq(72)).toBeCloseTo(523.25, 1);
  });
  it("octave doubles frequency", () => {
    expect(midiToFreq(72) / midiToFreq(60)).toBeCloseTo(2, 2);
  });
});

describe("clamp/formatTime/shade", () => {
  it("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it("formatTime", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(-1)).toBe("0:00");
  });
  it("shade lightens/darkens hex", () => {
    const lighter = shade("#808080", 50);
    const darker = shade("#808080", -50);
    expect(lighter).toMatch(/^rgb\(/);
    expect(darker).toMatch(/^rgb\(/);
    // lighter  > darker  < 
    const mid = 128;
    const l = lighter.match(/\d+/g)!.map(Number);
    const d = darker.match(/\d+/g)!.map(Number);
    expect(l.every((v) => v >= mid)).toBe(true);
    expect(d.every((v) => v <= mid)).toBe(true);
  });
});
