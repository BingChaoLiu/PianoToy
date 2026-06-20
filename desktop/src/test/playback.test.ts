import { describe, it, expect, beforeEach } from "vitest";
import { usePlaybackStore, computeSongTime } from "@/store/usePlaybackStore";
import type { Song } from "@/types/midi";

const fakeSong: Song = {
  name: "test",
  duration: 10,
  notes: [
    { midi: 60, start: 0, duration: 1, velocity: 96 },
    { midi: 62, start: 1, duration: 1, velocity: 96 },
    { midi: 64, start: 2, duration: 1, velocity: 96 },
  ],
  tracks: [{ index: 0 }],
};

describe("computeSongTime (with loop)", () => {
  it("returns 0 with no song", () => {
    expect(computeSongTime(5, 0, null, false, { a: null, b: null })).toBe(0);
  });

  it("returns startT + elapsed when no loop", () => {
    expect(computeSongTime(2, 3, fakeSong, false, { a: null, b: null })).toBe(5);
  });

  it("clamps to duration when not looping", () => {
    expect(computeSongTime(2, 100, fakeSong, false, { a: null, b: null })).toBe(10);
  });

  it("wraps in loop mode", () => {
    expect(computeSongTime(2, 100, fakeSong, true, { a: null, b: null })).toBe(102 % 10);
  });

  it("respects AB loop when both ends set", () => {
    // startT=0, elapsed=100, a=2, b=5, span=3 ? a + ((100-2) % 3) = 2 + (98 % 3) = 2 + 2 = 4
    expect(computeSongTime(0, 100, fakeSong, false, { a: 2, b: 5 })).toBe(4);
  });

  it("uses a=0 when only b set", () => {
    // a=0, b=5, span=5, 100 % 5 = 0
    expect(computeSongTime(0, 100, fakeSong, false, { a: null, b: 5 })).toBe(0);
  });

  it("ignores AB loop if b <= a + 0.1 (returns raw t, no clamp)", () => {
    //  web  b ? b  wrap t ? clamp ? duration
    expect(computeSongTime(0, 100, fakeSong, false, { a: 5, b: 5.05 })).toBe(100);
  });

  it("ignores AB loop if b null", () => {
    expect(computeSongTime(0, 100, fakeSong, false, { a: 5, b: null })).toBe(10);
  });
});

describe("usePlaybackStore (store API)", () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      isPlaying: false,
      playStartCtx: 0,
      playStartSongT: 0,
      tempoScale: 1.0,
      loop: false,
      abLoop: { a: null, b: null },
    });
  });

  it("currentSongTime returns 0 with no song", () => {
    expect(usePlaybackStore.getState().currentSongTime(null)).toBe(0);
  });

  it("currentSongTime returns playStartSongT when not playing", () => {
    usePlaybackStore.setState({ playStartSongT: 3.5 });
    expect(usePlaybackStore.getState().currentSongTime(fakeSong)).toBe(3.5);
  });

  it("seek clamps to [0, duration]", () => {
    usePlaybackStore.getState().seek(-5, fakeSong);
    expect(usePlaybackStore.getState().playStartSongT).toBe(0);
    usePlaybackStore.getState().seek(50, fakeSong);
    expect(usePlaybackStore.getState().playStartSongT).toBe(10);
    usePlaybackStore.getState().seek(5, fakeSong);
    expect(usePlaybackStore.getState().playStartSongT).toBe(5);
  });

  it("seek stops playback", () => {
    usePlaybackStore.setState({ isPlaying: true });
    usePlaybackStore.getState().seek(5, fakeSong);
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("setLoop / setAbLoop / setTempoScale store values", () => {
    usePlaybackStore.getState().setLoop(true);
    expect(usePlaybackStore.getState().loop).toBe(true);
    usePlaybackStore.getState().setAbLoop({ a: 1, b: 4 });
    expect(usePlaybackStore.getState().abLoop).toEqual({ a: 1, b: 4 });
    usePlaybackStore.getState().setTempoScale(2);
    expect(usePlaybackStore.getState().tempoScale).toBe(2);
  });
});
