import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock toolkit ----------------------------------------------------------
// One toolkit instance is reused across the memoized singleton in the engine.
const mockToolkit = {
  options: null as Record<string, unknown> | null,
  loadedData: "",
  pageCount: 2,
  timemap: [
    { tstamp: 0, on: ["n1", "n2"], off: [] },
    { tstamp: 500, on: ["n3"], off: ["n1", "n2"] },
    { tstamp: 1000, on: ["n4"], off: ["n3"] },
    { tstamp: 1500, off: ["n4"] },
  ],
  setOptions(o: Record<string, unknown>) {
    this.options = o;
  },
  loadData(data: string): boolean {
    this.loadedData = data;
    return true;
  },
  getPageCount(): number {
    return this.pageCount;
  },
  renderToSVG(p: number): string {
    return `<svg data-page="${p}"></svg>`;
  },
  renderToTimemap() {
    return this.timemap;
  },
};

vi.mock("verovio/wasm", () => ({ default: async () => ({}) }));
vi.mock("verovio/esm", () => ({
  VerovioToolkit: class {
    constructor() {
      return mockToolkit;
    }
  },
}));

import {
  loadScoreIntoVerovio,
  findActiveNoteIds,
  destroyVerovio,
  type VerovioScore,
} from "@/lib/verovio-engine";

const MXML = "<score-partwise/>";

describe("loadScoreIntoVerovio", () => {
  beforeEach(() => {
    mockToolkit.options = null;
    mockToolkit.loadedData = "";
    mockToolkit.pageCount = 2;
    mockToolkit.timemap = [
      { tstamp: 0, on: ["n1", "n2"], off: [] },
      { tstamp: 500, on: ["n3"], off: ["n1", "n2"] },
      { tstamp: 1000, on: ["n4"], off: ["n3"] },
      { tstamp: 1500, off: ["n4"] },
    ];
    destroyVerovio();
  });

  it("renders all pages and aggregates note ids by start time", async () => {
    const score = await loadScoreIntoVerovio(MXML);
    expect(score.svgPages).toHaveLength(2);
    expect(score.svgPages[0]).toContain('data-page="1"');
    expect(score.noteIdByStartMs).toEqual([
      { startMs: 0, noteIds: ["n1", "n2"] },
      { startMs: 500, noteIds: ["n3"] },
      { startMs: 1000, noteIds: ["n4"] },
    ]);
    // entry with only `off` (no `on`) is dropped from the highlight index
    expect(score.noteIdByStartMs.find((e) => e.startMs === 1500)).toBeUndefined();
  });

  it("passes layout options to the toolkit", async () => {
    await loadScoreIntoVerovio(MXML);
    expect(mockToolkit.options).toMatchObject({
      adjustPageHeight: true,
      breaks: "auto",
    });
  });

  it("throws when loadData returns false", async () => {
    mockToolkit.loadData = () => false;
    await expect(loadScoreIntoVerovio("bad")).rejects.toThrow(/loadData returned false/i);
    mockToolkit.loadData = (d: string) => {
      mockToolkit.loadedData = d;
      return true;
    };
  });
});

describe("findActiveNoteIds", () => {
  const score: VerovioScore = {
    svgPages: [],
    timemap: [],
    measureCount: 0,
    noteIdByStartMs: [
      { startMs: 0, noteIds: ["n1", "n2"] },
      { startMs: 500, noteIds: ["n3"] },
      { startMs: 1000, noteIds: ["n4"] },
    ],
  };

  it("returns empty before the first onset", () => {
    expect(findActiveNoteIds(-10, score)).toEqual([]);
    expect(findActiveNoteIds(-1, score)).toEqual([]);
  });

  it("returns empty for an empty index", () => {
    expect(findActiveNoteIds(100, { ...score, noteIdByStartMs: [] })).toEqual([]);
  });

  it("highlights the chord at the exact start time", () => {
    expect(findActiveNoteIds(0, score)).toEqual(["n1", "n2"]);
  });

  it("holds the current chord until the next onset (mid-window)", () => {
    expect(findActiveNoteIds(250, score)).toEqual(["n1", "n2"]);
    expect(findActiveNoteIds(499, score)).toEqual(["n1", "n2"]);
  });

  it("switches to the next chord at its start time", () => {
    expect(findActiveNoteIds(500, score)).toEqual(["n3"]);
    expect(findActiveNoteIds(750, score)).toEqual(["n3"]);
    expect(findActiveNoteIds(1000, score)).toEqual(["n4"]);
  });

  it("holds the last chord past the final onset", () => {
    expect(findActiveNoteIds(5000, score)).toEqual(["n4"]);
  });
});
