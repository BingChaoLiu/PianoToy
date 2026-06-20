// Synth dispatcher: routes noteOn/noteOff/schedule to the configured backend.
// Backends: 'additive' (built-in oscillator synth) and 'splendid' (smplr SplendidGrandPiano).
// Backends are swappable at runtime via useSettingsStore.synthBackend.

import { midiToFreq } from "@/lib/note-utils";
import { getAudioContext } from "@/lib/audio-context";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  isSplendidLoaded,
  splendidStart,
  splendidStop,
  splendidSchedule,
} from "@/lib/soundfont-engine";

interface Voice {
  oscs: OscillatorNode[];
  masterGain: GainNode;
}

const liveVoices = new Map<number, Voice>();

interface ScheduleOptions {
  /** When true, voice is registered in liveVoices for synthNoteOff to release. */
  registerLive: boolean;
}

function additiveSchedule(
  midi: number, velocity: number, startTime: number, duration: number,
  opts: ScheduleOptions,
): Voice | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const f = midiToFreq(midi);
  const masterGain = ctx.createGain();
  const amp = 0.16 + 0.22 * (velocity / 127);
  masterGain.gain.setValueAtTime(0, startTime);
  masterGain.gain.linearRampToValueAtTime(amp, startTime + 0.005);
  masterGain.gain.exponentialRampToValueAtTime(amp * 0.4, startTime + 0.4);
  masterGain.gain.exponentialRampToValueAtTime(amp * 0.2, startTime + Math.max(0.5, duration));
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.25);
  masterGain.connect(ctx.destination);

  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 2200 + 1500 * (velocity / 127);
  filt.Q.value = 0.6;
  filt.connect(masterGain);

  const partials = [
    { type: "triangle" as OscillatorType, mul: 1.0, detune: 0, ampMul: 1.0 },
    { type: "sine" as OscillatorType, mul: 2.0, detune: 4, ampMul: 0.25 },
    { type: "sine" as OscillatorType, mul: 3.0, detune: -3, ampMul: 0.12 },
  ];
  const oscs = partials.map((p) => {
    const o = ctx.createOscillator();
    o.type = p.type;
    o.frequency.value = f * p.mul;
    o.detune.value = p.detune;
    const og = ctx.createGain();
    og.gain.value = p.ampMul;
    o.connect(og);
    og.connect(filt);
    o.start(startTime);
    o.stop(startTime + duration + 0.3);
    return o;
  });

  const v: Voice = { oscs, masterGain };
  if (opts.registerLive) liveVoices.set(midi, v);
  return v;
}

/** Backend-aware scheduled noteOn (used by playback-scheduler for SMF rendering). */
export function scheduleOscsAt(
  midi: number, velocity: number, startTime: number, duration: number,
  opts: ScheduleOptions,
): Voice | null {
  const backend = useSettingsStore.getState().synthBackend;
  if (backend === "splendid") {
    splendidSchedule(midi, velocity, startTime, duration);
    return null;
  }
  return additiveSchedule(midi, velocity, startTime, duration, opts);
}

/** Live noteOn. Dispatches to the configured backend. */
export function synthNoteOn(midi: number, velocity: number, synthEnabled: boolean): void {
  if (!synthEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const backend = useSettingsStore.getState().synthBackend;
  if (backend === "splendid" && isSplendidLoaded()) {
    if (splendidStart(midi, velocity)) return;
    // Fallback to additive if SoundFont not loaded yet (e.g. still loading)
  }
  if (liveVoices.has(midi)) synthNoteOff(midi);
  additiveSchedule(midi, velocity, ctx.currentTime, 1.5, { registerLive: true });
}

/** Live noteOff. Dispatches to the configured backend. */
export function synthNoteOff(midi: number): void {
  // Always release the additive voice (might be active from a fallback).
  const ctx = getAudioContext();
  if (ctx) {
    const v = liveVoices.get(midi);
    if (v) {
      const now = ctx.currentTime;
      try {
        v.masterGain.gain.cancelScheduledValues(now);
        v.masterGain.gain.setValueAtTime(v.masterGain.gain.value, now);
        v.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        v.oscs.forEach((o) => o.stop(now + 0.3));
      } catch {
        // ignore
      }
      liveVoices.delete(midi);
    }
  }
  // Also tell the SoundFont to release (no-op if not in use).
  if (useSettingsStore.getState().synthBackend === "splendid") {
    splendidStop(midi);
  }
}

export function stopAllSynthVoices(): void {
  const ctx = getAudioContext();
  if (ctx) {
    for (const v of liveVoices.values()) {
      try {
        v.oscs.forEach((o) => o.stop(ctx.currentTime + 0.05));
      } catch {
        // ignore
      }
    }
    liveVoices.clear();
  }
  // SoundFont voices decay naturally; smplr has no global stop-all.
}
