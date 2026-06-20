// Regression tests for useSongStore.unload side-effects on usePracticeStore.
// Bug: unloading the song used to leave practice.enabled = true, so StatsPanel
// kept rendering zero stats and the practice button showed "active but disabled".

import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore } from "@/store/useSongStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { createEmptyStats } from "@/lib/practice";
import type { Song } from "@/types/midi";

function makeSong(): Song {
  return {
    name: "test",
    duration: 1,
    notes: [],
    tracks: [{ index: 0, name: "t", channel: 0 }],
  };
}

function resetStores() {
  useSongStore.setState({ song: null });
  usePracticeStore.setState({
    enabled: false,
    stats: createEmptyStats(),
  });
}

describe("useSongStore.unload", () => {
  beforeEach(resetStores);

  it("clears the loaded song", () => {
    useSongStore.getState().loadSong(makeSong());
    useSongStore.getState().unload();
    expect(useSongStore.getState().song).toBeNull();
  });

  it("disables practice mode and resets stats when practice was on", () => {
    useSongStore.getState().loadSong(makeSong());
    usePracticeStore.getState().setEnabled(true);
    usePracticeStore.setState({
      stats: { hits: 5, wrong: 2, missed: 1, timingSum: 0.05, timingCount: 5 },
    });

    useSongStore.getState().unload();

    expect(usePracticeStore.getState().enabled).toBe(false);
    expect(usePracticeStore.getState().stats).toEqual(createEmptyStats());
  });

  it("resets stats even when practice was already disabled", () => {
    useSongStore.getState().loadSong(makeSong());
    usePracticeStore.setState({
      enabled: false,
      stats: { hits: 9, wrong: 9, missed: 9, timingSum: 1, timingCount: 9 },
    });

    useSongStore.getState().unload();

    expect(usePracticeStore.getState().enabled).toBe(false);
    expect(usePracticeStore.getState().stats).toEqual(createEmptyStats());
  });

  it("is idempotent when called with no song loaded", () => {
    expect(() => useSongStore.getState().unload()).not.toThrow();
    expect(useSongStore.getState().song).toBeNull();
    expect(usePracticeStore.getState().enabled).toBe(false);
  });

  it("does not auto-disable practice when a new song is loaded (loadSong keeps practice)", () => {
    useSongStore.getState().loadSong(makeSong());
    usePracticeStore.getState().setEnabled(true);

    // Load a different song — practice mode should persist (intentional).
    const second = makeSong();
    second.name = "second";
    useSongStore.getState().loadSong(second);

    expect(usePracticeStore.getState().enabled).toBe(true);
    expect(useSongStore.getState().song?.name).toBe("second");
  });
});
