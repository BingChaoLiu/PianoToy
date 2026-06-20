// Practice 
//  web ? matchLiveNote (L701-729) / updateMissedNotes (L731-742) 

import type { Song } from "@/types/midi";

export interface PracticeStats {
  hits: number;
  wrong: number;
  missed: number;
  timingSum: number;   // |delta| 
  timingCount: number;
}

export function createEmptyStats(): PracticeStats {
  return { hits: 0, wrong: 0, missed: 0, timingSum: 0, timingCount: 0 };
}

export interface MatchInput {
  song: Song;
  midi: number;
  songT: number;
  /**  */
  hitWindow: number;
}

export interface MatchResult {
  kind: "hit" | "wrong";
  /** == */
  deltaTime?: number;
}

/**  */
export function matchLiveNote(input: MatchInput): MatchResult {
  const { song, midi, songT, hitWindow } = input;
  let bestIdx = -1;
  let bestAbs = Infinity;
  for (let i = 0; i < song.notes.length; i++) {
    const n = song.notes[i];
    if (n._matched || n._missed) continue;
    if (n.midi !== midi) continue;
    const delta = songT - n.start;
    if (Math.abs(delta) > hitWindow) continue;
    if (Math.abs(delta) < bestAbs) {
      bestAbs = Math.abs(delta);
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    const n = song.notes[bestIdx];
    const dt = songT - n.start;
    n._matched = true;
    n._deltaTime = dt;
    return { kind: "hit", deltaTime: dt };
  }
  return { kind: "wrong" };
}

export interface MissedUpdate {
  song: Song;
  songT: number;
  hitWindow: number;
}

/** ? RAF  hitWindow  missed? */
export function updateMissedNotes(input: MissedUpdate, stats: PracticeStats): number {
  const { song, songT, hitWindow } = input;
  let newMissed = 0;
  for (const n of song.notes) {
    if (n._matched || n._missed) continue;
    if (songT - n.start > hitWindow) {
      n._missed = true;
      stats.missed++;
      newMissed++;
    }
  }
  return newMissed;
}

/** ? song  _matched/_missed/_deltaTime/_scheduled  */
export function resetNoteFlags(song: Song | null): void {
  if (!song) return;
  for (const n of song.notes) {
    n._matched = false;
    n._missed = false;
    n._deltaTime = null;
    n._scheduled = false;
  }
}

export function accuracy(stats: PracticeStats): number {
  const total = stats.hits + stats.wrong + stats.missed;
  if (total === 0) return 0;
  return stats.hits / total;
}

export function averageDeltaMs(stats: PracticeStats): number | null {
  if (stats.timingCount === 0) return null;
  // timingSum  |delta| 
  return (stats.timingSum / stats.timingCount) * 1000;
}
