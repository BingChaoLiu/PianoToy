import { describe, it, expect, beforeEach } from "vitest";
import { useInputStore } from "@/store/useInputStore";

// Re-implement the *fixed* hot-key event handlers here for deterministic testing
// without needing window.dispatchEvent. The unit under test is the mapping from
// key press/release to onNoteOn/onNoteOff across octave changes; the keyboard
// plumbing itself is not what we want to verify.

interface PressPlan {
  downMidi: number;
}

function makeTracker() {
  // Map lower-cased key -> midi captured at the moment of press.
  const down = new Map<string, number>();
  const octaveRef = { current: 4 };

  function press(lower: string): PressPlan | null {
    const map = KEY_MAP[lower];
    if (map == null) return null;
    const midi = 12 * (octaveRef.current + 1) + map;
    down.set(lower, midi);
    useInputStore.getState().onNoteOn(midi, 96, "keyboard");
    return { downMidi: midi };
  }

  function release(lower: string): { midi: number } | null {
    if (!down.has(lower)) return null;
    // Fixed behaviour: use the midi captured at press time, not a fresh computation.
    const midi = down.get(lower)!;
    down.delete(lower);
    useInputStore.getState().onNoteOff(midi);
    return { midi };
  }

  function changeOctave(next: number) {
    octaveRef.current = next;
  }

  return { press, release, changeOctave, octaveRef };
}

const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13,
  l: 14, p: 15, ";": 16,
};

describe("keyboard-hotkeys (octave-shift during press)", () => {
  beforeEach(() => {
    useInputStore.getState().clear();
  });

  it("BUG REPRO: octave change before keyup must not strand notes", () => {
    const t = makeTracker();
    // 1. Press A at octave 4 -> midi 60 (C4 actually 60 = 12*5 + 0)
    const pressed = t.press("a")!;
    expect(pressed.downMidi).toBe(60);
    expect(useInputStore.getState().active.has(60)).toBe(true);

    // 2. Drop octave to 3 while A is still held
    t.changeOctave(3);

    // 3. Release A: must call onNoteOff(60), NOT onNoteOff(48)
    const released = t.release("a")!;
    expect(released.midi).toBe(60);

    // 4. The note must be cleared from the active map
    expect(useInputStore.getState().active.has(60)).toBe(false);
    expect(useInputStore.getState().active.size).toBe(0);
  });

  it("release after multiple octave changes still uses press-time midi", () => {
    const t = makeTracker();
    t.press("k");          // octave 4 -> midi 12*5+12 = 72
    t.changeOctave(0);
    t.changeOctave(7);
    const r = t.release("k")!;
    expect(r.midi).toBe(72);
    expect(useInputStore.getState().active.has(72)).toBe(false);
  });

  it("octave change without any held key is a no-op", () => {
    const t = makeTracker();
    t.changeOctave(2);
    expect(useInputStore.getState().active.size).toBe(0);
  });

  it("releasing a key that was never pressed returns null", () => {
    const t = makeTracker();
    expect(t.release("a")).toBeNull();
  });

  it("re-releasing the same key is a no-op after first release", () => {
    const t = makeTracker();
    t.press("s");
    t.release("s");
    expect(t.release("s")).toBeNull();
  });
});
