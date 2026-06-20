// Pure functions mapping MIDI playback time to a PDF y pixel coordinate via
// piecewise-linear interpolation over user/maintenance-defined anchors.
// The PDF view shares the MIDI clock, so this mapping is what keeps the
// displayed score position synced with the falling notes / audio.

import type { PdfAnchor } from "@/lib/score-storage/types";

/**
 * Map a song time (seconds) to a PDF y coordinate (pixels from top) using
 * piecewise-linear interpolation over `anchors`. Anchors are sorted by
 * songTime internally. Time before the first / after the last anchor is
 * clamped. Empty anchors return 0.
 */
export function interpolatePdfY(songTime: number, anchors: PdfAnchor[]): number {
  if (anchors.length === 0) return 0;
  if (anchors.length === 1) return anchors[0].pdfY;

  const sorted = [...anchors].sort((a, b) => a.songTime - b.songTime);

  if (songTime <= sorted[0].songTime) return sorted[0].pdfY;
  const last = sorted[sorted.length - 1];
  if (songTime >= last.songTime) return last.pdfY;

  // Binary search for the adjacent pair [lo, lo+1] containing songTime.
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].songTime <= songTime) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const dt = b.songTime - a.songTime;
  if (dt <= 0) {
    // Duplicate songTime: prefer the lower-index anchor value (stable).
    return a.pdfY;
  }
  const ratio = (songTime - a.songTime) / dt;
  return a.pdfY + ratio * (b.pdfY - a.pdfY);
}

/**
 * Build an initial set of evenly-spaced anchors for a freshly opened PDF:
 * one anchor per page top, distributing the song duration uniformly. These are
 * a rough starting point the user can refine manually.
 */
export function generateCoarseAnchors(input: {
  duration: number;
  pageCount: number;
  pageHeight: number;
}): PdfAnchor[] {
  const { duration, pageCount, pageHeight } = input;
  const n = Math.max(1, pageCount);
  const anchors: PdfAnchor[] = [];
  for (let i = 0; i < n; i++) {
    anchors.push({
      songTime: (duration * i) / n,
      pdfY: pageHeight * i,
    });
  }
  return anchors;
}
