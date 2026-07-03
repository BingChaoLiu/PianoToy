import { describe, it, expect } from "vitest";
import { buildMetaFromMidi, parseListedMetas } from "@/lib/score-storage";
import { makeScoreId } from "@/lib/score-storage/slug";

describe("buildMetaFromMidi", () => {
  it("builds a valid meta with required fields", () => {
    const id = makeScoreId(1718841600, "Mad World");
    const meta = buildMetaFromMidi({
      id,
      name: "Mad World",
      composer: "Gary Jules",
      difficulty: "hard",
      duration: 198.4,
      noteCount: 542,
      tempo: 123,
      timeSignature: "4/4",
    });
    expect(meta.schemaVersion).toBe(3);
    expect(meta.id).toBe(id);
    expect(meta.midiFile).toBe("song.mid");
    expect(meta.category).toBe("custom");
    expect(meta.sourceFormat).toBe("midi");
    expect(meta.musicXmlFile).toBeUndefined();
  });

  it("marks musicxml sourceFormat and sets musicXmlFile", () => {
    const meta = buildMetaFromMidi({
      id: "x", name: "X", composer: "", difficulty: "medium",
      duration: 10, noteCount: 5, tempo: 100, timeSignature: "4/4",
      sourceFormat: "musicxml",
    });
    expect(meta.sourceFormat).toBe("musicxml");
    expect(meta.musicXmlFile).toBe("score.musicxml");
  });

  it("sets addedAt to a recent unix second", () => {
    const before = Math.floor(Date.now() / 1000);
    const meta = buildMetaFromMidi({
      id: "x", name: "X", composer: "", difficulty: "easy",
      duration: 1, noteCount: 1, tempo: 100, timeSignature: "4/4",
    });
    expect(meta.addedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("parseListedMetas", () => {
  it("skips invalid json and missing fields", () => {
    const raws = [
      "not json",
      JSON.stringify({ id: "x" }), // missing schemaVersion/midiFile
      JSON.stringify({ schemaVersion: 2, id: "y", name: "Y" }), // missing midiFile
      JSON.stringify({
        schemaVersion: 3, id: "ok", name: "Ok", composer: "", difficulty: "easy",
        category: "custom", midiFile: "song.mid",
        duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
      }),
    ];
    const metas = parseListedMetas(raws);
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe("ok");
    expect(metas[0].sourceFormat).toBe("midi"); // defaulted
  });

  it("applies safe defaults for missing optional fields", () => {
    const raw = JSON.stringify({
      schemaVersion: 3, id: "z", name: "Z", midiFile: "song.mid",
    });
    const metas = parseListedMetas([raw]);
    expect(metas[0]).toMatchObject({
      composer: "",
      difficulty: "medium",
      duration: 0,
      noteCount: 0,
      tempo: 120,
      timeSignature: "4/4",
      addedAt: 0,
      category: "custom",
      sourceFormat: "midi",
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseListedMetas([])).toEqual([]);
  });
});
