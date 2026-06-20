import { describe, it, expect } from "vitest";
import { buildBachMinuetG } from "@/lib/songs/bach-minuet-g";
import { buildBachPreludeC } from "@/lib/songs/bach-prelude-c";
import { buildMozartTwinkleVar } from "@/lib/songs/mozart-twinkle-var";
import { buildBeethovenSonatinaG } from "@/lib/songs/beethoven-sonatina-g";
import { buildChopinPreludeE } from "@/lib/songs/chopin-prelude-e";
import { buildSchumannWildHorseman } from "@/lib/songs/schumann-wild-horseman";
import { buildTchaikovskyOldFrench } from "@/lib/songs/tchaikovsky-old-french";
import { buildBurgmuellerArabesque } from "@/lib/songs/burgmueller-arabesque";
import { SCORE_CATALOG } from "@/lib/songs/catalog";

describe("public domain songs", () => {
  const builders = [
    { name: "Bach Minuet G", fn: buildBachMinuetG },
    { name: "Bach Prelude C", fn: buildBachPreludeC },
    { name: "Mozart Twinkle Var", fn: buildMozartTwinkleVar },
    { name: "Beethoven Sonatina G", fn: buildBeethovenSonatinaG },
    { name: "Chopin Prelude E", fn: buildChopinPreludeE },
    { name: "Schumann Wild Horseman", fn: buildSchumannWildHorseman },
    { name: "Tchaikovsky Old French", fn: buildTchaikovskyOldFrench },
    { name: "Burgmueller Arabesque", fn: buildBurgmuellerArabesque },
  ];

  builders.forEach(({ name, fn }) => {
    describe(name, () => {
      it("produces a valid song", () => {
        const song = fn();
        expect(song.name).toBeTruthy();
        expect(song.notes.length).toBeGreaterThan(10);
        expect(song.duration).toBeGreaterThan(5);
        expect(song.notes[0].midi).toBeGreaterThanOrEqual(21);
        expect(song.notes[0].midi).toBeLessThanOrEqual(108);
      });

      it("has sorted notes", () => {
        const song = fn();
        for (let i = 1; i < song.notes.length; i++) {
          expect(song.notes[i].start).toBeGreaterThanOrEqual(song.notes[i - 1].start - 0.001);
        }
      });

      it("has valid durations", () => {
        const song = fn();
        for (const n of song.notes) {
          expect(n.duration).toBeGreaterThan(0);
          expect(n.velocity).toBeGreaterThan(0);
        }
      });
    });
  });

  it("catalog has at least 10 entries with working builds", () => {
    const buildable = SCORE_CATALOG.filter((e) => e.build !== null);
    expect(buildable.length).toBeGreaterThanOrEqual(10);
    for (const entry of buildable) {
      const song = entry.build!();
      expect(song.notes.length).toBeGreaterThan(5);
    }
  });

  it("all catalog entries have required fields", () => {
    for (const entry of SCORE_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.composer).toBeTruthy();
      expect(entry.difficulty).toBeTruthy();
      expect(entry.duration).toBeGreaterThan(0);
      expect(entry.category).toBeTruthy();
    }
  });
});
