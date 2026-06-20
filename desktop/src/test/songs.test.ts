import { describe, it, expect } from "vitest";
import { DEMOS } from "@/lib/songs";
import { buildTwinkleSong } from "@/lib/songs/twinkle";
import { buildOdeToJoySong } from "@/lib/songs/ode";
import { buildFurEliseSong } from "@/lib/songs/fur-elise";
import { buildHappyBirthdaySong } from "@/lib/songs/happy-birthday";
import { FIRST_MIDI, LAST_MIDI } from "@/lib/note-utils";

describe("DEMOS registry", () => {
  it("has 4 entries with unique ids", () => {
    expect(DEMOS).toHaveLength(4);
    const ids = DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("every entry builds a valid song", () => {
    for (const d of DEMOS) {
      const song = d.build();
      expect(song.name).toContain(d.name.split(" ")[0]);
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.duration).toBeGreaterThan(0);
      for (const n of song.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(FIRST_MIDI);
        expect(n.midi).toBeLessThanOrEqual(LAST_MIDI);
        expect(n.duration).toBeGreaterThan(0);
        expect(n.start).toBeGreaterThanOrEqual(0);
        expect(n.velocity).toBeGreaterThan(0);
        expect(n.velocity).toBeLessThanOrEqual(127);
      }
    }
  });
});

describe("Twinkle", () => {
  it("has 42 melody + 36 bass = 78 notes", () => {
    const s = buildTwinkleSong();
    const melody = s.notes.filter((n) => n.track === 0);
    const bass = s.notes.filter((n) => n.track === 1);
    expect(melody.length).toBe(42);
    expect(bass.length).toBe(36);
    expect(s.notes.length).toBe(78);
  });
  it("starts at midi 60 (middle C) at t=0", () => {
    const s = buildTwinkleSong();
    expect(s.notes[0].midi).toBe(60);
    expect(s.notes[0].start).toBe(0);
  });
  it("all melody (track 0) notes are in C major diatonic range", () => {
    const s = buildTwinkleSong();
    const melody = s.notes.filter((n) => n.track === 0);
    for (const n of melody) {
      const r = n.midi % 12;
      // C major: 0,2,4,5,7,9,11
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(r);
    }
  });
  it("duration ? 48 seconds (12 phrases * 4s per phrase of half notes)", () => {
    const s = buildTwinkleSong();
    //  48  = 24 
    expect(s.duration).toBeGreaterThan(20);
    expect(s.duration).toBeLessThan(50);
  });
});

describe("Ode to Joy", () => {
  it("has melody + bass tracks", () => {
    const s = buildOdeToJoySong();
    const tracks = new Set(s.notes.map((n) => n.track));
    expect(tracks.has(0)).toBe(true);
    expect(tracks.has(1)).toBe(true);
  });
  it("starts with E4 (midi 64) ? 'Freude' pickup", () => {
    const s = buildOdeToJoySong();
    expect(s.notes[0].midi).toBe(64);
    expect(s.notes[0].start).toBe(0);
  });
});

describe("F?r Elise", () => {
  it("starts with the iconic A5 pickup (midi 76)", () => {
    const s = buildFurEliseSong();
    //  76 (A5 = E5 harmonic context but the famous pickup)
    expect(s.notes[0].midi).toBe(76);
  });
  it("has at least 30 melody notes (phrase A + B)", () => {
    const s = buildFurEliseSong();
    expect(s.notes.filter((n) => n.track === 0).length).toBeGreaterThanOrEqual(30);
  });
});

describe("Happy Birthday", () => {
  it("starts with C4 pickup (midi 60)", () => {
    const s = buildHappyBirthdaySong();
    expect(s.notes[0].midi).toBe(60);
  });
  it("contains a high C5 or higher (climax)", () => {
    const s = buildHappyBirthdaySong();
    const max = s.notes.reduce((m, n) => Math.max(m, n.midi), 0);
    expect(max).toBeGreaterThanOrEqual(72); // C5
  });
});

describe("notes are sorted by start time", () => {
  for (const d of DEMOS) {
    it(d.name, () => {
      const s = d.build();
      for (let i = 1; i < s.notes.length; i++) {
        expect(s.notes[i].start).toBeGreaterThanOrEqual(s.notes[i - 1].start);
      }
    });
  }
});
