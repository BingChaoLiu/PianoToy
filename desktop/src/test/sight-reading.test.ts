import { describe, it, expect } from "vitest";
import { buildSightReadingExercise, mulberry32, pickWeighted, diatonic } from "@/lib/sight-reading";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let sameCount = 0;
    for (let i = 0; i < 20; i++) {
      if (a() === b()) sameCount++;
    }
    expect(sameCount).toBeLessThan(20);
  });
});

describe("pickWeighted", () => {
  it("returns one of the values", () => {
    const rng = mulberry32(7);
    const v = pickWeighted(rng, [{ v: "x", w: 1 }, { v: "y", w: 1 }]);
    expect(["x", "y"]).toContain(v);
  });

  it("zero-weight item is never picked", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = pickWeighted(rng, [{ v: "a", w: 1 }, { v: "b", w: 0 }]);
      expect(v).toBe("a");
    }
  });
});

describe("diatonic", () => {
  it("C major scale starting at C4", () => {
    expect(diatonic(60, 0, 0)).toBe(60); // C4
    expect(diatonic(60, 1, 0)).toBe(62); // D4
    expect(diatonic(60, 6, 0)).toBe(71); // B4
    expect(diatonic(60, 7, 0)).toBe(72); // C5 (degree 7 = octave)
  });

  it("octave shift works", () => {
    expect(diatonic(60, 0, 1)).toBe(72); // C5
    expect(diatonic(60, 0, -1)).toBe(48); // C3
  });
});

describe("buildSightReadingExercise", () => {
  it("produces notes sorted by start time", () => {
    const { song } = buildSightReadingExercise({ seed: 1 });
    for (let i = 1; i < song.notes.length; i++) {
      expect(song.notes[i].start).toBeGreaterThanOrEqual(song.notes[i - 1].start);
    }
  });

  it("respects bars/beatsPerBar (note count roughly matches total beats)", () => {
    // Default intermediate adds some eighths, so the count is >= bars * beatsPerBar.
    const { song } = buildSightReadingExercise({ seed: 2, bars: 4, beatsPerBar: 4 });
    expect(song.notes.length).toBeGreaterThanOrEqual(16);
    // Upper bound: every beat split into eighths -> 2 * total = 32, plus the downbeat starter.
    expect(song.notes.length).toBeLessThanOrEqual(33);
  });

  it("first note is the tonic", () => {
    const { song } = buildSightReadingExercise({ seed: 3, key: "C", octave: 4 });
    expect(song.notes[0].midi % 12).toBe(0); // C
  });

  it("is deterministic with the same seed", () => {
    const a = buildSightReadingExercise({ seed: 100 });
    const b = buildSightReadingExercise({ seed: 100 });
    expect(a.song.notes).toEqual(b.song.notes);
    expect(a.seed).toBe(b.seed);
  });

  it("different seeds give different songs", () => {
    const a = buildSightReadingExercise({ seed: 1 });
    const b = buildSightReadingExercise({ seed: 2 });
    const aMidis = a.song.notes.map((n) => n.midi).join(",");
    const bMidis = b.song.notes.map((n) => n.midi).join(",");
    expect(aMidis).not.toEqual(bMidis);
  });

  it("returns the seed it used", () => {
    const { seed } = buildSightReadingExercise({ seed: 999 });
    expect(seed).toBe(999);
  });

  it("generates a seed when none provided", () => {
    const { seed } = buildSightReadingExercise();
    expect(typeof seed).toBe("number");
    expect(Number.isFinite(seed)).toBe(true);
  });

  it("duration covers last note end", () => {
    const { song } = buildSightReadingExercise({ seed: 4, bars: 4 });
    const lastEnd = song.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
    expect(song.duration).toBeGreaterThanOrEqual(lastEnd - 0.001);
  });

  it("respects octave parameter", () => {
    const { song } = buildSightReadingExercise({ seed: 5, key: "C", octave: 5 });
    // Tonic at C5 = 72, all notes should be near there.
    expect(song.notes[0].midi).toBe(72);
  });

  it("beginner difficulty keeps mostly stepwise motion", () => {
    const { song } = buildSightReadingExercise({ seed: 6, difficulty: "beginner" });
    let leaps = 0;
    for (let i = 1; i < song.notes.length; i++) {
      if (Math.abs(song.notes[i].midi - song.notes[i - 1].midi) > 4) leaps++;
    }
    // Allow up to 20% leaps, but expect far fewer in beginner mode.
    expect(leaps / song.notes.length).toBeLessThan(0.2);
  });

  it("supports Bb and Eb keys", () => {
    const { song } = buildSightReadingExercise({ seed: 7, key: "Bb", octave: 4 });
    // Bb at octave 4 = 70 (A#4)
    expect(song.notes[0].midi).toBe(70);
    const { song: eb } = buildSightReadingExercise({ seed: 8, key: "Eb", octave: 4 });
    // Eb4 = 63
    expect(eb.notes[0].midi).toBe(63);
  });

  it("name reflects config", () => {
    const { song } = buildSightReadingExercise({
      seed: 9, key: "G", bars: 8, difficulty: "advanced",
    });
    expect(song.name).toContain("G major");
    expect(song.name).toContain("advanced");
    expect(song.name).toContain("8 bars");
  });

  // --- Enhanced generator tests ---

  it("advanced difficulty can produce two-hand notes (track 1)", () => {
    // Run multiple seeds since dual-hand is probabilistic (~60% chance)
    let foundTwoHand = false;
    for (let s = 1000; s < 1050; s++) {
      const { song } = buildSightReadingExercise({
        seed: s, difficulty: "advanced", dualHand: true,
      });
      if (song.notes.some((n) => n.track === 1)) {
        foundTwoHand = true;
        break;
      }
    }
    expect(foundTwoHand).toBe(true);
  });

  it("dualHand=true always generates track 1 notes", () => {
    const { song } = buildSightReadingExercise({
      seed: 42, difficulty: "advanced", dualHand: true,
    });
    expect(song.notes.some((n) => n.track === 1)).toBe(true);
    expect(song.tracks.length).toBe(2);
  });

  it("beginner difficulty never produces two-hand notes", () => {
    const { song } = buildSightReadingExercise({
      seed: 42, difficulty: "beginner",
    });
    expect(song.notes.every((n) => n.track === 0)).toBe(true);
  });

  it("advanced difficulty allows larger leaps than beginner", () => {
    let beginnerMaxLeap = 0;
    let advancedMaxLeap = 0;
    for (let s = 0; s < 20; s++) {
      const b = buildSightReadingExercise({ seed: s, difficulty: "beginner" });
      const a = buildSightReadingExercise({ seed: s, difficulty: "advanced" });
      for (let i = 1; i < b.song.notes.length; i++) {
        beginnerMaxLeap = Math.max(beginnerMaxLeap,
          Math.abs(b.song.notes[i].midi - b.song.notes[i - 1].midi));
      }
      for (let i = 1; i < a.song.notes.length; i++) {
        advancedMaxLeap = Math.max(advancedMaxLeap,
          Math.abs(a.song.notes[i].midi - a.song.notes[i - 1].midi));
      }
    }
    // Advanced should produce leaps at least as large as beginner
    expect(advancedMaxLeap).toBeGreaterThanOrEqual(beginnerMaxLeap);
  });

  it("name includes time signature info", () => {
    const { song } = buildSightReadingExercise({
      seed: 10, difficulty: "advanced",
    });
    // Name should contain a time signature like "44", "34", "24", or "68"
    expect(song.name).toMatch(/(44|34|24|68)/);
  });

  it("supports 6/8 time signature", () => {
    const { song } = buildSightReadingExercise({
      seed: 11, difficulty: "advanced", timeSignature: "6/8",
    });
    // 6/8 means 6 beats per bar, so 4 bars = 24 beats
    expect(song.notes.length).toBeGreaterThanOrEqual(10);
  });

  it("beginner only uses C major", () => {
    // Beginner profile restricts keys to ["C"]
    for (let s = 0; s < 30; s++) {
      const { song } = buildSightReadingExercise({ seed: s, difficulty: "beginner" });
      // First note should always be C (midi % 12 === 0)
      expect(song.notes[0].midi % 12).toBe(0);
    }
  });

  it("intermediate can use G or F keys", () => {
    let foundNonC = false;
    for (let s = 0; s < 100; s++) {
      const { song } = buildSightReadingExercise({ seed: s, difficulty: "intermediate" });
      // G major tonic = 7, F major tonic = 5
      const tonic = song.notes[0].midi % 12;
      if (tonic !== 0) {
        foundNonC = true;
        break;
      }
    }
    expect(foundNonC).toBe(true);
  });
});
