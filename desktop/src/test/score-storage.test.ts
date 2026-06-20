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
      hasPdf: false,
    });
    expect(meta.schemaVersion).toBe(1);
    expect(meta.id).toBe(id);
    expect(meta.midiFile).toBe("song.mid");
    expect(meta.hasPdf).toBe(false);
    expect(meta.category).toBe("custom");
    expect(meta.pdfScroll).toBeUndefined();
    expect(meta.pdfFile).toBeUndefined();
  });

  it("includes pdfScroll placeholder when hasPdf is true", () => {
    const meta = buildMetaFromMidi({
      id: "x", name: "X", composer: "", difficulty: "medium",
      duration: 10, noteCount: 5, tempo: 100, timeSignature: "4/4", hasPdf: true,
    });
    expect(meta.hasPdf).toBe(true);
    expect(meta.pdfFile).toBe("score.pdf");
    expect(meta.pdfScroll).toEqual({ mode: "follow", scrollableHeight: 0, anchors: [] });
  });

  it("sets addedAt to a recent unix second", () => {
    const before = Math.floor(Date.now() / 1000);
    const meta = buildMetaFromMidi({
      id: "x", name: "X", composer: "", difficulty: "easy",
      duration: 1, noteCount: 1, tempo: 100, timeSignature: "4/4", hasPdf: false,
    });
    expect(meta.addedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("parseListedMetas", () => {
  it("skips invalid json and missing fields", () => {
    const raws = [
      "not json",
      JSON.stringify({ id: "x" }), // missing schemaVersion/midiFile
      JSON.stringify({ schemaVersion: 1, id: "y", name: "Y" }), // missing midiFile
      JSON.stringify({
        schemaVersion: 1, id: "ok", name: "Ok", composer: "", difficulty: "easy",
        category: "custom", midiFile: "song.mid", pdfFile: "score.pdf", hasPdf: true,
        duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
      }),
    ];
    const metas = parseListedMetas(raws, (id) => id === "ok");
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe("ok");
  });

  it("forces hasPdf false when pdf predicate returns false", () => {
    const raw = JSON.stringify({
      schemaVersion: 1, id: "nope", name: "N", composer: "", difficulty: "easy",
      category: "custom", midiFile: "song.mid", pdfFile: "score.pdf", hasPdf: true,
      duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
    });
    const metas = parseListedMetas([raw], () => false);
    expect(metas[0].hasPdf).toBe(false);
    expect(metas[0].pdfFile).toBeUndefined();
    expect(metas[0].pdfScroll).toBeUndefined();
  });

  it("ensures pdfScroll exists when pdf present and meta lacks it", () => {
    const raw = JSON.stringify({
      schemaVersion: 1, id: "y", name: "Y", composer: "", difficulty: "easy",
      category: "custom", midiFile: "song.mid", hasPdf: false,
      duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
    });
    const metas = parseListedMetas([raw], () => true);
    expect(metas[0].hasPdf).toBe(true);
    expect(metas[0].pdfScroll).toEqual({ mode: "follow", scrollableHeight: 0, anchors: [] });
  });

  it("applies safe defaults for missing optional fields", () => {
    const raw = JSON.stringify({
      schemaVersion: 1, id: "z", name: "Z", midiFile: "song.mid",
    });
    const metas = parseListedMetas([raw], () => false);
    expect(metas[0]).toMatchObject({
      composer: "",
      difficulty: "medium",
      duration: 0,
      noteCount: 0,
      tempo: 120,
      timeSignature: "4/4",
      addedAt: 0,
      category: "custom",
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseListedMetas([], () => true)).toEqual([]);
  });
});
