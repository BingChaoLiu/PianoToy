import { describe, it, expect } from "vitest";
import { parseSmf } from "@/lib/smf-parser";

/**  varlen 4  */
function varlen(v: number): number[] {
  const bytes: number[] = [];
  let buf = v & 0x7f;
  while ((v >>>= 7) > 0) {
    buf <<= 8;
    buf |= ((v & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buf & 0xff);
    if (buf & 0x80) buf >>>= 8;
    else break;
  }
  return bytes;
}

/**  format 0 SMF?1 track NoteOn/NoteOff? */
function buildMinimalSmf(): Uint8Array {
  // MThd: format=0, ntrks=1, division=480 (ppqn)
  const head = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // length 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    0x01, 0xe0,             // ppqn 480
  ];

  // Track events ?  event  delta varlen?
  const events: number[] = [];
  // Event 1: delta 0, NoteOn C4 vel=96
  events.push(...varlen(0), 0x90, 0x3c, 0x60);
  // Event 2: delta 480 (1 quarter), NoteOff C4 (? NoteOn vel=0)
  events.push(...varlen(480), 0x90, 0x3c, 0x00);
  // Event 3: delta 0, NoteOn E4 vel=100 (running status)
  events.push(...varlen(0), 0x90, 0x40, 0x64);
  // Event 4: delta 960, NoteOff E4
  events.push(...varlen(960), 0x90, 0x40, 0x00);
  // Event 5: End-of-track meta (delta 0)
  events.push(...varlen(0), 0xff, 0x2f, 0x00);

  const trkLen = events.length;
  const trk = [
    0x4d, 0x54, 0x72, 0x6b,                                  // "MTrk"
    0x00, 0x00, 0x00, trkLen,                                // length
    ...events,
  ];
  return new Uint8Array([...head, ...trk]);
}

describe("parseSmf", () => {
  it("parses minimal format 0 SMF with 2 notes", () => {
    const bytes = buildMinimalSmf();
    const song = parseSmf(bytes);
    expect(song.notes).toHaveLength(2);
    expect(song.notes[0].midi).toBe(60); // C4
    expect(song.notes[0].velocity).toBe(96);
    expect(song.notes[0].start).toBe(0);
    expect(song.notes[0].duration).toBeGreaterThan(0);
    expect(song.notes[1].midi).toBe(64); // E4
    expect(song.notes[1].velocity).toBe(100);
    expect(song.notes[1].start).toBeGreaterThan(0);
  });

  it("notes are sorted by start time", () => {
    const song = parseSmf(buildMinimalSmf());
    expect(song.notes[0].start).toBeLessThanOrEqual(song.notes[1].start);
  });

  it("duration covers the last note end", () => {
    const song = parseSmf(buildMinimalSmf());
    const lastEnd = song.notes.reduce(
      (m, n) => Math.max(m, n.start + n.duration),
      0,
    );
    expect(song.duration).toBeGreaterThanOrEqual(lastEnd - 0.01);
  });

  it("rejects non-MIDI buffer", () => {
    expect(() => parseSmf(new Uint8Array([0, 0, 0, 0]))).toThrow(/MThd/);
  });

  it("handles ArrayBuffer input too", () => {
    const bytes = buildMinimalSmf();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = parseSmf(buf);
    expect(song.notes).toHaveLength(2);
  });

  it("default tempo 500000 us/quarter = 120 BPM at ppqn=480 ? 1 quarter = 0.5s", () => {
    const song = parseSmf(buildMinimalSmf());
    // Note C4 ? t=0 duration ? 480 ticks = 1 quarter = 0.5s
    expect(song.notes[0].duration).toBeCloseTo(0.5, 2);
    // Note E4  t=0.5  NoteOff ? t=480 ticks = 0.5s?
    expect(song.notes[1].start).toBeCloseTo(0.5, 2);
  });
});

describe("parseSmf with tempo change", () => {
  it("respects Set Tempo meta at tick 0", () => {
    const head = [
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    ];
    const events: number[] = [];
    // tempo meta at tick 0
    events.push(...varlen(0), 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90);
    // NoteOn 60 vel 96 at delta 0
    events.push(...varlen(0), 0x90, 0x3c, 0x60);
    // NoteOff at delta 480 (1 quarter = 0.25s with new tempo)
    events.push(...varlen(480), 0x90, 0x3c, 0x00);
    // EOT
    events.push(...varlen(0), 0xff, 0x2f, 0x00);
    const trk = [
      0x4d, 0x54, 0x72, 0x6b,
      0x00, 0x00, 0x00, events.length,
      ...events,
    ];
    const bytes = new Uint8Array([...head, ...trk]);
    const song = parseSmf(bytes);
    expect(song.notes).toHaveLength(1);
    // tempo 250000 us/quarter ? 1 quarter = 0.25s
    expect(song.notes[0].duration).toBeCloseTo(0.25, 2);
  });
});
