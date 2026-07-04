import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock both underlying parsers so the dispatcher is tested in isolation.
const parseSmfMock = vi.fn((bytes: Uint8Array) => ({
  name: "MIDI",
  duration: 0,
  notes: [{ start: 0, duration: 1, midi: 60, velocity: 96 }],
  tracks: [],
  __from: "smf",
  __len: bytes.length,
}));
const parseMusicXmlMock = vi.fn(async (bytes: Uint8Array) => ({
  name: "MXML",
  duration: 0,
  notes: [{ start: 0, duration: 1, midi: 64, velocity: 90 }],
  tracks: [],
  __from: "musicxml",
  __len: bytes.length,
}));

vi.mock("@/lib/smf-parser", () => ({ parseSmf: (b: Uint8Array) => parseSmfMock(b) }));
vi.mock("@/lib/musicxml-parser", () => ({
  parseMusicXml: (b: Uint8Array) => parseMusicXmlMock(b),
}));

import { parseScore, inferFormatFromName } from "@/lib/score-parser";

describe("parseScore dispatcher", () => {
  beforeEach(() => {
    parseSmfMock.mockClear();
    parseMusicXmlMock.mockClear();
  });

  it("routes midi format to parseSmf (synchronously, wrapped in promise)", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const song = await parseScore(bytes, "midi");
    expect(parseSmfMock).toHaveBeenCalledTimes(1);
    expect(parseSmfMock).toHaveBeenCalledWith(bytes);
    expect(parseMusicXmlMock).not.toHaveBeenCalled();
    expect((song as any).__from).toBe("smf");
  });

  it("routes musicxml format to parseMusicXml", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const song = await parseScore(bytes, "musicxml");
    expect(parseMusicXmlMock).toHaveBeenCalledTimes(1);
    expect(parseMusicXmlMock).toHaveBeenCalledWith(bytes);
    expect(parseSmfMock).not.toHaveBeenCalled();
    expect((song as any).__from).toBe("musicxml");
  });

  it("normalizes a Tauri-style number[] into Uint8Array before parsing (regression)", async () => {
    // Tauri's invoke returns number[] despite the Uint8Array type claim; this
    // previously made TextDecoder.decode throw "parameter 1 is not of type
    // ArrayBuffer" on MusicXML import. parseScore must coerce it.
    const arr = [10, 20, 30];
    await parseScore(arr as unknown as Uint8Array, "midi");
    const passed = parseSmfMock.mock.calls[0][0];
    expect(passed).toBeInstanceOf(Uint8Array);
    expect(Array.from(passed as Uint8Array)).toEqual([10, 20, 30]);
  });

  it("normalizes an ArrayBuffer into Uint8Array before parsing", async () => {
    const buf = new Uint8Array([7, 8]).buffer;
    await parseScore(buf, "musicxml");
    const passed = parseMusicXmlMock.mock.calls[0][0];
    expect(passed).toBeInstanceOf(Uint8Array);
    expect(Array.from(passed as Uint8Array)).toEqual([7, 8]);
  });
});

describe("inferFormatFromName", () => {
  it("detects .mid and .midi as midi", () => {
    expect(inferFormatFromName("song.mid")).toBe("midi");
    expect(inferFormatFromName("SONG.MIDI")).toBe("midi");
  });

  it("detects .musicxml and .xml as musicxml", () => {
    expect(inferFormatFromName("score.musicxml")).toBe("musicxml");
    expect(inferFormatFromName("SCORE.XML")).toBe("musicxml");
  });

  it("returns null for unknown extensions", () => {
    expect(inferFormatFromName("song.pdf")).toBeNull();
    expect(inferFormatFromName("song")).toBeNull();
    expect(inferFormatFromName("")).toBeNull();
  });
});
