//  fallback?A S D F G H J K L ; W E T Y U O P 
// Z/X N P Space /Phase 4 ? transport

import { useEffect, useRef } from "react";
import { useInputStore } from "@/store/useInputStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { usePlaybackModeStore } from "@/store/usePlaybackModeStore";
import { useSongStore } from "@/store/useSongStore";
import { useVFXStore } from "@/store/useVFXStore";
import { synthNoteOn, synthNoteOff } from "@/lib/synth";
import { unlock } from "@/lib/audio-context";

/** Practice / */
function handlePractice(midi: number) {
  const practice = usePracticeStore.getState();
  if (!practice.enabled) return;
  const song = useSongStore.getState().song;
  if (!song) return;
  const pb = usePlaybackStore.getState();
  const songT = pb.currentSongTime(song);
  const hitWindow = useSettingsStore.getState().hitWindow;
  const result = practice.match(song, midi, songT, hitWindow);
  
  useInputStore.getState().setMatchResult(midi, result.kind);

  if (result.kind === "hit") {
    useVFXStore.getState().addHitEvent(midi);
  } else {
    useInputStore.getState().flashWrong(midi);
  }
}

const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13,
  l: 14, p: 15, ";": 16,
};

interface HotkeyOptions {
  /** 0..7 */
  octaveRef: React.MutableRefObject<number>;
  /**  UI  */
  onOctaveChange?: (newOctave: number) => void;
  /**  */
  onToggleLabels?: () => void;
  /** Phase 6  */
  onTogglePractice?: () => void;
}

export function useKeyboardHotkeys(opts: HotkeyOptions) {
  const { octaveRef, onOctaveChange, onToggleLabels, onTogglePractice } = opts;
  // Maps lower-cased key -> midi captured at the moment of press. We cannot
  // recompute midi from `octaveRef.current` on keyup: the user may have pressed
  // Z/X between keydown and keyup, which would yield a different midi and strand
  // the original note in the active map forever (stuck-note bug).
  const downRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const midiFromKey = (key: string): number | null => {
      const lower = key.toLowerCase();
      if (!(lower in KEY_MAP)) return null;
      return 12 * (octaveRef.current + 1) + KEY_MAP[lower];
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // 
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " ") {
        // Phase 4 ? transport
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "z") {
        const next = Math.max(0, octaveRef.current - 1);
        octaveRef.current = next;
        onOctaveChange?.(next);
        return;
      }
      if (k === "x") {
        const next = Math.min(7, octaveRef.current + 1);
        octaveRef.current = next;
        onOctaveChange?.(next);
        return;
      }
      if (k === "n") {
        onToggleLabels?.();
        return;
      }
      if (k === "p") {
        onTogglePractice?.();
        return;
      }
      const m = midiFromKey(e.key);
      if (m !== null) {
        // Block keyboard note input in listen-only mode
        if (usePlaybackModeStore.getState().listenOnly) return;
        e.preventDefault();
        downRef.current.set(k, m);
        unlock();
        const synthEnabled = useSettingsStore.getState().synthEnabled;
        useInputStore.getState().onNoteOn(m, 96, "keyboard");
        synthNoteOn(m, 96, synthEnabled);
        handlePractice(m);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_MAP)) return;
      const m = downRef.current.get(k);
      if (m == null) return; // not currently held (or already released)
      downRef.current.delete(k);
      // Critical: use the midi captured at press time, not a fresh computation
      // from `octaveRef.current`, which may have changed via Z/X mid-press.
      useInputStore.getState().onNoteOff(m);
      synthNoteOff(m);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [octaveRef, onOctaveChange, onToggleLabels, onTogglePractice]);
}
