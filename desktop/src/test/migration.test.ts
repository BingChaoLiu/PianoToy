import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks -------------------------------------------------------------

// Control native detection + the Tauri invoke used for the .migrated marker.
let nativeMode = true;
const invokeMock = vi.fn(async (cmd: string, args?: any) => {
  if (cmd === "get_scores_root") return "/root/scores";
  if (cmd === "read_midi_bytes") {
    // .migrated marker presence is driven by markerExists below.
    if (args?.path?.endsWith(".migrated")) {
      if (markerExists) return [49];
      throw new Error("not found");
    }
    return [];
  }
  if (cmd === "save_midi_bytes") {
    if (args?.path?.endsWith(".migrated")) {
      if (markerWriteFails) throw new Error("disk full");
      markerExists = true;
      return;
    }
    return;
  }
  return null;
});

let markerExists = false;
let markerWriteFails = false;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: any) => invokeMock(cmd, args),
}));
vi.mock("@/lib/score-storage/env", () => ({
  isNative: () => nativeMode,
}));

// Mock the facade's importScoreToFolder + listScores so migration is isolated.
const importScoreToFolderMock = vi.fn(async (input: any, folder: string) => {
  await mockBackend.writeMidi(folder, input.midiBytes);
  await mockBackend.writeMeta(folder, { id: folder } as any);
  return { id: folder } as any;
});
const listScoresMock = vi.fn(async () => [] as any[]);

vi.mock("@/lib/score-storage", () => ({
  importScoreToFolder: (input: any, folder: string) => importScoreToFolderMock(input, folder),
  listScores: () => listScoresMock(),
}));

// Mock the legacy midi-storage.
const loadAllMidiMock = vi.fn(async () => [] as { id: string; bytes: Uint8Array }[]);
const clearAllMidiMock = vi.fn(async () => undefined);
vi.mock("@/lib/midi-storage", () => ({
  loadAllMidi: () => loadAllMidiMock(),
  clearAllMidi: () => clearAllMidiMock(),
}));

// Mock parseSmf so we don't depend on real MIDI bytes in the fixture.
vi.mock("@/lib/smf-parser", () => ({
  parseSmf: () => ({ duration: 10, notes: new Array(5) }),
}));

// A shared mock backend to observe side effects.
const mockBackend = {
  writeMidi: vi.fn().mockResolvedValue(undefined),
  writePdf: vi.fn(),
  writeMeta: vi.fn().mockResolvedValue(undefined),
  readMeta: vi.fn(),
  readMidi: vi.fn(),
  readPdf: vi.fn(),
  deleteScoreFolder: vi.fn(),
  getScoresRoot: vi.fn().mockResolvedValue("/root/scores"),
};

import { migrateIndexedDbToFs } from "@/lib/score-storage/migration";

describe("migrateIndexedDbToFs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMode = true;
    markerExists = false;
    markerWriteFails = false;
    loadAllMidiMock.mockResolvedValue([
      { id: "custom-1718841600123", name: "Mad World", bytes: new Uint8Array([1, 2, 3]) } as any,
      { id: "custom-1718900000000", name: "Für Elise", bytes: new Uint8Array([4]) } as any,
    ]);
    listScoresMock.mockResolvedValue([]);
    importScoreToFolderMock.mockImplementation(async (input: any, folder: string) => {
      await mockBackend.writeMidi(folder, input.midiBytes);
      await mockBackend.writeMeta(folder, { id: folder } as any);
      return { id: folder } as any;
    });
  });

  it("skips when marker already present", async () => {
    markerExists = true;
    const result = await migrateIndexedDbToFs();
    expect(result.skipped).toBe(true);
    expect(result.migrated).toBe(0);
    expect(loadAllMidiMock).not.toHaveBeenCalled();
    expect(mockBackend.writeMidi).not.toHaveBeenCalled();
    expect(clearAllMidiMock).not.toHaveBeenCalled();
  });

  it("writes each old record to a folder, sets marker, then clears old db", async () => {
    const result = await migrateIndexedDbToFs();
    expect(result.skipped).toBe(false);
    expect(result.migrated).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockBackend.writeMidi).toHaveBeenCalledTimes(2);
    expect(clearAllMidiMock).toHaveBeenCalledTimes(1);
  });

  it("does not clear old db if marker write fails", async () => {
    markerWriteFails = true;
    const result = await migrateIndexedDbToFs();
    expect(result.migrated).toBe(2);
    expect(clearAllMidiMock).not.toHaveBeenCalled();
  });

  it("continues past a single failing record and reports failed count", async () => {
    let first = true;
    importScoreToFolderMock.mockImplementation(async (_input: any, folder: string) => {
      if (first) {
        first = false;
        return { id: folder } as any;
      }
      throw new Error("write failed");
    });
    const result = await migrateIndexedDbToFs();
    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(1);
    expect(clearAllMidiMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op in non-native (browser) mode", async () => {
    nativeMode = false;
    const result = await migrateIndexedDbToFs();
    expect(result.skipped).toBe(true);
    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(0);
    expect(loadAllMidiMock).not.toHaveBeenCalled();
    expect(mockBackend.writeMidi).not.toHaveBeenCalled();
    expect(clearAllMidiMock).not.toHaveBeenCalled();
  });

  it("dedupes folders already migrated in a prior partial run", async () => {
    // First legacy record's folder already exists on disk → counted as migrated, not re-written.
    listScoresMock.mockResolvedValue([{ id: "1718841600123-1718841600123" } as any]);
    const result = await migrateIndexedDbToFs();
    expect(result.migrated).toBe(2); // 1 deduped-as-migrated + 1 imported
    expect(result.failed).toBe(0);
    expect(mockBackend.writeMidi).toHaveBeenCalledTimes(1); // only the 2nd record written
  });
});
