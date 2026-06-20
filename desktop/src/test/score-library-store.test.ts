import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/score-storage", () => ({
  listScores: vi.fn().mockResolvedValue([
    {
      schemaVersion: 1, id: "1-a", name: "A", composer: "", difficulty: "easy",
      category: "custom", midiFile: "song.mid", hasPdf: false,
      duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
    },
    {
      schemaVersion: 1, id: "2-b", name: "B", composer: "", difficulty: "hard",
      category: "custom", midiFile: "song.mid", hasPdf: true, pdfFile: "score.pdf",
      duration: 20, noteCount: 2, tempo: 100, timeSignature: "4/4", addedAt: 2,
      pdfScroll: { mode: "follow", scrollableHeight: 0, anchors: [] },
    },
  ]),
}));

import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";

describe("useScoreLibraryStore", () => {
  beforeEach(() => {
    useScoreLibraryStore.setState({ customScores: [], loaded: false });
    localStorage.clear();
  });

  it("rescan loads scores from score-storage and maps to entries", async () => {
    await useScoreLibraryStore.getState().rescan();
    const { customScores } = useScoreLibraryStore.getState();
    expect(customScores).toHaveLength(2);
    expect(customScores[0]).toMatchObject({
      id: "1-a", name: "A", category: "custom", build: null, filePath: null,
    });
    expect(customScores[1].hasPdf).toBe(true);
    expect(useScoreLibraryStore.getState().loaded).toBe(true);
  });

  it("customScores is NOT persisted to localStorage (filesystem is source of truth)", async () => {
    await useScoreLibraryStore.getState().rescan();
    // partialize returns {} so the persisted state must contain no customScores.
    const raw = localStorage.getItem("piano.score-library");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state).not.toHaveProperty("customScores");
  });

  it("removeCustomScore updates in-memory list only", async () => {
    await useScoreLibraryStore.getState().rescan();
    useScoreLibraryStore.getState().removeCustomScore("1-a");
    expect(useScoreLibraryStore.getState().customScores).toHaveLength(1);
    expect(useScoreLibraryStore.getState().customScores[0].id).toBe("2-b");
  });

  it("rescan sets loaded=true even on failure (non-blocking)", async () => {
    const { listScores } = await import("@/lib/score-storage");
    (listScores as any).mockRejectedValueOnce(new Error("disk error"));
    await useScoreLibraryStore.getState().rescan();
    expect(useScoreLibraryStore.getState().loaded).toBe(true);
    expect(useScoreLibraryStore.getState().customScores).toEqual([]);
  });
});
