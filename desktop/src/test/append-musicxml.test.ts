// Tests for appendMusicXml: the function that retroactively attaches a
// generated MusicXML to an existing MIDI-only score and flips its meta to
// sourceFormat="musicxml". Drives the same code path the converter uses when
// a MIDI import finishes converting.
//
// We mock the score-storage env + native backend (the same pattern as
// migration.test.ts) so the test runs without Tauri. The backend records the
// calls so we can assert the file write + meta-patch sequence.

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory backend. Each method records its args.
const writes: Array<{ folder: string; filename: string; bytes: Uint8Array }> = [];
const metas = new Map<string, any>();

let nativeMode = true;

vi.mock("@/lib/score-storage/env", () => ({
  isNative: () => nativeMode,
}));

vi.mock("@/lib/score-storage/native", () => ({
  // Backend interface used by index.ts
  writeMidi: async (folder: string, bytes: Uint8Array) => {
    writes.push({ folder, filename: "song.mid", bytes });
  },
  writeMusicXml: async (folder: string, bytes: Uint8Array) => {
    writes.push({ folder, filename: "score.musicxml", bytes });
  },
  writeMeta: async (folder: string, meta: any) => {
    metas.set(folder, meta);
  },
  readMeta: async (folder: string) => metas.get(folder) ?? null,
  readMidi: async () => null,
  readMusicXml: async () => null,
  listScoreFoldersRaw: async () => [],
  deleteScoreFolderNative: async () => {},
  getScoresRoot: async () => "/scores",
}));

import { appendMusicXml } from "@/lib/score-storage";

beforeEach(() => {
  writes.length = 0;
  metas.clear();
  nativeMode = true;
});

describe("appendMusicXml", () => {
  it("writes the MusicXML file and patches an existing meta to sourceFormat=musicxml", async () => {
    // Pre-existing MIDI-only meta (what importScore would have written first).
    metas.set("custom-1", {
      schemaVersion: 3,
      id: "custom-1",
      name: "Ode to Joy",
      composer: "Beethoven",
      difficulty: "easy",
      category: "custom",
      midiFile: "song.mid",
      duration: 20,
      noteCount: 60,
      tempo: 120,
      timeSignature: "4/4",
      addedAt: 1700000000,
      sourceFormat: "midi",
      // musicXmlFile intentionally absent (MIDI-only).
    });

    const xmlBytes = new TextEncoder().encode("<score-partwise/>");
    const meta = await appendMusicXml("custom-1", xmlBytes);

    // Wrote the musicxml file exactly once.
    const xmlWrite = writes.find((w) => w.filename === "score.musicxml");
    expect(xmlWrite).toBeDefined();
    expect(xmlWrite!.folder).toBe("custom-1");
    expect(xmlWrite!.bytes).toBe(xmlBytes);

    // Meta patched in memory + persisted.
    expect(meta.sourceFormat).toBe("musicxml");
    expect(meta.musicXmlFile).toBe("score.musicxml");
    // Unrelated fields preserved.
    expect(meta.name).toBe("Ode to Joy");
    expect(meta.composer).toBe("Beethoven");
    expect(meta.duration).toBe(20);
    expect(metas.get("custom-1")).toEqual(meta);
  });

  it("builds a minimal meta when the folder has no existing meta (defensive)", async () => {
    // No meta pre-populated — readMeta returns null.
    const xmlBytes = new TextEncoder().encode("<score-partwise/>");
    const meta = await appendMusicXml("custom-2", xmlBytes);
    expect(meta.id).toBe("custom-2");
    expect(meta.sourceFormat).toBe("musicxml");
    expect(meta.musicXmlFile).toBe("score.musicxml");
    expect(meta.midiFile).toBe("song.mid");
  });

  it("rejects an invalid folder name", async () => {
    await expect(appendMusicXml("../escape", new Uint8Array())).rejects.toThrow(
      /invalid folder name/i,
    );
    await expect(appendMusicXml("CON", new Uint8Array())).rejects.toThrow(
      /invalid folder name/i,
    );
  });
});
