import { describe, it, expect } from "vitest";
import { encodeSmf } from "@/lib/smf-writer";
import { parseSmf } from "@/lib/smf-parser";
import type { Note } from "@/types/midi";

function note(midi: number, start: number, duration: number, velocity = 96): Note {
  return { midi, start, duration, velocity, track: 0 };
}

describe("encodeSmf", () => {
  it("starts with MThd header and format 0", () => {
    const bytes = encodeSmf([note(60, 0, 0.5)]);
    expect(bytes[0]).toBe(0x4d); // M
    expect(bytes[1]).toBe(0x54);
    expect(bytes[2]).toBe(0x68);
    expect(bytes[3]).toBe(0x64);
    // format 0
    expect(bytes[8]).toBe(0);
    expect(bytes[9]).toBe(0);
    // 1 track
    expect(bytes[10]).toBe(0);
    expect(bytes[11]).toBe(1);
  });

  it("default ppqn is 480", () => {
    const bytes = encodeSmf([note(60, 0, 0.5)]);
    expect((bytes[12] << 8) | bytes[13]).toBe(480);
  });

  it("writes end-of-track meta", () => {
    const bytes = encodeSmf([note(60, 0, 0.5)]);
    // last 3 bytes should be FF 2F 00
    const last = bytes.length;
    expect(bytes[last - 3]).toBe(0xff);
    expect(bytes[last - 2]).toBe(0x2f);
    expect(bytes[last - 1]).toBe(0x00);
  });

  it("round-trips a single note through parseSmf", () => {
    const original = [note(60, 0, 0.5, 96)];
    const bytes = encodeSmf(original);
    const parsed = parseSmf(bytes);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].midi).toBe(60);
    expect(parsed.notes[0].start).toBeCloseTo(0, 2);
    expect(parsed.notes[0].duration).toBeCloseTo(0.5, 2);
    expect(parsed.notes[0].velocity).toBe(96);
  });

  it("round-trips multiple notes with overlapping onsets", () => {
    const original = [
      note(60, 0, 0.5),
      note(64, 0, 0.5),
      note(67, 0, 0.5),
      note(72, 1.0, 0.25),
    ];
    const bytes = encodeSmf(original);
    const parsed = parseSmf(bytes);
    expect(parsed.notes).toHaveLength(4);
    expect(parsed.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64, 67, 72]);
  });

  it("preserves ordering: off before on at the same tick", () => {
    // Note ending at t=1 and another starting at t=1 should round-trip cleanly.
    const original = [note(60, 0, 1.0), note(62, 1.0, 0.5)];
    const bytes = encodeSmf(original);
    const parsed = parseSmf(bytes);
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0].midi).toBe(60);
    expect(parsed.notes[0].duration).toBeCloseTo(1.0, 2);
    expect(parsed.notes[1].midi).toBe(62);
    expect(parsed.notes[1].start).toBeCloseTo(1.0, 2);
  });

  it("respects custom ppqn", () => {
    const bytes = encodeSmf([note(60, 0, 0.5)], 960);
    expect((bytes[12] << 8) | bytes[13]).toBe(960);
    // Round-trip should still parse correctly
    const parsed = parseSmf(bytes);
    expect(parsed.notes[0].duration).toBeCloseTo(0.5, 2);
  });

  it("clamps midi to 7 bits", () => {
    // Out-of-range values shouldn't crash the encoder; they get masked.
    const weird = [{ ...note(60, 0, 0.5), velocity: 200 }];
    const bytes = encodeSmf(weird);
    // Just verify it parses back without error.
    const parsed = parseSmf(bytes);
    expect(parsed.notes[0].velocity).toBe(200 & 0x7f);
  });
});
