import { describe, it, expect } from "vitest";
import { interpolatePdfY, generateCoarseAnchors } from "@/lib/pdf/anchor-scroll";
import type { PdfAnchor } from "@/lib/score-storage/types";

describe("interpolatePdfY", () => {
  const anchors: PdfAnchor[] = [
    { songTime: 0, pdfY: 0 },
    { songTime: 10, pdfY: 1000 },
    { songTime: 20, pdfY: 2000 },
  ];

  it("returns first anchor pdfY before the first anchor", () => {
    expect(interpolatePdfY(-5, anchors)).toBe(0);
  });

  it("returns last anchor pdfY after the last anchor", () => {
    expect(interpolatePdfY(30, anchors)).toBe(2000);
  });

  it("linearly interpolates between two anchors", () => {
    expect(interpolatePdfY(5, anchors)).toBe(500);
    expect(interpolatePdfY(15, anchors)).toBe(1500);
  });

  it("matches exactly at an anchor", () => {
    expect(interpolatePdfY(10, anchors)).toBe(1000);
  });

  it("returns 0 for empty anchors", () => {
    expect(interpolatePdfY(5, [])).toBe(0);
  });

  it("handles a single anchor (clamp)", () => {
    expect(interpolatePdfY(5, [{ songTime: 3, pdfY: 99 }])).toBe(99);
  });

  it("sorts unsorted anchors before interpolating", () => {
    const unsorted: PdfAnchor[] = [
      { songTime: 20, pdfY: 2000 },
      { songTime: 0, pdfY: 0 },
      { songTime: 10, pdfY: 1000 },
    ];
    expect(interpolatePdfY(5, unsorted)).toBe(500);
  });

  it("handles duplicate songTime anchors without div-by-zero", () => {
    const dups: PdfAnchor[] = [
      { songTime: 0, pdfY: 0 },
      { songTime: 10, pdfY: 500 },
      { songTime: 10, pdfY: 600 },
      { songTime: 20, pdfY: 1000 },
    ];
    // At songTime 10 the search lands on the first duplicate; any value in
    // [500,600] is acceptable as long as it doesn't throw / NaN.
    const y = interpolatePdfY(10, dups);
    expect(y).toBeGreaterThanOrEqual(500);
    expect(y).toBeLessThanOrEqual(600);
    expect(Number.isNaN(y)).toBe(false);
  });

  it("clamps to the last anchor pdfY when query reaches the final (duplicate) songTime", () => {
    // Last two anchors share songTime 10; querying AT 10 hits the after-last
    // clamp (songTime >= last.songTime) and returns the last pdfY.
    const degenerate: PdfAnchor[] = [
      { songTime: 0, pdfY: 0 },
      { songTime: 10, pdfY: 500 },
      { songTime: 10, pdfY: 600 },
    ];
    const y = interpolatePdfY(10, degenerate);
    expect(y).toBe(600);
    expect(Number.isNaN(y)).toBe(false);
  });

  it("interpolates correctly with negative pdfY anchors", () => {
    const neg: PdfAnchor[] = [
      { songTime: 0, pdfY: -100 },
      { songTime: 10, pdfY: 100 },
    ];
    expect(interpolatePdfY(5, neg)).toBe(0);
  });
});

describe("generateCoarseAnchors", () => {
  it("distributes duration evenly across pages", () => {
    const anchors = generateCoarseAnchors({ duration: 100, pageCount: 5, pageHeight: 800 });
    expect(anchors).toHaveLength(5);
    expect(anchors[0]).toEqual({ songTime: 0, pdfY: 0 });
    expect(anchors[4]).toEqual({ songTime: 80, pdfY: 3200 });
  });

  it("returns single anchor for one page", () => {
    const anchors = generateCoarseAnchors({ duration: 50, pageCount: 1, pageHeight: 1000 });
    expect(anchors).toEqual([{ songTime: 0, pdfY: 0 }]);
  });

  it("handles zero duration safely", () => {
    const anchors = generateCoarseAnchors({ duration: 0, pageCount: 3, pageHeight: 500 });
    expect(anchors.every((a) => a.songTime === 0)).toBe(true);
  });

  it("clamps pageCount 0 to 1", () => {
    const anchors = generateCoarseAnchors({ duration: 100, pageCount: 0, pageHeight: 800 });
    expect(anchors).toEqual([{ songTime: 0, pdfY: 0 }]);
  });

  it("distributes duration fractionally when not evenly divisible", () => {
    const anchors = generateCoarseAnchors({ duration: 100, pageCount: 3, pageHeight: 800 });
    expect(anchors).toHaveLength(3);
    expect(anchors[1].songTime).toBeCloseTo(100 / 3, 5);
    expect(anchors[1].pdfY).toBe(800);
    expect(anchors[2].songTime).toBeCloseTo(200 / 3, 5);
  });
});
