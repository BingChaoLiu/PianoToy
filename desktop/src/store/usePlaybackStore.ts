// currentSongTime+ play/pause/seek + tempo + loop + abLoop?
//  web ? L1397-1480 currentSongTime  getter?end-of-song ? RAF 

import { create } from "zustand";
import type { Song } from "@/types/midi";
import { clamp } from "@/lib/note-utils";
import { stopAllSynthVoices } from "@/lib/synth";
import { getAudioContext, unlock } from "@/lib/audio-context";

export interface AbLoop { a: number | null; b: number | null; }

/** 
 *
 *  - startT:  
 *  - elapsed: "" tempoScale?
 *  - song:     duration?
 *  - loop:    
 *  - abLoop:  AB 
 */
export function computeSongTime(
  startT: number, elapsed: number, song: Song | null,
  loop: boolean, abLoop: AbLoop,
): number {
  if (!song) return 0;
  let t = startT + elapsed;
  if (abLoop.b !== null) {
    const a = abLoop.a !== null ? abLoop.a : 0;
    const b = abLoop.b;
    if (b > a + 0.1 && t >= b) {
      const span = b - a;
      t = a + ((t - a) % span);
    }
  } else if (t >= song.duration) {
    if (loop) t = t % song.duration;
    else t = song.duration;
  }
  return t;
}

export interface PlaybackState {
  isPlaying: boolean;
  playStartCtx: number;     // AudioContext.currentTime 
  playStartSongT: number;   // 
  tempoScale: number;       // 0.25..2.0
  loop: boolean;
  abLoop: AbLoop;

  /**  wrapper */
  currentSongTime: (song: Song | null) => number;
  play: (song: Song | null) => void;
  pause: () => void;
  seek: (t: number, song: Song | null) => void;
  setTempoScale: (v: number) => void;
  setLoop: (v: boolean) => void;
  setAbLoop: (loop: AbLoop) => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  isPlaying: false,
  playStartCtx: 0,
  playStartSongT: 0,
  tempoScale: 1.0,
  loop: false,
  abLoop: { a: null, b: null },

  currentSongTime: (song) => {
    const s = get();
    if (!song) return 0;
    const ctx = getAudioContext();
    if (!ctx || !s.isPlaying) return s.playStartSongT;
    const elapsed = (ctx.currentTime - s.playStartCtx) * s.tempoScale;
    return computeSongTime(s.playStartSongT, elapsed, song, s.loop, s.abLoop);
  },

  play: (song) => {
    if (!song) return;
    const ctx = unlock();
    if (!ctx) return;
    const s = get();
    const startT = s.playStartSongT >= song.duration ? 0 : s.playStartSongT;
    set({
      isPlaying: true,
      playStartCtx: ctx.currentTime,
      playStartSongT: startT,
    });
  },

  pause: () => {
    const s = get();
    if (!s.isPlaying) return;
    const ctx = getAudioContext();
    // Freeze the current song progress into playStartSongT so a subsequent
    // play() resumes from here. Without this, playStartSongT stays at its
    // original value (e.g. the negative lead offset in score practice), which
    // makes the notes visually rewind to the top while scheduled demo audio
    // keeps going from the pause point — they fall out of sync.
    const now = ctx?.currentTime ?? 0;
    const elapsed = (now - s.playStartCtx) * s.tempoScale;
    set({
      isPlaying: false,
      playStartSongT: s.playStartSongT + elapsed,
      playStartCtx: now,
    });
    stopAllSynthVoices();
  },

  seek: (t, song) => {
    if (!song) return;
    set({ isPlaying: false });
    stopAllSynthVoices();
    const clamped = clamp(t, 0, song.duration);
    set({ playStartSongT: clamped, playStartCtx: getAudioContext()?.currentTime ?? 0 });
  },

  setTempoScale: (v) => {
    const s = get();
    const ctx = getAudioContext();
    if (s.isPlaying && ctx) {
      const songT = s.currentSongTime(null); //  song=null  startT audio 
      set({
        tempoScale: v,
        playStartCtx: ctx.currentTime,
        //  tempo  currentSongTime(song)  songT 
        //  0 
        playStartSongT: songT,
      });
    } else {
      set({ tempoScale: v });
    }
  },

  setLoop: (v) => set({ loop: v }),

  setAbLoop: (loop) => set({ abLoop: loop }),
}));
