// SoundFont engine: lazy-loads SplendidGrandPiano (smplr) from CDN on first use.
// Exposes a tiny noteOn/noteOff/schedule API mirroring the additive synth contract.

import { SplendidGrandPiano, type SplendidGrandPiano as SplendidGrandPianoType } from "smplr";
import { getAudioContext, unlock } from "@/lib/audio-context";

// smplr's default baseUrl points to https://danigb.github.io/smplr/samples/ which serves
// the SplendidGrandPiano layers as Ogg samples. ~6MB total cached via HTTP cache.

let piano: SplendidGrandPianoType | null = null;
let loadingPromise: Promise<SplendidGrandPianoType | null> | null = null;
let loadError: string | null = null;
let loadProgress: { loaded: number; total: number } | null = null;
let progressListeners: Array<(p: { loaded: number; total: number } | null) => void> = [];
let statusListeners: Array<(status: SoundfontStatus) => void> = [];

export type SoundfontStatus =
  | { kind: "idle" }
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function getSplendidStatus(): SoundfontStatus {
  if (loadError) return { kind: "error", message: loadError };
  if (piano) return { kind: "ready" };
  if (loadingPromise) {
    if (loadProgress) return { kind: "loading", ...loadProgress };
    return { kind: "loading", loaded: 0, total: 0 };
  }
  return { kind: "idle" };
}

export function subscribeSplendidStatus(cb: (s: SoundfontStatus) => void): () => void {
  statusListeners.push(cb);
  cb(getSplendidStatus());
  return () => { statusListeners = statusListeners.filter((f) => f !== cb); };
}

function emit() {
  const s = getSplendidStatus();
  for (const cb of statusListeners) cb(s);
}

export async function loadSplendid(): Promise<SplendidGrandPianoType | null> {
  if (piano) return piano;
  if (loadingPromise) return loadingPromise;
  const ctx = getAudioContext();
  if (!ctx) {
    loadError = "AudioContext unavailable";
    emit();
    return null;
  }
  unlock();
  loadingPromise = (async () => {
    try {
      loadProgress = { loaded: 0, total: 0 };
      emit();
      const p = new SplendidGrandPiano(ctx, {
        onLoadProgress: ({ loaded, total }) => {
          loadProgress = { loaded, total };
          emit();
        },
      });
      const loaded = await p.load;
      piano = loaded;
      loadProgress = null;
      loadError = null;
      emit();
      return loaded;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      loadProgress = null;
      emit();
      return null;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

export function isSplendidLoaded(): boolean {
  return piano !== null;
}

/** Live (immediate) note start. Returns true if dispatched. */
export function splendidStart(midi: number, velocity: number): boolean {
  if (!piano) return false;
  try {
    piano.start({ note: midi, velocity: Math.max(1, Math.min(127, velocity | 0)) });
    return true;
  } catch (err) {
    console.warn("[soundfont] start failed", err);
    return false;
  }
}

/** Live (immediate) note stop. */
export function splendidStop(midi: number): boolean {
  if (!piano) return false;
  try {
    piano.stop({ stopId: midi });
    return true;
  } catch (err) {
    console.warn("[soundfont] stop failed", err);
    return false;
  }
}

/** Schedule a note for future playback (used by playback-scheduler for SMF rendering). */
export function splendidSchedule(
  midi: number, velocity: number, startTime: number, duration: number,
): boolean {
  if (!piano) return false;
  try {
    piano.start({
      note: midi,
      velocity: Math.max(1, Math.min(127, velocity | 0)),
      time: startTime,
      duration,
      stopId: midi + 10000 * Math.random(), // unique to allow overlapping same note
    });
    return true;
  } catch (err) {
    console.warn("[soundfont] schedule failed", err);
    return false;
  }
}

export function unloadSplendid(): void {
  if (!piano) return;
  try {
    // smplr's SplendidGrandPiano has a disconnect method on its output channel.
    (piano as unknown as { disconnect?: () => void }).disconnect?.();
  } catch {
    // ignore
  }
  piano = null;
  loadProgress = null;
  loadError = null;
  loadingPromise = null;
  emit();
}

// Subscribe helpers
export function subscribeProgress(cb: (p: { loaded: number; total: number } | null) => void): () => void {
  progressListeners.push(cb);
  cb(loadProgress);
  return () => { progressListeners = progressListeners.filter((f) => f !== cb); };
}
