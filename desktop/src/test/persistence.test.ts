import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useSightReadingStore } from "@/store/useSightReadingStore";

describe("settings persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      octave: 4,
      showLabels: true,
      colorMode: "split",
      synthEnabled: true,
      timeWindow: 3.0,
      hitWindow: 0.3,
    });
    useSightReadingStore.setState({
      key: "C", octave: 4, difficulty: "intermediate",
      bars: 4, bpm: 80, lastSeed: null,
    });
  });

  it("settings store writes to localStorage on change", () => {
    useSettingsStore.getState().setOctave(6);
    const raw = localStorage.getItem("piano.settings");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.octave).toBe(6);
  });

  it("sight-reading store writes config but not lastSeed", () => {
    useSightReadingStore.getState().setBpm(120);
    useSightReadingStore.getState().setLastSeed(42);
    const raw = localStorage.getItem("piano.sight-reading");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.bpm).toBe(120);
    expect(parsed.state).not.toHaveProperty("lastSeed");
  });

  it("hitWindow persists in milliseconds via setHitWindow(seconds)", () => {
    useSettingsStore.getState().setHitWindow(0.45);
    const raw = localStorage.getItem("piano.settings");
    const parsed = JSON.parse(raw!);
    expect(parsed.state.hitWindow).toBeCloseTo(0.45, 5);
  });
});
